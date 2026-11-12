import * as assert from 'assert';
import {
  renderReviewHtml,
  buildReviewViewModel,
  ReviewViewModel
} from './reviewHtml';
import {
  renderDashboardHtml,
  buildDashboardViewModel,
  renderBarChartSvg
} from './dashboardHtml';
import { validateBeforeCommit } from '../commands/safeCommitCore';
import { GitSanityEvent } from '../stats/eventLog';

async function runReviewDashboardTests(): Promise<void> {
  console.log('Running Review Panel & Dashboard HTML tests...');

  // 1. Extension-Side Validation (`validateBeforeCommit`)
  const v1 = validateBeforeCommit({
    errorsCount: 1,
    message: 'feat: add something',
    checklistTicked: true,
    branch: 'feature-1'
  });
  assert.strictEqual(v1.valid, false, 'Must block when errors > 0');

  const v2 = validateBeforeCommit({
    errorsCount: 0,
    message: 'feat: add something',
    checklistTicked: false,
    branch: 'feature-1'
  });
  assert.strictEqual(v2.valid, false, 'Must block when checklist is not ticked');

  const v3 = validateBeforeCommit({
    errorsCount: 0,
    message: '   ',
    checklistTicked: true,
    branch: 'feature-1'
  });
  assert.strictEqual(v3.valid, false, 'Must block when commit message is empty');

  const v4 = validateBeforeCommit({
    errorsCount: 0,
    message: 'feat: commit to main',
    checklistTicked: true,
    branch: 'main',
    warnOnMainBranch: true,
    confirmMainBranch: false
  });
  assert.strictEqual(v4.valid, false, 'Must block on main branch without confirmation');

  const v5 = validateBeforeCommit({
    errorsCount: 0,
    message: 'feat: commit to main',
    checklistTicked: true,
    branch: 'main',
    warnOnMainBranch: true,
    confirmMainBranch: true
  });
  assert.strictEqual(v5.valid, true, 'Must allow when main branch is explicitly confirmed');

  // 2. ReviewPanel HTML Rendering
  const mockModel: ReviewViewModel = {
    branch: 'feature/<script>bad</script>',
    isMainOrMaster: false,
    warnOnMainBranch: true,
    stagedFiles: [{ path: 'test.ts', status: 'M' }],
    findings: [
      {
        file: 'test.ts',
        line: 10,
        severity: 'warning',
        ruleId: 'console-log',
        message: 'console.log found'
      }
    ],
    defaultMessage: 'feat(test): update test.ts',
    checklist: [
      { id: 'review-staged', label: 'I reviewed the staged changes' },
      { id: 'review-console-log', label: 'I checked the console.log statements' }
    ],
    canCommit: true
  };

  const nonce = 'test-nonce-1234';
  const html = renderReviewHtml(mockModel, nonce);

  assert.ok(html.includes('nonce-test-nonce-1234'), 'Nonce must be present in CSP and script');
  assert.ok(!html.includes('<script>bad</script>'), 'Dynamic branch name must be HTML escaped');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'), 'Branch name must appear escaped');
  assert.ok(html.includes('I checked the console.log statements'), 'Console.log checklist item must be present');
  assert.ok(html.includes('disabled'), 'Commit button must be initially disabled in HTML');

  // 3. Dashboard HTML Rendering - Empty State
  const emptyModel = buildDashboardViewModel([]);
  const emptyHtml = renderDashboardHtml(emptyModel, nonce);
  assert.ok(emptyHtml.includes('No GitSanity Statistics Yet'), 'Should display empty state explanation');
  assert.ok(emptyHtml.includes('Install Git Hook'), 'Empty state should have install button');

  // 4. Dashboard HTML Rendering - With Data
  const sampleEvents: GitSanityEvent[] = [
    {
      v: 1,
      ts: '2026-10-20T10:00:00Z',
      type: 'commit',
      filesChecked: 2,
      errors: 0,
      warnings: 0,
      byRule: {}
    },
    {
      v: 1,
      ts: '2026-10-21T10:00:00Z',
      type: 'commit',
      filesChecked: 1,
      errors: 0,
      warnings: 0,
      byRule: {}
    }
  ];

  const fullModel = buildDashboardViewModel(sampleEvents, new Date('2026-10-22T00:00:00Z'));
  const fullHtml = renderDashboardHtml(fullModel, nonce);

  assert.ok(fullHtml.includes('Clean Commit Streak'), 'Should render streak card');
  assert.ok(fullHtml.includes('Weekly Issue Trend'), 'Should render trend section');
  assert.ok(fullHtml.includes('<svg'), 'Should include inline SVG chart');
  assert.ok(fullHtml.includes('<details>'), 'Should include accessible data table details fallback');

  // 5. SVG Chart generation
  const svg = renderBarChartSvg(fullModel.weeklyTrend);
  assert.ok(svg.includes('<rect'), 'SVG should contain bar rect elements');
  assert.ok(svg.includes('chart-svg'), 'SVG should have chart-svg class');

  console.log('✓ Review Panel & Dashboard HTML tests passed');
}

runReviewDashboardTests().catch((err) => {
  console.error('Review & Dashboard tests failed:', err);
  process.exit(1);
});
