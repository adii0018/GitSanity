import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { ProjectScanResult } from '../scanner/projectScanner';
import { RepoStateResult } from '../git/repoDetector';
import { HistoryFinding } from '../git/historyScanner';
import { escapeHtml } from './htmlEscape';

export interface HealthReportData {
  folder: vscode.WorkspaceFolder;
  repoState: RepoStateResult;
  isHookInstalled: boolean;
  scanResult: ProjectScanResult;
  envIgnored: boolean;
  trackedEnvFiles: string[];
  nodeModulesIgnored: boolean;
  largeFiles: { path: string; sizeMB: number }[];
  historyFindings?: HistoryFinding[];
}

export class HealthReportPanel {
  public static currentPanel: HealthReportPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile':
            if (message.file && message.folderPath) {
              const fullPath = path.join(message.folderPath, message.file);
              try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
                await vscode.window.showTextDocument(doc);
              } catch {}
            }
            break;
          case 'rescan':
            vscode.commands.executeCommand('gitsanity.scanProject');
            break;
          case 'scanHistory':
            vscode.commands.executeCommand('gitsanity.scanHistory');
            break;
          case 'installHook':
            vscode.commands.executeCommand('gitsanity.installHook');
            break;
          case 'createRepo':
            vscode.commands.executeCommand('gitsanity.createRepository');
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static show(data: HealthReportData): HealthReportPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (HealthReportPanel.currentPanel) {
      HealthReportPanel.currentPanel.panel.reveal(column);
      HealthReportPanel.currentPanel.update(data);
      return HealthReportPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsanityHealthReport',
      'GitSanity Health Report',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true
      }
    );

    HealthReportPanel.currentPanel = new HealthReportPanel(panel);
    HealthReportPanel.currentPanel.update(data);
    return HealthReportPanel.currentPanel;
  }

  public update(data: HealthReportData): void {
    const nonce = crypto.randomBytes(16).toString('base64');
    this.panel.webview.html = this.renderHtml(data, nonce);
  }

  private renderHtml(data: HealthReportData, nonce: string): string {
    const { repoState, isHookInstalled, scanResult, envIgnored, trackedEnvFiles, nodeModulesIgnored, largeFiles, historyFindings } = data;

    const totalIssues = scanResult.countsBySeverity.error + scanResult.countsBySeverity.warning;

    // Top 10 files by issue count
    const topFiles = Array.from(scanResult.byFile.entries())
      .map(([file, findings]) => ({ file, count: findings.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Rule counts
    const maxRuleCount = Math.max(...Object.values(scanResult.countsByRule), 1);
    const ruleBarsHtml = Object.entries(scanResult.countsByRule)
      .map(([rule, count]) => {
        const pct = Math.round((count / maxRuleCount) * 100);
        return `
          <div class="rule-bar-row">
            <div class="rule-name">${escapeHtml(rule)} (${count})</div>
            <div class="bar-container"><div class="bar-fill" style="width: ${pct}%;"></div></div>
          </div>
        `;
      })
      .join('');

    const topFilesHtml =
      topFiles.length === 0
        ? '<p class="pass-text">✓ No issues found across scanned files!</p>'
        : topFiles
            .map(
              (f) => `
          <li>
            <a href="#" class="file-link" data-file="${escapeHtml(f.file)}" data-folder="${escapeHtml(data.folder.uri.fsPath)}">${escapeHtml(f.file)}</a>
            <span class="badge">${f.count} issue${f.count === 1 ? '' : 's'}</span>
          </li>
        `
            )
            .join('');

    const trackedEnvHtml =
      trackedEnvFiles.length === 0
        ? '<span class="status-pass">✓ None tracked (PASS)</span>'
        : `<span class="status-fail">✗ Tracked env files detected: ${escapeHtml(trackedEnvFiles.join(', '))}</span>`;

    const envIgnoredHtml = envIgnored
      ? '<span class="status-pass">✓ Ignored in .gitignore (PASS)</span>'
      : '<span class="status-fail">✗ .env is NOT ignored in .gitignore (FAIL)</span>';

    const nodeModulesHtml = nodeModulesIgnored
      ? '<span class="status-pass">✓ node_modules/ ignored (PASS)</span>'
      : '<span class="status-fail">✗ node_modules/ is not ignored in .gitignore (FAIL)</span>';

    const largeFilesHtml =
      largeFiles.length === 0
        ? '<p class="pass-text">✓ No large tracked files above limit.</p>'
        : `<ul>${largeFiles
            .map((lf) => `<li>${escapeHtml(lf.path)} <span class="badge">${lf.sizeMB.toFixed(1)} MB</span></li>`)
            .join('')}</ul>`;

    let historySection = '';
    if (historyFindings) {
      if (historyFindings.length === 0) {
        historySection = '<p class="pass-text">✓ No secret leaks found in scanned Git history commits.</p>';
      } else {
        historySection = `
          <p class="status-fail">Found ${historyFindings.length} secret finding(s) in Git history:</p>
          <ul>
            ${historyFindings
              .slice(0, 15)
              .map(
                (h) => `
              <li>
                <strong>${escapeHtml(h.commitShort)}</strong> ${escapeHtml(h.file)}:
                <em>${escapeHtml(h.ruleId)}</em> (${escapeHtml(h.redactedPreview)})
              </li>
            `
              )
              .join('')}
          </ul>
          <p class="warning-note">⚠️ Note: Deleting secrets from working files does not erase them from Git history. Rotate any exposed credentials immediately.</p>
        `;
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSanity Health Report</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px;
      line-height: 1.5;
    }
    h1, h2, h3 { color: var(--vscode-titleBar-activeForeground, inherit); }
    .card {
      background: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
      border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .counts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 12px 0;
    }
    .count-box {
      background: var(--vscode-badge-background, rgba(128,128,128,0.2));
      color: var(--vscode-badge-foreground, inherit);
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .count-num { font-size: 24px; font-weight: bold; }
    .rule-bar-row { margin: 8px 0; }
    .bar-container {
      background: rgba(128,128,128,0.2);
      border-radius: 4px;
      height: 10px;
      overflow: hidden;
    }
    .bar-fill {
      background: var(--vscode-progressBar-background, #007acc);
      height: 100%;
    }
    .status-pass { color: var(--vscode-testing-iconPassed, #4caf50); font-weight: 600; }
    .status-fail { color: var(--vscode-testing-iconFailed, #f44336); font-weight: 600; }
    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(128,128,128,0.3);
      margin-left: 8px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 8px;
      margin-top: 8px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    ul { padding-left: 20px; }
    .warning-note { font-size: 12px; opacity: 0.85; font-style: italic; }
    a.file-link { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
    a.file-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>GitSanity Repository Health Report</h1>
  <p>Workspace: <strong>${escapeHtml(data.folder.name)}</strong></p>

  <div class="card">
    <h2>Repository State</h2>
    <p>Status: <strong>${escapeHtml(repoState.state)}</strong> | Branch: <strong>${escapeHtml(repoState.branch || 'none')}</strong></p>
    <p>Pre-commit Hook: <strong>${isHookInstalled ? '<span class="status-pass">Installed (Active)</span>' : '<span class="status-fail">Not Installed</span>'}</strong></p>
    <div>
      <button id="btn-rescan">Re-scan Project</button>
      <button id="btn-history">Scan Git History</button>
      ${!isHookInstalled ? '<button id="btn-hook">Install Git Hook</button>' : ''}
      ${repoState.state === 'no-repo' ? '<button id="btn-init">Create Repository</button>' : ''}
    </div>
  </div>

  <div class="card">
    <h2>Scan Summary</h2>
    <div class="counts-grid">
      <div class="count-box"><div class="count-num">${scanResult.filesScanned}</div>Files Scanned</div>
      <div class="count-box"><div class="count-num">${scanResult.countsBySeverity.error}</div>Errors</div>
      <div class="count-box"><div class="count-num">${scanResult.countsBySeverity.warning}</div>Warnings</div>
      <div class="count-box"><div class="count-num">${totalIssues}</div>Total Issues</div>
    </div>
    ${scanResult.capped ? '<p class="warning-note">⚠️ File limit reached: scan capped at maxProjectFiles limit.</p>' : ''}
  </div>

  <div class="card">
    <h2>Issues by Rule</h2>
    ${Object.keys(scanResult.countsByRule).length === 0 ? '<p class="pass-text">✓ No issues by rule.</p>' : ruleBarsHtml}
  </div>

  <div class="card">
    <h2>Top Issue Files</h2>
    <ul>${topFilesHtml}</ul>
  </div>

  <div class="card">
    <h2>Repository Hygiene Checks</h2>
    <p>Environment files ignored: ${envIgnoredHtml}</p>
    <p>Tracked .env files: ${trackedEnvHtml}</p>
    <p>Node modules ignored: ${nodeModulesHtml}</p>
  </div>

  <div class="card">
    <h2>Large Tracked Files (&gt; ${data.scanResult ? 5 : 5} MB)</h2>
    ${largeFilesHtml}
  </div>

  ${
    historyFindings !== undefined
      ? `
  <div class="card">
    <h2>Git History Leak Check</h2>
    ${historySection}
  </div>`
      : ''
  }

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('btn-rescan')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'rescan' });
    });
    document.getElementById('btn-history')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'scanHistory' });
    });
    document.getElementById('btn-hook')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'installHook' });
    });
    document.getElementById('btn-init')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'createRepo' });
    });

    document.querySelectorAll('.file-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const file = el.getAttribute('data-file');
        const folderPath = el.getAttribute('data-folder');
        vscode.postMessage({ command: 'openFile', file, folderPath });
      });
    });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    HealthReportPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
