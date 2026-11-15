import * as vscode from 'vscode';
import { runGit } from '../git/gitRunner';
import { ConfigLoader } from '../config/configLoader';
import { scanText, Finding } from '../scanner/scanner';

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  relDate: string;
  subject: string;
}

export async function showCommitActionsCommand(
  commit: CommitInfo,
  configLoader: ConfigLoader,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return;
  const root = folders[0].uri.fsPath;

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: '$(search) Scan Commit for Leaked Secrets',
        description: `Inspect diff of ${commit.shortHash} for secrets`,
        action: 'scan'
      },
      {
        label: '$(file-text) View Changed Files & Summary',
        description: `Show files modified in ${commit.shortHash}`,
        action: 'summary'
      },
      {
        label: '$(clippy) Copy Commit Hash',
        description: commit.shortHash,
        detail: commit.hash,
        action: 'copy'
      },
      {
        label: '$(link-external) Open Commit on GitHub',
        description: 'View commit in web browser',
        action: 'github'
      },
      {
        label: '$(discard) Soft Undo to Here',
        description: 'Reset HEAD to this commit keeping changes staged',
        action: 'undo'
      }
    ],
    { placeHolder: `${commit.shortHash}: ${commit.subject}` }
  );

  if (!choice) return;

  if (choice.action === 'scan') {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `GitSanity: Scanning commit ${commit.shortHash}...`
      },
      async () => {
        const diffRes = await runGit(['show', '--format=', '--patch', commit.hash], root);
        if (diffRes.code !== 0) {
          vscode.window.showErrorMessage(`GitSanity: Could not read commit diff: ${diffRes.stderr}`);
          return;
        }

        const config = configLoader.getConfigFor(folders[0].uri);
        const findings = scanText(diffRes.stdout, {
          rules: config.rules,
          entropyThreshold: config.entropyThreshold,
          entropyMinLength: config.entropyMinLength
        });
        const critical = findings.filter((f: Finding) => f.severity === 'error');

        if (critical.length > 0) {
          const viewChoice = await vscode.window.showErrorMessage(
            `GitSanity ALERT: Found ${critical.length} critical secret(s) in commit ${commit.shortHash}! (${Array.from(new Set(critical.map((c: Finding) => c.ruleId))).join(', ')})`,
            'View Output'
          );
          if (viewChoice === 'View Output') {
            outputChannel.clear();
            outputChannel.appendLine(`=== GitSanity Secret Scan: Commit ${commit.shortHash} ===`);
            outputChannel.appendLine(`Author: ${commit.author} | Date: ${commit.relDate}`);
            outputChannel.appendLine(`Subject: ${commit.subject}\n`);
            critical.forEach((f: Finding) => {
              outputChannel.appendLine(`[CRITICAL] ${f.ruleId} at line ${f.line}: ${f.message}`);
            });
            outputChannel.show();
          }
        } else {
          vscode.window.showInformationMessage(
            `GitSanity: Clean! No leaked secrets found in commit ${commit.shortHash}. ✅`
          );
        }
      }
    );
  } else if (choice.action === 'summary') {
    const statRes = await runGit(['show', '--stat', '--oneline', commit.hash], root);
    outputChannel.clear();
    outputChannel.appendLine(statRes.stdout);
    outputChannel.show();
  } else if (choice.action === 'copy') {
    await vscode.env.clipboard.writeText(commit.hash);
    vscode.window.showInformationMessage(`Copied commit hash ${commit.shortHash} to clipboard.`);
  } else if (choice.action === 'github') {
    const remoteRes = await runGit(['remote', 'get-url', 'origin'], root);
    if (remoteRes.code === 0 && remoteRes.stdout.trim()) {
      let url = remoteRes.stdout.trim().replace(/\.git$/, '');
      if (url.startsWith('git@github.com:')) {
        url = 'https://github.com/' + url.slice('git@github.com:'.length);
      }
      vscode.env.openExternal(vscode.Uri.parse(`${url}/commit/${commit.hash}`));
    } else {
      vscode.window.showWarningMessage('No GitHub origin remote configured for this repository.');
    }
  } else if (choice.action === 'undo') {
    const confirm = await vscode.window.showWarningMessage(
      `Soft-reset to commit ${commit.shortHash}? (Changes will be kept staged)`,
      { modal: true },
      'Reset to here',
      'Cancel'
    );
    if (confirm === 'Reset to here') {
      const resetRes = await runGit(['reset', '--soft', commit.hash], root);
      if (resetRes.code === 0) {
        vscode.window.showInformationMessage(`GitSanity: Reset HEAD to ${commit.shortHash}.`);
        vscode.commands.executeCommand('gitsanity.refreshStatus');
        vscode.commands.executeCommand('gitsanity.refreshGraph');
      } else {
        vscode.window.showErrorMessage(`GitSanity: Reset failed: ${resetRes.stderr}`);
      }
    }
  }
}
