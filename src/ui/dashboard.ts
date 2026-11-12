import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { resolveGitPaths } from '../git/hookInstaller';
import { readEvents, getEventLogPath, GitSanityEvent } from '../stats/eventLog';
import {
  ProjectScanFileSummary,
  DashboardViewModel,
  buildDashboardViewModel,
  renderBarChartSvg,
  renderDashboardHtml
} from './dashboardHtml';

export {
  ProjectScanFileSummary,
  DashboardViewModel,
  buildDashboardViewModel,
  renderBarChartSvg,
  renderDashboardHtml
};

// In-memory session store of the latest project scan
let sessionProjectScanSummary: ProjectScanFileSummary[] | undefined;

export function setSessionProjectScanSummary(summary: ProjectScanFileSummary[] | undefined): void {
  sessionProjectScanSummary = summary;
}

export function getSessionProjectScanSummary(): ProjectScanFileSummary[] | undefined {
  return sessionProjectScanSummary;
}

export class DashboardPanelManager {
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showErrorMessage(
        'GitSanity: Git operations and stats are disabled in untrusted workspaces.'
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
        placeHolder: 'Select workspace folder for dashboard'
      });
      if (!picked) return;
      targetFolder = picked;
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DashboardPanelManager.currentPanel) {
      DashboardPanelManager.currentPanel.reveal(column);
      await DashboardPanelManager.updateContent(DashboardPanelManager.currentPanel, targetFolder);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsanityDashboard',
      'GitSanity Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: []
      }
    );

    DashboardPanelManager.currentPanel = panel;

    panel.onDidDispose(() => {
      DashboardPanelManager.currentPanel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'installHook') {
        vscode.commands.executeCommand('gitsanity.installHook', targetFolder);
      } else if (msg.command === 'openFile') {
        const filePath = path.join(targetFolder.uri.fsPath, msg.file);
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch {}
      } else if (msg.command === 'resetStats') {
        const confirm = await vscode.window.showWarningMessage(
          'Reset all GitSanity statistics for this repository?',
          { modal: true },
          'Reset'
        );
        if (confirm === 'Reset') {
          try {
            const { commonDir } = await resolveGitPaths(targetFolder.uri.fsPath);
            const logPath = getEventLogPath(commonDir);
            if (fs.existsSync(logPath)) {
              await fs.promises.unlink(logPath);
            }
            vscode.window.showInformationMessage('GitSanity: Statistics reset successfully.');
            await DashboardPanelManager.updateContent(panel, targetFolder);
          } catch (err) {
            vscode.window.showErrorMessage(`GitSanity: Failed to reset statistics.`);
          }
        }
      }
    });

    await DashboardPanelManager.updateContent(panel, targetFolder);
  }

  private static async updateContent(
    panel: vscode.WebviewPanel,
    folder: vscode.WorkspaceFolder
  ): Promise<void> {
    const root = folder.uri.fsPath;
    let events: GitSanityEvent[] = [];
    try {
      const { commonDir } = await resolveGitPaths(root);
      const logPath = getEventLogPath(commonDir);
      events = await readEvents(logPath);
    } catch {}

    const model = buildDashboardViewModel(
      events,
      new Date(),
      getSessionProjectScanSummary()
    );

    const nonce = crypto.randomBytes(16).toString('base64');
    panel.webview.html = renderDashboardHtml(model, nonce);
  }
}
