"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardViewModel = buildDashboardViewModel;
exports.renderBarChartSvg = renderBarChartSvg;
exports.renderDashboardHtml = renderDashboardHtml;
const stats_1 = require("../stats/stats");
const htmlEscape_1 = require("./htmlEscape");
function buildDashboardViewModel(events, now = new Date(), projectScanSummary) {
    const currentStreak = (0, stats_1.computeStreak)(events);
    const bestStreak = (0, stats_1.computeBestStreak)(events);
    const milestoneData = (0, stats_1.milestones)(currentStreak, bestStreak);
    const trend = (0, stats_1.weeklyTrend)(events, 8, now);
    const mistakes = (0, stats_1.topRules)(events, 5);
    let totalCommits = 0;
    let totalBlocked = 0;
    for (const ev of events) {
        if (ev.type === 'commit')
            totalCommits++;
        if (ev.type === 'blocked')
            totalBlocked++;
    }
    const hasData = events.length > 0;
    return {
        currentStreak,
        bestStreak,
        milestones: milestoneData,
        totalCommits,
        totalBlocked,
        weeklyTrend: trend,
        topMistakes: mistakes,
        projectScanSummary,
        hasData
    };
}
function renderBarChartSvg(trend) {
    const width = 520;
    const height = 180;
    const paddingBottom = 35;
    const paddingTop = 25;
    const paddingLeft = 30;
    const chartHeight = height - paddingTop - paddingBottom;
    const chartWidth = width - paddingLeft - 20;
    const maxIssues = Math.max(1, ...trend.map((t) => t.issues));
    const numBars = trend.length;
    const barWidth = Math.max(16, Math.floor(chartWidth / (numBars * 1.6)));
    const gap = Math.floor((chartWidth - numBars * barWidth) / Math.max(1, numBars - 1));
    let barsSvg = '';
    trend.forEach((t, i) => {
        const barHeight = Math.round((t.issues / maxIssues) * chartHeight);
        const x = paddingLeft + i * (barWidth + gap);
        const y = paddingTop + (chartHeight - barHeight);
        const hasIssues = t.issues > 0;
        const barColor = hasIssues ? 'var(--vscode-button-background, #3b82f6)' : 'var(--vscode-widget-border, #444)';
        barsSvg += `
      <g class="bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${barColor}" opacity="${hasIssues ? '0.9' : '0.4'}">
          <title>${(0, htmlEscape_1.escapeHtml)(t.weekLabel)}: ${t.issues} issues (${t.errors} errors, ${t.warnings} warnings)</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 6}" font-size="11" text-anchor="middle" fill="var(--vscode-foreground, #ccc)">${t.issues > 0 ? t.issues : ''}</text>
        <text x="${x + barWidth / 2}" y="${height - 12}" font-size="10" text-anchor="middle" fill="var(--vscode-descriptionForeground, #888)">${(0, htmlEscape_1.escapeHtml)(t.weekLabel)}</text>
      </g>`;
    });
    return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">
      <line x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - 15}" y2="${paddingTop + chartHeight}" stroke="var(--vscode-widget-border, #444)" stroke-width="1" />
      ${barsSvg}
    </svg>`;
}
function renderDashboardHtml(model, nonce) {
    if (!model.hasData) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSanity Dashboard</title>
  <style>
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family, sans-serif);
      padding: 3rem 1.5rem;
      text-align: center;
      line-height: 1.6;
    }
    .empty-card {
      max-width: 500px;
      margin: 0 auto;
      background: var(--vscode-editorWidget-background, #1e1e1e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 8px;
      padding: 2.5rem 2rem;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h2 { margin-top: 0; }
    p { color: var(--vscode-descriptionForeground, #aaa); margin-bottom: 2rem; }
    .btn {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
      border: none;
      padding: 0.6rem 1.25rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  </style>
</head>
<body>
  <div class="empty-card">
    <div class="icon">📊</div>
    <h2>No GitSanity Statistics Yet</h2>
    <p>Statistics and clean commit streaks begin recording automatically once you install the GitSanity pre-commit hook or use <strong>GitSanity: Safe Commit</strong>.</p>
    <button id="btn-install" class="btn">Install Git Hook</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-install').addEventListener('click', () => {
      vscode.postMessage({ command: 'installHook' });
    });
  </script>
</body>
</html>`;
    }
    // Milestone Badges HTML
    const milestoneLabels = [
        { target: 7, title: '7 Clean Commits', desc: 'First Week Champion' },
        { target: 30, title: '30 Clean Commits', desc: 'Monthly Guardian' },
        { target: 100, title: '100 Clean Commits', desc: 'GitSanity Master' }
    ];
    const badgesHtml = milestoneLabels
        .map((m) => {
        const isReached = model.milestones.reached.includes(m.target);
        return `<div class="badge-card ${isReached ? 'badge-reached' : 'badge-locked'}">
        <div class="badge-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="${isReached ? '#eab308' : 'gray'}">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
        </div>
        <div class="badge-info">
          <div class="badge-title">${(0, htmlEscape_1.escapeHtml)(m.title)}</div>
          <div class="badge-desc">${(0, htmlEscape_1.escapeHtml)(m.desc)}</div>
          <div class="badge-state">${isReached ? '🏆 Unlocked' : '🔒 Locked'}</div>
        </div>
      </div>`;
    })
        .join('');
    // Weekly Trend Table Fallback
    const trendTableRows = model.weeklyTrend
        .map((t) => `<tr>
        <td>${(0, htmlEscape_1.escapeHtml)(t.weekLabel)}</td>
        <td>${t.issues}</td>
        <td>${t.errors}</td>
        <td>${t.warnings}</td>
        <td>${t.commits}</td>
      </tr>`)
        .join('');
    // Top Mistakes Rows
    const mistakesRows = model.topMistakes.length === 0
        ? `<tr><td colspan="2" class="empty-cell">No mistakes recorded! Great job!</td></tr>`
        : model.topMistakes
            .map((m) => `<tr>
              <td><code>${(0, htmlEscape_1.escapeHtml)(m.ruleId)}</code></td>
              <td style="text-align: right;"><strong>${m.count}</strong></td>
            </tr>`)
            .join('');
    // Project Scan Rows
    const scanRows = !model.projectScanSummary || model.projectScanSummary.length === 0
        ? `<p class="empty-cell">No project scan run in this session. Run <strong>GitSanity: Scan Entire Project</strong> to audit all files.</p>`
        : `<table class="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th style="width: 80px; text-align: center;">Errors</th>
              <th style="width: 80px; text-align: center;">Warnings</th>
              <th style="width: 70px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${model.projectScanSummary
            .slice(0, 5)
            .map((f) => `<tr>
                  <td class="file-path"><code>${(0, htmlEscape_1.escapeHtml)(f.file)}</code></td>
                  <td style="text-align: center;"><span class="badge badge-error">${f.errors}</span></td>
                  <td style="text-align: center;"><span class="badge badge-warning">${f.warnings}</span></td>
                  <td style="text-align: right;">
                    <button class="btn btn-small" data-action="open-file" data-file="${(0, htmlEscape_1.escapeHtml)(f.file)}">Open</button>
                  </td>
                </tr>`)
            .join('')}
          </tbody>
        </table>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSanity Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-widget-border, #333);
      --card-bg: var(--vscode-editorWidget-background, #1e1e1e);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, sans-serif);
      padding: 1.5rem;
      margin: 0;
      line-height: 1.5;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem;
    }
    .stat-hero {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }
    .stat-num {
      font-size: 2.75rem;
      font-weight: 700;
      color: #38bdf8;
      line-height: 1;
    }
    .stat-sub {
      color: var(--vscode-descriptionForeground, #aaa);
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }
    .badges-container {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .badge-card {
      flex: 1;
      min-width: 140px;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
    }
    .badge-reached { border-color: rgba(234, 179, 8, 0.4); }
    .badge-locked { opacity: 0.5; }
    .badge-title { font-weight: 600; font-size: 0.85rem; }
    .badge-desc { font-size: 0.75rem; color: var(--vscode-descriptionForeground, #aaa); }
    .badge-state { font-size: 0.75rem; font-weight: 500; margin-top: 0.2rem; }
    .chart-container {
      width: 100%;
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .chart-svg {
      width: 100%;
      max-width: 600px;
      height: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .data-table th, .data-table td {
      padding: 0.45rem 0.6rem;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .badge {
      display: inline-block;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .badge-error { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .badge-warning { background: rgba(234, 179, 8, 0.2); color: #facc15; }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 0.45rem 0.9rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .btn-danger { background: rgba(239, 68, 68, 0.8); }
    .btn-danger:hover { background: #dc2626; }
    .btn-small { padding: 0.2rem 0.4rem; font-size: 0.75rem; }
    details { margin-top: 1rem; font-size: 0.85rem; cursor: pointer; }
    summary { color: var(--vscode-descriptionForeground, #aaa); }
    .empty-cell { color: var(--vscode-descriptionForeground, #aaa); font-style: italic; }
  </style>
</head>
<body>
  <div class="header-bar">
    <h2>GitSanity Dashboard</h2>
    <button id="btn-reset" class="btn btn-danger">Reset Stats</button>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3>Clean Commit Streak</h3>
      <div class="stat-hero">
        <div class="stat-num">${model.currentStreak}</div>
        <div>
          <div><strong>Current Streak</strong> (${model.currentStreak} clean commits)</div>
          <div class="stat-sub">Personal Best: <strong>${model.bestStreak}</strong> clean commits</div>
          <div class="stat-sub">Total Commits: ${model.totalCommits} | Blocked Attempts: ${model.totalBlocked}</div>
        </div>
      </div>
      <div class="badges-container">
        ${badgesHtml}
      </div>
    </div>

    <div class="card">
      <h3>Top 5 Common Mistakes</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th style="text-align: right;">Occurrences</th>
          </tr>
        </thead>
        <tbody>
          ${mistakesRows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card" style="margin-bottom: 1.5rem;">
    <h3>Weekly Issue Trend (Last 8 Weeks)</h3>
    <div class="chart-container">
      ${renderBarChartSvg(model.weeklyTrend)}
    </div>
    <details>
      <summary>Accessible Data Table</summary>
      <table class="data-table" style="margin-top: 0.5rem;">
        <thead>
          <tr>
            <th>Week</th>
            <th>Issues</th>
            <th>Errors</th>
            <th>Warnings</th>
            <th>Commits</th>
          </tr>
        </thead>
        <tbody>
          ${trendTableRows}
        </tbody>
      </table>
    </details>
  </div>

  <div class="card">
    <h3>Latest Project Scan Summary</h3>
    ${scanRows}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-reset').addEventListener('click', () => {
      vscode.postMessage({ command: 'resetStats' });
    });
    document.querySelectorAll('[data-action="open-file"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file');
        vscode.postMessage({ command: 'openFile', file });
      });
    });
  </script>
</body>
</html>`;
}
//# sourceMappingURL=dashboardHtml.js.map