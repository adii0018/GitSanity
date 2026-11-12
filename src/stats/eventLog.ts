import * as fs from 'fs';
import * as path from 'path';

export interface GitSanityEvent {
  v: 1;
  ts: string; // ISO timestamp
  type: 'commit' | 'blocked';
  branch?: string;
  filesChecked: number;
  errors: number;
  warnings: number;
  byRule: Record<string, number>;
}

const MAX_SIZE_BYTES = 512 * 1024; // 512 KB
const ROTATE_KEEP_LINES = 2000;

/**
 * Returns the absolute path to the event log file inside the git common directory.
 */
export function getEventLogPath(commonDir: string): string {
  return path.join(commonDir, 'gitsanity', 'events.jsonl');
}

/**
 * Appends an event to the log file.
 * Creates directories if needed, swallows any errors, and rotates the file
 * if it exceeds 512 KB by retaining only the last 2000 lines.
 */
export async function appendEvent(logPath: string, event: GitSanityEvent): Promise<void> {
  try {
    const dir = path.dirname(logPath);
    await fs.promises.mkdir(dir, { recursive: true });

    const line = JSON.stringify(event) + '\n';
    await fs.promises.appendFile(logPath, line, 'utf8');

    // Check size for rotation
    try {
      const stat = await fs.promises.stat(logPath);
      if (stat.size > MAX_SIZE_BYTES) {
        await rotateLogFile(logPath, ROTATE_KEEP_LINES);
      }
    } catch {}
  } catch {
    // Swallow any errors - logging must never break or crash callers
  }
}

/**
 * Rotates the log file keeping only the last N lines.
 */
async function rotateLogFile(logPath: string, keepLines: number): Promise<void> {
  try {
    const content = await fs.promises.readFile(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > keepLines) {
      const retained = lines.slice(-keepLines);
      await fs.promises.writeFile(logPath, retained.join('\n') + '\n', 'utf8');
    }
  } catch {}
}

/**
 * Reads events from the log file, skipping invalid or corrupt lines silently.
 */
export async function readEvents(
  logPath: string,
  opts?: { limit?: number }
): Promise<GitSanityEvent[]> {
  try {
    if (!fs.existsSync(logPath)) {
      return [];
    }

    const content = await fs.promises.readFile(logPath, 'utf8');
    const lines = content.split('\n');
    const events: GitSanityEvent[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (
          parsed &&
          parsed.v === 1 &&
          typeof parsed.ts === 'string' &&
          (parsed.type === 'commit' || parsed.type === 'blocked') &&
          typeof parsed.filesChecked === 'number' &&
          typeof parsed.errors === 'number' &&
          typeof parsed.warnings === 'number' &&
          typeof parsed.byRule === 'object' &&
          parsed.byRule !== null
        ) {
          events.push(parsed as GitSanityEvent);
        }
      } catch {
        // Silently skip corrupt lines
      }
    }

    if (opts && typeof opts.limit === 'number' && opts.limit > 0 && events.length > opts.limit) {
      return events.slice(-opts.limit);
    }

    return events;
  } catch {
    return [];
  }
}
