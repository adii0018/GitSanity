import * as vscode from 'vscode';
import { runGit } from '../git/gitRunner';
import { detectRepoState } from '../git/repoDetector';
import { getStagedFiles, parseStatusPorcelain } from '../git/stagedFiles';
import { buildCommitMessage } from '../git/commitMessage';
import { ConfigLoader } from '../config/configLoader';
import { redact } from '../git/redact';
import {
  scanStagedFiles,
  logSafeCommitStatsIfNeeded,
  executeGitCommit
} from './safeCommitCore';

export async function safeCommitCommand(
  configLoader: ConfigLoader,
  projectDiagnostics: vscode.DiagnosticCollection,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  // Check workspace trust
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage(
      'GitSanity: Git operations are disabled in untrusted workspaces for security.'
    );
    return;
  }

  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
    return;
  }

  // 1. Pick workspace folder
  let targetFolder = folders[0];
  if (folders.length > 1) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder to commit'
    });
    if (!picked) return;
    targetFolder = picked;
  }

  const root = targetFolder.uri.fsPath;
  const config = configLoader.getConfigFor(targetFolder.uri);

  // 2. Check repo state
  const repoState = await detectRepoState(root);
  if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
    const choice = await vscode.window.showWarningMessage(
      'No Git repository found in this folder.',
      'Create Repository'
    );
    if (choice === 'Create Repository') {
      vscode.commands.executeCommand('gitsanity.createRepository', targetFolder);
    }
    return;
  }

  // 3. Check staged files
  let staged = await getStagedFiles(root);
  if (staged.length === 0) {
    const statusRes = await runGit(['status', '--porcelain=v1', '-z'], root);
    const parsed = parseStatusPorcelain(statusRes.stdout);
    const available = [
      ...parsed.unstaged.map((u) => ({ label: u.path, description: `modified (${u.status})` })),
      ...parsed.untracked.map((u) => ({ label: u, description: 'untracked' }))
    ];

    if (available.length === 0) {
      vscode.window.showInformationMessage('GitSanity: Nothing to commit (working tree clean).');
      return;
    }

    const selected = await vscode.window.showQuickPick(available, {
      canPickMany: true,
      placeHolder: 'No files staged. Select files to stage and commit:'
    });

    if (!selected || selected.length === 0) {
      return;
    }

    const pathsToStage = selected.map((s) => s.label);
    const addRes = await runGit(['add', '--', ...pathsToStage], root);
    if (addRes.code !== 0) {
      vscode.window.showErrorMessage(`GitSanity: Failed to stage files: ${addRes.stderr}`);
      return;
    }

    staged = await getStagedFiles(root);
  }

  // 4. Scan staged index content using reusable core
  const scanRes = await scanStagedFiles(root, config);
  const errors = scanRes.errors;
  const warnings = scanRes.warnings;

  // If error findings exist -> BLOCK COMMIT
  if (errors.length > 0) {
    await logSafeCommitStatsIfNeeded(root, 'blocked', repoState.branch, scanRes.staged.length, errors, warnings);

    const errorRules = Array.from(new Set(errors.map((e) => e.finding.ruleId))).join(', ');
    const choice = await vscode.window.showErrorMessage(
      `GitSanity blocked commit: ${errors.length} error-severity issue(s) detected (${errorRules}).`,
      { modal: true },
      'Show Issues'
    );

    if (choice === 'Show Issues') {
      projectDiagnostics.clear();
      for (const item of [...errors, ...warnings]) {
        const fileUri = vscode.Uri.file(root + '/' + item.file);
        const diag = new vscode.Diagnostic(
          new vscode.Range(
            item.finding.line,
            item.finding.startCol,
            item.finding.line,
            item.finding.endCol
          ),
          item.finding.message,
          item.finding.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'GitSanity';
        diag.code = item.finding.ruleId;
        const current = projectDiagnostics.get(fileUri) ? [...projectDiagnostics.get(fileUri)!] : [];
        current.push(diag);
        projectDiagnostics.set(fileUri, current);
      }
      vscode.commands.executeCommand('workbench.actions.view.problems');
    }
    return;
  }

  // If only warnings exist -> confirm
  if (warnings.length > 0) {
    const proceed = await vscode.window.showWarningMessage(
      `Commit with ${warnings.length} warning(s)?`,
      'Commit anyway',
      'Cancel'
    );
    if (proceed !== 'Commit anyway') {
      return;
    }
  }

  // 5. Branch check
  const warnOnMain = vscode.workspace.getConfiguration('gitsanity').get<boolean>('warnOnMainBranch', true);
  const currentBranch = repoState.branch || 'main';
  const isProtectedBranch =
    currentBranch === 'main' || currentBranch === 'master' || currentBranch.startsWith('HEAD');

  if (warnOnMain && isProtectedBranch) {
    const branchChoice = await vscode.window.showWarningMessage(
      `You are committing directly to protected branch '${currentBranch}'.`,
      { modal: true },
      'Commit anyway',
      'Create new branch'
    );

    if (!branchChoice) return;

    if (branchChoice === 'Create new branch') {
      const newBranchName = await vscode.window.showInputBox({
        prompt: 'Enter new branch name:',
        validateInput: async (val) => {
          if (!val || !val.trim()) return 'Branch name cannot be empty.';
          const checkRes = await runGit(['check-ref-format', '--branch', val.trim()], root);
          return checkRes.code === 0 ? null : 'Invalid branch name according to git ref rules.';
        }
      });

      if (!newBranchName) return;

      const switchRes = await runGit(['switch', '-c', newBranchName.trim()], root);
      if (switchRes.code !== 0) {
        vscode.window.showErrorMessage(`GitSanity: Failed to create branch: ${switchRes.stderr}`);
        return;
      }
    }
  }

  // 6. Commit message suggestion
  const suggestedMsg = buildCommitMessage(staged);
  const userMsg = await vscode.window.showInputBox({
    prompt: 'Enter commit message:',
    value: suggestedMsg,
    validateInput: (val) => (!val || !val.trim() ? 'Commit message cannot be empty.' : null)
  });

  if (!userMsg || !userMsg.trim()) {
    return;
  }

  // 7. Verify user.name / user.email
  if (!repoState.userConfigured) {
    vscode.window.showErrorMessage(
      'GitSanity: git user.name and user.email are not configured. Run:\n' +
        'git config user.name "Your Name"\n' +
        'git config user.email "your.email@example.com"'
    );
    return;
  }

  // 8. Execute commit via core
  const commitRes = await executeGitCommit(root, userMsg.trim(), (line) => outputChannel.appendLine(line));

  if (!commitRes.success) {
    vscode.window.showErrorMessage(
      `GitSanity: Commit failed. Check the 'GitSanity' Output channel for details.`
    );
    return;
  }

  await logSafeCommitStatsIfNeeded(root, 'commit', repoState.branch, scanRes.staged.length, [], warnings);
  const shortHash = commitRes.shortHash || 'HEAD';

  const actionChoice = await vscode.window.showInformationMessage(
    `GitSanity: Committed ${shortHash}`,
    'Push',
    'Undo'
  );

  if (actionChoice === 'Undo') {
    vscode.commands.executeCommand('gitsanity.undoLastCommit', targetFolder);
  } else if (actionChoice === 'Push') {
    const currentRepoState = await detectRepoState(root);
    if (currentRepoState.remotes.length === 0) {
      vscode.commands.executeCommand('gitsanity.publishToGitHub', targetFolder);
      return;
    }

    const upstreamRes = await runGit(['rev-parse', '--abbrev-ref', '@{u}'], root);
    const hasUpstream = upstreamRes.code === 0 && upstreamRes.stdout.trim().length > 0;

    const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', currentRepoState.branch || 'main'];
    outputChannel.appendLine(`[push] git ${pushArgs.join(' ')}`);

    const pushRes = await runGit(pushArgs, root);
    if (pushRes.code !== 0) {
      outputChannel.appendLine(`[push-error] ${redact(pushRes.stderr)}`);
      vscode.window.showErrorMessage(`GitSanity: Push failed: ${redact(pushRes.stderr.split('\n')[0])}`);
    } else {
      vscode.window.showInformationMessage(`GitSanity: Successfully pushed to ${currentRepoState.remotes[0].name}.`);
    }
  }
}
