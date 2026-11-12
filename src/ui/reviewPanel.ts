import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { runGit } from '../git/gitRunner';
import { detectRepoState } from '../git/repoDetector';
import { parseStatusPorcelain } from '../git/stagedFiles';
import { ConfigLoader } from '../config/configLoader';
import {
  scanStagedFiles,
  validateBeforeCommit,
  executeGitCommit,
  logSafeCommitStatsIfNeeded
} from '../commands/safeCommitCore';
import { redact } from '../git/redact';
import {
  buildReviewViewModel,
  renderReviewHtml,
  ReviewFindingView,
  ReviewViewModel
} from './reviewHtml';

export {
  buildReviewViewModel,
  renderReviewHtml,
  ReviewFindingView,
  ReviewViewModel
};

export class ReviewPanelManager {
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static async createOrShow(
    extensionUri: vscode.Uri,
    configLoader: ConfigLoader,
    outputChannel: vscode.OutputChannel
  ): Promise<void> {
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

    let targetFolder = folders[0];
    if (folders.length > 1) {
      const picked = await vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Select workspace folder to review'
      });
      if (!picked) return;
      targetFolder = picked;
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ReviewPanelManager.currentPanel) {
      ReviewPanelManager.currentPanel.reveal(column);
      await ReviewPanelManager.updateContent(
        ReviewPanelManager.currentPanel,
        targetFolder,
        configLoader,
        outputChannel
      );
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsanityReview',
      'GitSanity: Review Before Commit',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: []
      }
    );

    ReviewPanelManager.currentPanel = panel;

    panel.onDidDispose(() => {
      ReviewPanelManager.currentPanel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      const root = targetFolder.uri.fsPath;
      const config = configLoader.getConfigFor(targetFolder.uri);

      if (msg.command === 'refresh') {
        await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
      } else if (msg.command === 'openFile') {
        if (typeof msg.file === 'string') {
          const normRoot = path.resolve(root);
          const filePath = path.resolve(normRoot, msg.file);
          if (filePath === normRoot || filePath.startsWith(normRoot + path.sep)) {
            try {
              const doc = await vscode.workspace.openTextDocument(filePath);
              const line = Math.max(0, (typeof msg.line === 'number' ? msg.line : 1) - 1);
              await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(line, 0, line, 0)
              });
            } catch {}
          }
        }
      } else if (msg.command === 'stageFiles') {
        const statusRes = await runGit(['status', '--porcelain=v1', '-z'], root);
        const parsed = parseStatusPorcelain(statusRes.stdout);
        const available = [
          ...parsed.unstaged.map((u) => ({ label: u.path, description: `modified (${u.status})` })),
          ...parsed.untracked.map((u) => ({ label: u, description: 'untracked' }))
        ];

        if (available.length === 0) {
          vscode.window.showInformationMessage('GitSanity: No unstaged or untracked files.');
          return;
        }

        const selected = await vscode.window.showQuickPick(available, {
          canPickMany: true,
          placeHolder: 'Select files to stage:'
        });

        if (selected && selected.length > 0) {
          const pathsToStage = selected.map((s) => s.label);
          await runGit(['add', '--', ...pathsToStage], root);
          await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
        }
      } else if (msg.command === 'commit') {
        // Strict Extension-Side Validation
        const repoState = await detectRepoState(root);
        const scanRes = await scanStagedFiles(root, config);
        const branch = repoState.branch || 'main';
        const warnOnMain = vscode.workspace
          .getConfiguration('gitsanity')
          .get<boolean>('warnOnMainBranch', true);

        const chk = (msg.checklist || {}) as Record<string, boolean>;
        const checklistTicked =
          Boolean(chk['review-staged']) &&
          (!chk['review-console-log'] || Boolean(chk['review-console-log'])) &&
          (!chk['review-warnings'] || Boolean(chk['review-warnings']));

        const validation = validateBeforeCommit({
          errorsCount: scanRes.errors.length,
          message: msg.message,
          checklistTicked,
          branch,
          confirmMainBranch: Boolean(chk['confirm-branch']),
          warnOnMainBranch: warnOnMain
        });

        if (!validation.valid) {
          vscode.window.showErrorMessage(`GitSanity: ${validation.reason}`);
          await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
          return;
        }

        if (!repoState.userConfigured) {
          vscode.window.showErrorMessage(
            'GitSanity: git user.name and user.email are not configured.'
          );
          return;
        }

        const commitRes = await executeGitCommit(root, msg.message, (line) =>
          outputChannel.appendLine(line)
        );

        if (!commitRes.success) {
          vscode.window.showErrorMessage(
            `GitSanity: Commit failed. Check the 'GitSanity' Output channel for details.`
          );
          return;
        }

        await logSafeCommitStatsIfNeeded(
          root,
          'commit',
          branch,
          scanRes.staged.length,
          [],
          scanRes.warnings
        );

        const shortHash = commitRes.shortHash || 'HEAD';
        panel.dispose();

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
          const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', branch];

          outputChannel.appendLine(`[push] git ${pushArgs.join(' ')}`);
          const pushRes = await runGit(pushArgs, root);
          if (pushRes.code !== 0) {
            outputChannel.appendLine(`[push-error] ${redact(pushRes.stderr)}`);
            vscode.window.showErrorMessage(`GitSanity: Push failed: ${redact(pushRes.stderr.split('\n')[0])}`);
          } else {
            vscode.window.showInformationMessage(
              `GitSanity: Successfully pushed to ${currentRepoState.remotes[0].name}.`
            );
          }
        }
      }
    });

    await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
  }

  private static async updateContent(
    panel: vscode.WebviewPanel,
    folder: vscode.WorkspaceFolder,
    configLoader: ConfigLoader,
    _outputChannel: vscode.OutputChannel
  ): Promise<void> {
    const root = folder.uri.fsPath;
    const config = configLoader.getConfigFor(folder.uri);
    const repoState = await detectRepoState(root);
    const scanRes = await scanStagedFiles(root, config);
    const warnOnMain = vscode.workspace
      .getConfiguration('gitsanity')
      .get<boolean>('warnOnMainBranch', true);

    const model = buildReviewViewModel(
      repoState.branch || 'main',
      scanRes.staged,
      [...scanRes.errors, ...scanRes.warnings],
      warnOnMain
    );

    const nonce = crypto.randomBytes(16).toString('base64');
    panel.webview.html = renderReviewHtml(model, nonce);
  }
}
