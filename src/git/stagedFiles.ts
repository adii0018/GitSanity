import { runGit } from './gitRunner';

export interface StagedFileEntry {
  path: string;
  status: 'A' | 'M' | 'D' | 'R';
  oldPath?: string;
}

export type StagedFile = StagedFileEntry;

export interface StatusPorcelainResult {
  staged: { path: string; status: string }[];
  unstaged: { path: string; status: string }[];
  untracked: string[];
}

export interface StagedContentResult {
  content?: string;
  isBinary: boolean;
  isTooLarge: boolean;
}

/**
 * Parses git status --porcelain=v1 -z output.
 * Pure logic with zero VS Code dependencies.
 */
export function parseStatusPorcelain(output: string): StatusPorcelainResult {
  const staged: { path: string; status: string }[] = [];
  const unstaged: { path: string; status: string }[] = [];
  const untracked: string[] = [];

  if (!output) {
    return { staged, unstaged, untracked };
  }

  const parts = output.split('\0');
  let i = 0;

  while (i < parts.length) {
    const entry = parts[i];
    if (!entry) {
      i++;
      continue;
    }

    const code = entry.slice(0, 2);
    const filePath = entry.slice(3);

    const x = code[0];
    const y = code[1];

    if (x === '?' && y === '?') {
      untracked.push(filePath);
      i++;
      continue;
    }

    if (x === 'R' || y === 'R') {
      // Renamed entry: next token in NUL-separated stream is the old path
      const oldPath = parts[i + 1] || '';
      i += 2;

      if (x !== ' ') {
        staged.push({ path: filePath, status: x });
      }
      if (y !== ' ') {
        unstaged.push({ path: filePath, status: y });
      }
      continue;
    }

    if (x !== ' ') {
      staged.push({ path: filePath, status: x });
    }
    if (y !== ' ') {
      unstaged.push({ path: filePath, status: y });
    }

    i++;
  }

  return { staged, unstaged, untracked };
}

/**
 * Retrieves the list of staged files from git index.
 */
export async function getStagedFiles(root: string): Promise<StagedFileEntry[]> {
  const res = await runGit(
    ['diff', '--cached', '--name-status', '-z', '--diff-filter=ACMR'],
    root
  );

  if (res.code !== 0 || !res.stdout) {
    return [];
  }

  const entries: StagedFileEntry[] = [];
  const parts = res.stdout.split('\0').filter(Boolean);
  let i = 0;

  while (i < parts.length) {
    const statusToken = parts[i++];
    const statusCode = statusToken[0] as 'A' | 'M' | 'D' | 'R';

    if (statusCode === 'R') {
      const oldPath = parts[i++];
      const newPath = parts[i++];
      entries.push({
        path: newPath,
        status: 'R',
        oldPath
      });
    } else {
      const filePath = parts[i++];
      if (filePath) {
        entries.push({
          path: filePath,
          status: statusCode
        });
      }
    }
  }

  return entries;
}

/**
 * Reads staged file content directly from the Git index using git show :<path>.
 */
export async function getStagedContent(
  root: string,
  relPath: string,
  maxSizeBytes: number = 1024 * 1024
): Promise<StagedContentResult> {
  const normPath = relPath.replace(/\\/g, '/');

  // Check size using git cat-file -s :<path>
  const sizeRes = await runGit(['cat-file', '-s', `:${normPath}`], root);
  if (sizeRes.code !== 0) {
    return { isBinary: false, isTooLarge: false };
  }

  const size = parseInt(sizeRes.stdout.trim(), 10);
  if (!Number.isNaN(size) && size > maxSizeBytes) {
    return { isBinary: false, isTooLarge: true };
  }

  // Get index content
  const showRes = await runGit(['show', `:${normPath}`], root);
  if (showRes.code !== 0) {
    return { isBinary: false, isTooLarge: false };
  }

  const content = showRes.stdout;

  // Check first 8000 characters for binary NUL byte
  const checkLen = Math.min(content.length, 8000);
  for (let j = 0; j < checkLen; j++) {
    if (content.charCodeAt(j) === 0) {
      return { isBinary: true, isTooLarge: false };
    }
  }

  return { content, isBinary: false, isTooLarge: false };
}
