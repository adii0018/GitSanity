import * as vscode from 'vscode';
import { detectRepoState } from '../git/repoDetector';

const sessionCheckedFolders = new Set<string>();

export async function checkRepoPromptsOnOpen(context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    return;
  }

  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    return;
  }

  const config = vscode.workspace.getConfiguration('gitsanity');
  const promptEnabled = config.get<boolean>('promptOnOpen', true);
  if (!promptEnabled) {
    return;
  }

  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }

    const folderKey = folder.uri.fsPath;
    if (sessionCheckedFolders.has(folderKey)) {
      continue;
    }
    sessionCheckedFolders.add(folderKey);

    const dismissedKey = `gitsanity.dismissedPrompt.${folderKey}`;
    const isDismissed = context.workspaceState.get<boolean>(dismissedKey, false);
    if (isDismissed) {
      continue;
    }

    try {
      const stateResult = await detectRepoState(folder.uri.fsPath);

      if (stateResult.state === 'no-repo') {
        const choice = await vscode.window.showInformationMessage(
          'This folder is not a Git repository.',
          'Create Repository',
          'Not now',
          "Don't ask again"
        );

        if (choice === 'Create Repository') {
          vscode.commands.executeCommand('gitsanity.createRepository', folder);
        } else if (choice === "Don't ask again") {
          await context.workspaceState.update(dismissedKey, true);
        }
      } else if (stateResult.state === 'local-repo' || stateResult.state === 'remote-repo') {
        const scanOfferedKey = `gitsanity.offeredScan.${folderKey}`;
        const scanOffered = context.workspaceState.get<boolean>(scanOfferedKey, false);
        if (!scanOffered) {
          await context.workspaceState.update(scanOfferedKey, true);

          const choice = await vscode.window.showInformationMessage(
            'Scan the entire project with GitSanity?',
            'Scan Project',
            'Not now',
            "Don't ask again"
          );

          if (choice === 'Scan Project') {
            vscode.commands.executeCommand('gitsanity.scanProject', folder);
          } else if (choice === "Don't ask again") {
            await context.workspaceState.update(dismissedKey, true);
          }
        }
      }
    } catch {}
  }
}
