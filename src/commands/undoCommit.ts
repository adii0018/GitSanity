import * as vscode from 'vscode';
import { runGit } from '../git/gitRunner';
import { redact } from '../git/redact';

export async function undoLastCommitCommand(folder?: vscode.WorkspaceFolder): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
    return;
  }

  let targetFolder = folder;
  if (!targetFolder) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) return;
    if (folders.length === 1) {
      targetFolder = folders[0];
    } else {
      const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Select repository to undo commit' });
      if (!picked) return;
      targetFolder = picked;
    }
  }

  const root = targetFolder.uri.fsPath;

  // 1. Check if HEAD has a parent
  const parentRes = await runGit(['rev-parse', '--verify', 'HEAD~1'], root);
  if (parentRes.code !== 0) {
    vscode.window.showErrorMessage('GitSanity: Cannot undo initial commit (HEAD has no parent).');
    return;
  }

  // 2. Check if HEAD is a merge commit
  const mergeRes = await runGit(['rev-parse', '--verify', 'HEAD^2'], root);
  if (mergeRes.code === 0) {
    vscode.window.showErrorMessage('GitSanity: Cannot undo merge commit safely.');
    return;
  }

  // 3. Check if HEAD is already reachable from upstream
  const upstreamCheck = await runGit(['rev-parse', '--abbrev-ref', '@{u}'], root);
  if (upstreamCheck.code === 0) {
    // Upstream exists, check unpushed commits
    const unpushedRes = await runGit(['rev-list', '@{u}..HEAD'], root);
    if (unpushedRes.code === 0) {
      const unpushed = unpushedRes.stdout.trim();
      if (!unpushed) {
        vscode.window.showErrorMessage('GitSanity: Cannot undo commit that has already been pushed to upstream.');
        return;
      }
    }
  }

  // Modal confirmation
  const confirm = await vscode.window.showWarningMessage(
    'Undo last commit? Changes will remain staged in your index.',
    { modal: true },
    'Undo Commit'
  );

  if (confirm !== 'Undo Commit') {
    return;
  }

  const resetRes = await runGit(['reset', '--soft', 'HEAD~1'], root);
  if (resetRes.code !== 0) {
    vscode.window.showErrorMessage(`GitSanity: Failed to undo commit: ${redact(resetRes.stderr)}`);
    return;
  }

  vscode.window.showInformationMessage('GitSanity: Successfully undone last commit. Changes remain staged.');
}
