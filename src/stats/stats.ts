import { GitSanityEvent } from './eventLog';

export interface WeeklyTrendEntry {
  weekLabel: string;
  startTs: string;
  issues: number;
  errors: number;
  warnings: number;
  commits: number;
}

export interface RuleCount {
  ruleId: string;
  count: number;
}

export interface MilestoneResult {
  reached: number[];
  next?: number;
}

/**
 * Computes current clean commit streak.
 * Counts consecutive "commit" events with 0 errors AND 0 warnings backwards from the latest.
 * A "commit" with warnings resets the streak to 0 at that point.
 * "blocked" events neither count nor reset streak.
 */
export function computeStreak(events: GitSanityEvent[]): number {
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'blocked') {
      // "blocked" events neither count nor reset
      continue;
    }
    if (ev.type === 'commit') {
      if (ev.errors === 0 && ev.warnings === 0) {
        streak++;
      } else {
        // Any errors or warnings on commit reset the streak
        break;
      }
    }
  }
  return streak;
}

/**
 * Computes best clean commit streak ever in the events sequence.
 */
export function computeBestStreak(events: GitSanityEvent[]): number {
  let best = 0;
  let current = 0;

  for (const ev of events) {
    if (ev.type === 'blocked') {
      continue;
    }
    if (ev.type === 'commit') {
      if (ev.errors === 0 && ev.warnings === 0) {
        current++;
        if (current > best) {
          best = current;
        }
      } else {
        current = 0;
      }
    }
  }

  return best;
}

/**
 * Returns ISO week Monday 00:00:00 UTC for a given date.
 */
function getMondayUTC(d: Date): Date {
  const date = new Date(d.getTime());
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns formatted ISO week label, e.g. "W42" or "Oct 21".
 */
function formatWeekLabel(monday: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[monday.getUTCMonth()]} ${monday.getUTCDate()}`;
}

/**
 * Computes weekly trend over the last `weeks` (default 8) weeks leading up to `now`.
 * Returns array oldest to newest, zero-filled.
 */
export function weeklyTrend(
  events: GitSanityEvent[],
  weeks = 8,
  now: Date = new Date()
): WeeklyTrendEntry[] {
  const currentMonday = getMondayUTC(now);
  const buckets: { start: number; end: number; entry: WeeklyTrendEntry }[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday.getTime() - i * 7 * 86400 * 1000);
    const sundayEnd = monday.getTime() + 7 * 86400 * 1000;
    buckets.push({
      start: monday.getTime(),
      end: sundayEnd,
      entry: {
        weekLabel: formatWeekLabel(monday),
        startTs: monday.toISOString(),
        issues: 0,
        errors: 0,
        warnings: 0,
        commits: 0
      }
    });
  }

  for (const ev of events) {
    const t = new Date(ev.ts).getTime();
    if (Number.isNaN(t)) continue;

    for (const b of buckets) {
      if (t >= b.start && t < b.end) {
        b.entry.errors += ev.errors || 0;
        b.entry.warnings += ev.warnings || 0;
        b.entry.issues += (ev.errors || 0) + (ev.warnings || 0);
        if (ev.type === 'commit') {
          b.entry.commits++;
        }
        break;
      }
    }
  }

  return buckets.map((b) => b.entry);
}

/**
 * Returns top N most frequent rule IDs across all events.
 */
export function topRules(events: GitSanityEvent[], limit = 5): RuleCount[] {
  const totals: Record<string, number> = {};

  for (const ev of events) {
    if (ev.byRule && typeof ev.byRule === 'object') {
      for (const [ruleId, count] of Object.entries(ev.byRule)) {
        if (typeof count === 'number' && count > 0) {
          totals[ruleId] = (totals[ruleId] || 0) + count;
        }
      }
    }
  }

  return Object.entries(totals)
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const MILESTONE_THRESHOLDS = [7, 30, 100];

/**
 * Computes milestone badges reached and next milestone target.
 */
export function milestones(streak: number, best: number): MilestoneResult {
  const reached = MILESTONE_THRESHOLDS.filter((m) => best >= m);
  const next = MILESTONE_THRESHOLDS.find((m) => streak < m);
  return { reached, next };
}
