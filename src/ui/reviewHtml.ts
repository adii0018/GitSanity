import { StagedFile } from '../git/stagedFiles';
import { StagedFinding } from '../commands/safeCommitCore';
import { buildCommitMessage } from '../git/commitMessage';
import { escapeHtml } from './htmlEscape';

export interface ReviewFindingView {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  ruleId: string;
  message: string;
}

export interface ReviewViewModel {
  branch: string;
  isMainOrMaster: boolean;
  warnOnMainBranch: boolean;
  stagedFiles: StagedFile[];
  findings: ReviewFindingView[];
  defaultMessage: string;
  checklist: { id: string; label: string }[];
  canCommit: boolean;
  blockReason?: string;
}

export function buildReviewViewModel(
  branch: string,
  stagedFiles: StagedFile[],
  findings: StagedFinding[],
  warnOnMainBranch: boolean
): ReviewViewModel {
  const isMainOrMaster = branch === 'main' || branch === 'master' || branch.startsWith('HEAD');
  const reviewFindings: ReviewFindingView[] = findings.map((f) => ({
    file: f.file,
    line: f.finding.line + 1,
    severity: f.finding.severity === 'error' ? 'error' : 'warning',
    ruleId: f.finding.ruleId,
    message: f.finding.message
  }));

  const errors = reviewFindings.filter((f) => f.severity === 'error');
  const hasConsoleLog = reviewFindings.some((f) => f.ruleId === 'console-log');
  const hasOtherWarnings = reviewFindings.some((f) => f.severity === 'warning' && f.ruleId !== 'console-log');

  const checklist: { id: string; label: string }[] = [
    { id: 'review-staged', label: 'I reviewed the staged changes' }
  ];

  if (hasConsoleLog) {
    checklist.push({ id: 'review-console-log', label: 'I checked the console.log statements' });
  }

  if (hasOtherWarnings) {
    checklist.push({ id: 'review-warnings', label: 'I reviewed the warnings' });
  }

  if (warnOnMainBranch && isMainOrMaster) {
    checklist.push({
      id: 'confirm-branch',
      label: `I really want to commit to protected branch '${branch}'`
    });
  }

  let canCommit = true;
  let blockReason: string | undefined;

  if (stagedFiles.length === 0) {
    canCommit = false;
    blockReason = 'No files staged to commit.';
  } else if (errors.length > 0) {
    canCommit = false;
    blockReason = `${errors.length} error-severity finding(s) detected. Errors must be resolved before committing.`;
  }

  const defaultMessage = buildCommitMessage(stagedFiles);

  return {
    branch,
    isMainOrMaster,
    warnOnMainBranch,
    stagedFiles,
    findings: reviewFindings,
    defaultMessage,
    checklist,
    canCommit,
    blockReason
  };
}

export function renderReviewHtml(model: ReviewViewModel, nonce: string): string {
  const branchWarningHtml =
    model.isMainOrMaster && model.warnOnMainBranch
      ? `<div class="banner banner-warn">
          <span class="banner-icon">⚠️</span>
          <div>
            <strong>Protected Branch Notice:</strong> You are preparing to commit directly to
            <code>${escapeHtml(model.branch)}</code>.
          </div>
        </div>`
      : '';

  const stagedFilesRows =
    model.stagedFiles.length === 0
      ? `<tr><td colspan="2" class="empty-cell">No files staged. Click "Stage Files..." to select changes.</td></tr>`
      : model.stagedFiles
          .map(
            (f) => `<tr>
              <td class="file-path"><code>${escapeHtml(f.path)}</code></td>
              <td><span class="badge badge-status">${escapeHtml(f.status)}</span></td>
            </tr>`
          )
          .join('');

  const findingsRows =
    model.findings.length === 0
      ? `<div class="empty-state">✅ No issues detected in staged files. Ready for review!</div>`
      : `<table class="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Line</th>
              <th>Severity</th>
              <th>Rule</th>
              <th>Message</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${model.findings
              .map(
                (f) => `<tr>
                  <td class="file-path"><code>${escapeHtml(f.file)}</code></td>
                  <td>${f.line}</td>
                  <td><span class="badge badge-${f.severity}">${escapeHtml(f.severity)}</span></td>
                  <td><code>${escapeHtml(f.ruleId)}</code></td>
                  <td>${escapeHtml(f.message)}</td>
                  <td>
                    <button class="btn btn-small" data-action="goto" data-file="${escapeHtml(f.file)}" data-line="${f.line}">Go to</button>
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const checklistItems = model.checklist
    .map(
      (c) => `<label class="checkbox-row">
        <input type="checkbox" id="${escapeHtml(c.id)}" class="review-chk" />
        <span>${escapeHtml(c.label)}</span>
      </label>`
    )
    .join('');

  const blockBanner = model.blockReason
    ? `<div class="banner banner-error">
        <span class="banner-icon">⛔</span>
        <div><strong>Cannot Commit:</strong> ${escapeHtml(model.blockReason)}</div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSanity: Review Before Commit</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border, #333);
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --warn-bg: rgba(234, 179, 8, 0.15);
      --warn-border: #eab308;
      --error-bg: rgba(239, 68, 68, 0.15);
      --error-border: #ef4444;
      --success-fg: var(--vscode-testing-iconPassed, #4ade80);
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      padding: 1.5rem;
      margin: 0;
      line-height: 1.5;
    }
    h1, h2, h3 { margin-top: 0; color: var(--fg); }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .branch-pill {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-family: monospace;
    }
    .banner {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1.25rem;
      align-items: center;
    }
    .banner-warn { background: var(--warn-bg); border-left: 4px solid var(--warn-border); }
    .banner-error { background: var(--error-bg); border-left: 4px solid var(--error-border); }
    .banner-icon { font-size: 1.25rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    .data-table th, .data-table td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .empty-cell { text-align: center; color: var(--vscode-descriptionForeground); font-style: italic; }
    .empty-state {
      padding: 1.5rem;
      text-align: center;
      color: var(--success-fg);
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge-error { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .badge-warning { background: rgba(234, 179, 8, 0.2); color: #facc15; }
    .badge-status { background: var(--btn-sec-bg); color: var(--btn-sec-fg); }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .btn:hover:not(:disabled) { background: var(--btn-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--btn-sec-bg); color: var(--btn-sec-fg); }
    .btn-small { padding: 0.2rem 0.5rem; font-size: 0.8rem; }
    .btn-group { display: flex; gap: 0.5rem; }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.6rem;
      cursor: pointer;
      user-select: none;
    }
    .checkbox-row input { cursor: pointer; width: 16px; height: 16px; }
    .msg-box {
      width: 100%;
      box-sizing: border-box;
      min-height: 80px;
      background: var(--bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.6rem;
      font-family: monospace;
      font-size: 0.9rem;
      resize: vertical;
    }
    .msg-counter {
      text-align: right;
      font-size: 0.8rem;
      color: var(--vscode-descriptionForeground);
      margin-top: 0.25rem;
    }
    .counter-red { color: #f87171; font-weight: bold; }
    .commit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-left">
      <h2>Review Before Commit</h2>
      <span class="branch-pill">🌿 ${escapeHtml(model.branch)}</span>
    </div>
    <div class="btn-group">
      <button id="btn-refresh" class="btn btn-secondary">↻ Refresh</button>
      <button id="btn-stage" class="btn btn-secondary">+ Stage Files...</button>
    </div>
  </div>

  ${branchWarningHtml}
  ${blockBanner}

  <div class="card">
    <h3>Staged Files (${model.stagedFiles.length})</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>Path</th>
          <th style="width: 100px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${stagedFilesRows}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h3>GitSanity Inspection Findings (${model.findings.length})</h3>
    ${findingsRows}
  </div>

  <div class="card">
    <h3>Pre-Commit Checklist</h3>
    <div id="checklist-container">
      ${checklistItems}
    </div>
  </div>

  <div class="card">
    <h3>Commit Message</h3>
    <textarea id="commit-msg" class="msg-box" placeholder="feat: brief summary under 72 chars">${escapeHtml(model.defaultMessage)}</textarea>
    <div id="char-counter" class="msg-counter">0 / 72 characters (first line)</div>
    <div class="commit-actions">
      <button id="btn-commit" class="btn" disabled>Commit</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btnCommit = document.getElementById('btn-commit');
    const btnRefresh = document.getElementById('btn-refresh');
    const btnStage = document.getElementById('btn-stage');
    const commitMsg = document.getElementById('commit-msg');
    const charCounter = document.getElementById('char-counter');
    const checkboxes = Array.from(document.querySelectorAll('.review-chk'));
    const canCommitInitial = ${model.canCommit ? 'true' : 'false'};

    function updateCounter() {
      const text = commitMsg.value || '';
      const firstLine = text.split(/\\r?\\n/)[0] || '';
      const len = firstLine.length;
      charCounter.textContent = len + ' / 72 characters (first line)';
      if (len > 72) {
        charCounter.classList.add('counter-red');
      } else {
        charCounter.classList.remove('counter-red');
      }
    }

    function checkValidity() {
      if (!canCommitInitial) {
        btnCommit.disabled = true;
        return;
      }
      const allChecked = checkboxes.length === 0 || checkboxes.every(c => c.checked);
      const hasMsg = (commitMsg.value || '').trim().length > 0;
      btnCommit.disabled = !(allChecked && hasMsg);
    }

    checkboxes.forEach(c => c.addEventListener('change', checkValidity));
    commitMsg.addEventListener('input', () => {
      updateCounter();
      checkValidity();
    });

    updateCounter();
    checkValidity();

    btnRefresh.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    btnStage.addEventListener('click', () => {
      vscode.postMessage({ command: 'stageFiles' });
    });

    btnCommit.addEventListener('click', () => {
      const chkState = {};
      checkboxes.forEach(c => { chkState[c.id] = c.checked; });
      vscode.postMessage({
        command: 'commit',
        message: commitMsg.value,
        checklist: chkState
      });
    });

    document.querySelectorAll('[data-action="goto"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file');
        const line = parseInt(btn.getAttribute('data-line') || '1', 10);
        vscode.postMessage({ command: 'openFile', file, line });
      });
    });
  </script>
</body>
</html>`;
}
