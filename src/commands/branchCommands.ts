import * as vscode from 'vscode';
import { runGit } from '../git/gitRunner';
import { detectRepoState } from '../git/repoDetector';
import { redact } from '../git/redact';
import { validateBranchName } from '../git/branchValidation';

export { validateBranchName };

export async function switchBranchCommand(targetFolder?: vscode.WorkspaceFolder): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
    return;
  }

  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return;
  const folder = targetFolder || folders[0];
  const root = folder.uri.fsPath;

  const repoState = await detectRepoState(root);
  if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
    vscode.window.showWarningMessage('GitSanity: No Git repository found in this folder.');
    return;
  }

  const currentBranch = repoState.branch || '';

  // 1. Fetch all branches
  const branchRes = await runGit(['branch', '-a', '--format=%(refname:short)|%(HEAD)'], root);
  const branchLines =
    branchRes.code === 0 ? branchRes.stdout.trim().split(/\r?\n/).filter(Boolean) : [];

  const localBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const line of branchLines) {
    const [name] = line.split('|');
    if (!name) continue;
    if (name.startsWith('origin/') || name.includes('/')) {
      if (!name.endsWith('/HEAD')) {
        remoteBranches.push(name);
      }
    } else {
      localBranches.push(name);
    }
  }

  interface BranchPickItem extends vscode.QuickPickItem {
    action: 'create' | 'switch';
    branchName?: string;
  }

  const items: BranchPickItem[] = [
    {
      label: '$(plus) Create New Branch...',
      description: 'Create and switch to a new branch following Git naming rules',
      action: 'create'
    }
  ];

  if (localBranches.length > 0) {
    items.push({
      label: 'Local Branches',
      kind: vscode.QuickPickItemKind.Separator,
      action: 'switch'
    });

    for (const b of localBranches) {
      const isCurrent = b === currentBranch;
      items.push({
        label: isCurrent ? `$(check) ${b}` : `$(git-branch) ${b}`,
        description: isCurrent ? '(current)' : '',
        action: 'switch',
        branchName: b
      });
    }
  }

  if (remoteBranches.length > 0) {
    items.push({
      label: 'Remote Branches',
      kind: vscode.QuickPickItemKind.Separator,
      action: 'switch'
    });

    for (const r of remoteBranches) {
      items.push({
        label: `$(cloud) ${r}`,
        description: 'Checkout remote tracking branch',
        action: 'switch',
        branchName: r
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Current branch: ${currentBranch || 'none'}. Switch branch or create new:`
  });

  if (!picked) return;

  if (picked.action === 'create') {
    const branchName = await vscode.window.showInputBox({
      prompt: 'Enter new branch name (e.g., feat/new-feature, fix/bug-123):',
      placeHolder: 'feature/my-branch',
      validateInput: async (val) => {
        const staticErr = validateBranchName(val);
        if (staticErr) return staticErr;

        const checkRes = await runGit(['check-ref-format', '--branch', val.trim()], root);
        if (checkRes.code !== 0) {
          return 'Invalid branch name according to git ref rules.';
        }

        const existsRes = await runGit(['rev-parse', '--verify', `refs/heads/${val.trim()}`], root);
        if (existsRes.code === 0) {
          return `A branch named '${val.trim()}' already exists.`;
        }

        return null;
      }
    });

    if (!branchName || !branchName.trim()) return;

    const trimmed = branchName.trim();
    let createRes = await runGit(['switch', '-c', trimmed], root);
    if (createRes.code !== 0) {
      createRes = await runGit(['checkout', '-b', trimmed], root);
    }

    if (createRes.code !== 0) {
      vscode.window.showErrorMessage(`GitSanity: Failed to create branch: ${redact(createRes.stderr)}`);
      return;
    }

    vscode.window.showInformationMessage(`GitSanity: Created and switched to branch '${trimmed}'.`);
    vscode.commands.executeCommand('gitsanity.refreshStatus');
    vscode.commands.executeCommand('gitsanity.refreshGraph');
    return;
  }

  if (picked.action === 'switch' && picked.branchName) {
    if (picked.branchName === currentBranch) {
      vscode.window.showInformationMessage(`Already on branch '${currentBranch}'.`);
      return;
    }

    const target = picked.branchName;
    let args = ['switch', target];
    if (target.startsWith('origin/')) {
      const localName = target.slice('origin/'.length);
      args = ['switch', '-c', localName, '--track', target];
    }

    let switchRes = await runGit(args, root);
    if (switchRes.code !== 0) {
      const checkoutTarget = target.startsWith('origin/') ? target.slice('origin/'.length) : target;
      switchRes = await runGit(['checkout', checkoutTarget], root);
    }

    if (switchRes.code !== 0) {
      vscode.window.showErrorMessage(
        `GitSanity: Failed to switch branch: ${redact(switchRes.stderr.split(/\r?\n/)[0])}`
      );
      return;
    }

    vscode.window.showInformationMessage(`GitSanity: Switched to branch '${target}'.`);
    vscode.commands.executeCommand('gitsanity.refreshStatus');
    vscode.commands.executeCommand('gitsanity.refreshGraph');
  }
}
