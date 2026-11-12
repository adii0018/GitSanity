import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendEvent, readEvents, GitSanityEvent } from './eventLog';
import {
  computeStreak,
  computeBestStreak,
  weeklyTrend,
  topRules,
  milestones
} from './stats';

async function runStatsTests(): Promise<void> {
  console.log('Running Stats & EventLog tests...');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsanity-stats-test-'));
  const logPath = path.join(tempDir, 'events.jsonl');

  try {
    // 1. Append and Read
    const ev1: GitSanityEvent = {
      v: 1,
      ts: '2026-10-01T10:00:00.000Z',
      type: 'commit',
      branch: 'main',
      filesChecked: 3,
      errors: 0,
      warnings: 0,
      byRule: {}
    };
    await appendEvent(logPath, ev1);

    const ev2: GitSanityEvent = {
      v: 1,
      ts: '2026-10-02T10:00:00.000Z',
      type: 'blocked',
      branch: 'main',
      filesChecked: 2,
      errors: 1,
      warnings: 0,
      byRule: { secret: 1 }
    };
    await appendEvent(logPath, ev2);

    let events = await readEvents(logPath);
    assert.strictEqual(events.length, 2, 'Should read 2 events');
    assert.strictEqual(events[0].type, 'commit');
    assert.strictEqual(events[1].type, 'blocked');

    // Verify no secret values or paths are stored
    const logRaw = fs.readFileSync(logPath, 'utf8');
    assert.strictEqual(logRaw.includes('AKIA'), false, 'Log must never contain secret values');
    assert.strictEqual(logRaw.includes('/src/'), false, 'Log must contain counts only, never file paths');

    // 2. Corrupt Line Tolerance
    fs.appendFileSync(logPath, 'NOT_VALID_JSON\n{"partial": true}\n');
    events = await readEvents(logPath);
    assert.strictEqual(events.length, 2, 'Should silently skip invalid JSON lines');

    // 3. Rotation Test (> 512 KB)
    // Write 2500 lines
    const bigLines: string[] = [];
    for (let i = 0; i < 2500; i++) {
      const dummyEv: GitSanityEvent = {
        v: 1,
        ts: '2026-10-01T10:00:00.000Z',
        type: 'commit',
        filesChecked: 1,
        errors: 0,
        warnings: 0,
        byRule: { dummy: i }
      };
      // Pad to ensure size exceeds 512 KB
      const str = JSON.stringify(dummyEv);
      bigLines.push(str + ' '.repeat(Math.max(0, 220 - str.length)));
    }
    fs.writeFileSync(logPath, bigLines.join('\n') + '\n', 'utf8');

    const statBefore = fs.statSync(logPath);
    assert.ok(statBefore.size > 512 * 1024, 'Log size must exceed 512 KB before append');

    const triggerEv: GitSanityEvent = {
      v: 1,
      ts: '2026-10-03T10:00:00.000Z',
      type: 'commit',
      filesChecked: 1,
      errors: 0,
      warnings: 0,
      byRule: {}
    };
    await appendEvent(logPath, triggerEv);

    const rotatedEvents = await readEvents(logPath);
    assert.ok(rotatedEvents.length <= 2001, `Rotated log must retain at most 2001 lines (actual: ${rotatedEvents.length})`);

    // 4. Streak Calculation
    const streakEvents: GitSanityEvent[] = [
      { v: 1, ts: '2026-10-01T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: {} },
      { v: 1, ts: '2026-10-02T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: {} },
      { v: 1, ts: '2026-10-03T00:00:00Z', type: 'blocked', filesChecked: 1, errors: 1, warnings: 0, byRule: { secret: 1 } },
      { v: 1, ts: '2026-10-04T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: {} },
      { v: 1, ts: '2026-10-05T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: {} }
    ];

    // "blocked" event does not count, but also does not reset streak!
    // So 10-01, 10-02, (10-03 blocked), 10-04, 10-05 => 4 consecutive clean commits
    assert.strictEqual(computeStreak(streakEvents), 4, 'Streak should skip blocked events without resetting');

    // Add a commit with warnings: resets streak!
    streakEvents.push({
      v: 1,
      ts: '2026-10-06T00:00:00Z',
      type: 'commit',
      filesChecked: 1,
      errors: 0,
      warnings: 1,
      byRule: { 'console-log': 1 }
    });
    assert.strictEqual(computeStreak(streakEvents), 0, 'Commit with warnings must reset streak to 0');

    // Add clean commit after warning commit
    streakEvents.push({
      v: 1,
      ts: '2026-10-07T00:00:00Z',
      type: 'commit',
      filesChecked: 1,
      errors: 0,
      warnings: 0,
      byRule: {}
    });
    assert.strictEqual(computeStreak(streakEvents), 1, 'Current streak should now be 1');
    assert.strictEqual(computeBestStreak(streakEvents), 4, 'Best streak should remain 4');

    // 5. Weekly Trend (Zero-Fill & Ordering)
    const fixedNow = new Date('2026-10-25T12:00:00Z');
    const trendEvents: GitSanityEvent[] = [
      {
        v: 1,
        ts: '2026-10-22T10:00:00Z',
        type: 'commit',
        filesChecked: 2,
        errors: 1,
        warnings: 2,
        byRule: { secret: 1, 'console-log': 2 }
      }
    ];
    const trend = weeklyTrend(trendEvents, 8, fixedNow);
    assert.strictEqual(trend.length, 8, 'Weekly trend must contain exactly 8 weeks');
    // Last week contains our event
    const lastWeek = trend[trend.length - 1];
    assert.strictEqual(lastWeek.issues, 3, 'Issues should equal errors + warnings');
    assert.strictEqual(lastWeek.errors, 1);
    assert.strictEqual(lastWeek.warnings, 2);

    // Earlier weeks must be zero-filled
    assert.strictEqual(trend[0].issues, 0);
    assert.strictEqual(trend[0].commits, 0);

    // 6. Top Rules Ordering
    const ruleEvents: GitSanityEvent[] = [
      { v: 1, ts: '2026-10-01T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: { 'console-log': 5, debugger: 2 } },
      { v: 1, ts: '2026-10-02T00:00:00Z', type: 'commit', filesChecked: 1, errors: 0, warnings: 0, byRule: { secret: 10, 'console-log': 3 } }
    ];
    const top = topRules(ruleEvents, 2);
    assert.strictEqual(top.length, 2);
    assert.strictEqual(top[0].ruleId, 'secret');
    assert.strictEqual(top[0].count, 10);
    assert.strictEqual(top[1].ruleId, 'console-log');
    assert.strictEqual(top[1].count, 8);

    // 7. Milestones
    const m1 = milestones(5, 5);
    assert.deepStrictEqual(m1.reached, [], 'No milestones reached at 5');
    assert.strictEqual(m1.next, 7, 'Next milestone is 7');

    const m2 = milestones(10, 35);
    assert.deepStrictEqual(m2.reached, [7, 30], '7 and 30 reached');
    assert.strictEqual(m2.next, 30, 'Next for streak 10 is 30');

    const m3 = milestones(150, 150);
    assert.deepStrictEqual(m3.reached, [7, 30, 100]);
    assert.strictEqual(m3.next, undefined, 'All milestones reached');

    console.log('✓ Stats & EventLog tests passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runStatsTests().catch((err) => {
  console.error('Stats tests failed:', err);
  process.exit(1);
});
