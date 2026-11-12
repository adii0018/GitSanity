import * as path from 'path';

export interface CommitFile {
  path: string;
  status: 'A' | 'M' | 'D' | 'R';
}

function isDocFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return norm.endsWith('.md') || norm.startsWith('docs/') || norm.includes('/docs/');
}

function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return (
    norm.includes('.test.') ||
    norm.includes('.spec.') ||
    norm.startsWith('tests/') ||
    norm.includes('/tests/') ||
    norm.includes('__tests__/')
  );
}

function isConfigFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(norm);
  return (
    base === 'package.json' ||
    base === 'tsconfig.json' ||
    base === '.gitsanity.json' ||
    base === 'Dockerfile' ||
    base.includes('.config.') ||
    base.endsWith('.lock') ||
    base === 'package-lock.json' ||
    base === 'pnpm-lock.yaml' ||
    norm.startsWith('.github/')
  );
}

/**
 * Derives a conventional commit type based on changed files.
 */
function deriveType(files: CommitFile[]): string {
  if (files.length === 0) {
    return 'chore';
  }

  if (files.every((f) => isDocFile(f.path))) {
    return 'docs';
  }

  if (files.every((f) => isTestFile(f.path))) {
    return 'test';
  }

  if (files.every((f) => isConfigFile(f.path))) {
    return 'chore';
  }

  if (files.every((f) => f.status === 'D')) {
    return 'chore';
  }

  if (files.some((f) => f.status === 'A' && !isTestFile(f.path) && !isDocFile(f.path) && !isConfigFile(f.path))) {
    return 'feat';
  }

  if (files.length >= 1 && files.length <= 3) {
    return 'fix';
  }

  return 'refactor';
}

/**
 * Finds a common scope: single file base or common top-level directory.
 */
function deriveScope(files: CommitFile[]): string | undefined {
  if (files.length === 0) {
    return undefined;
  }

  if (files.length === 1) {
    const base = path.basename(files[0].path);
    return base;
  }

  const dirs = files.map((f) => {
    const parts = f.path.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  });

  const firstDir = dirs[0];
  if (firstDir && dirs.every((d) => d === firstDir)) {
    return firstDir;
  }

  return undefined;
}

/**
 * Generates an automated, clean commit message suggestion.
 * Ensures the first line never exceeds 72 characters.
 */
export function buildCommitMessage(files: CommitFile[]): string {
  if (files.length === 0) {
    return 'chore: empty commit';
  }

  const type = deriveType(files);
  const scope = deriveScope(files);

  let prefix = scope ? `${type}(${scope}): ` : `${type}: `;

  let summary = '';
  if (files.length === 1) {
    const verb = files[0].status === 'A' ? 'add' : files[0].status === 'D' ? 'remove' : 'update';
    summary = `${verb} ${path.basename(files[0].path)}`;
  } else {
    const addedCount = files.filter((f) => f.status === 'A').length;
    const removedCount = files.filter((f) => f.status === 'D').length;
    if (addedCount === files.length) {
      summary = `add ${files.length} files`;
    } else if (removedCount === files.length) {
      summary = `remove ${files.length} files`;
    } else {
      summary = `update ${files.length} files`;
    }
  }

  let full = prefix + summary;
  if (full.length > 72) {
    // If prefix is too long, omit scope
    if (scope) {
      prefix = `${type}: `;
      full = prefix + summary;
    }
    // Truncate summary if still over 72
    if (full.length > 72) {
      full = full.slice(0, 72);
    }
  }

  return full;
}
