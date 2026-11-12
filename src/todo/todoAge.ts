import * as fs from 'fs';
import * as path from 'path';
import { runGit } from '../git/gitRunner';
import { parseBlamePorcelain } from './blame';

/**
 * Computes the age in days of TODO lines in a file by running a single git blame call.
 * lines: array of 0-based line numbers.
 * Returns Map of 0-based line number -> age in days.
 */
export async function getTodoAges(
  root: string,
  relPath: string,
  lines: number[],
  now: number,
  maxFileSizeMB = 1
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (lines.length === 0) {
    return result;
  }

  // Check file size limit
  try {
    const fullPath = path.join(root, relPath);
    const stat = await fs.promises.stat(fullPath);
    if (stat.size > maxFileSizeMB * 1024 * 1024) {
      return result;
    }
  } catch {
    return result;
  }

  // Check if file is tracked by Git
  const normRelPath = relPath.replace(/\\/g, '/');
  const lsRes = await runGit(['ls-files', '--error-unmatch', '--', normRelPath], root);
  if (lsRes.code !== 0) {
    // Untracked file
    return result;
  }

  // Limit to 50 line ranges per blame call
  const targetLines = lines.slice(0, 50);
  const blameArgs = ['blame', '--line-porcelain'];

  for (const line0 of targetLines) {
    const line1 = line0 + 1;
    blameArgs.push('-L', `${line1},${line1}`);
  }

  blameArgs.push('--', normRelPath);

  const blameRes = await runGit(blameArgs, root);
  if (blameRes.code !== 0) {
    return result;
  }

  const blameMap = parseBlamePorcelain(blameRes.stdout);
  for (const line0 of targetLines) {
    const line1 = line0 + 1;
    const info = blameMap.get(line1);
    if (info && info.authorTime > 0) {
      const ageMs = now - info.authorTime * 1000;
      const days = Math.max(0, Math.floor(ageMs / (86400 * 1000)));
      result.set(line0, days);
    }
  }

  return result;
}
