import * as fs from 'fs';
import * as path from 'path';
import { runGit } from '../git/gitRunner';
import { scanText, Finding } from './scanner';
import { isIgnored } from '../config/pathMatcher';
import { GitSanityConfig, DEFAULT_CONFIG } from '../config/configSchema';

export interface ProjectScanResult {
  filesScanned: number;
  filesSkipped: number;
  skippedReasons: Record<string, number>;
  capped: boolean;
  byFile: Map<string, Finding[]>;
  countsByRule: Record<string, number>;
  countsBySeverity: { error: number; warning: number };
  durationMs: number;
}

export interface ScanProjectOptions {
  config?: GitSanityConfig;
  signal?: AbortSignal;
  onProgress?: (scanned: number, total: number) => void;
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  let fd: fs.promises.FileHandle | null = null;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(8000);
    const { bytesRead } = await fd.read(buffer, 0, 8000, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd) {
      await fd.close();
    }
  }
}

function isEnvFile(relPath: string, config: GitSanityConfig): boolean {
  const base = path.basename(relPath);
  if (base === '.env' || base === config.envFile || base === config.envExampleFile) {
    return true;
  }
  if (base.startsWith('.env.')) {
    if (base.endsWith('.example') || base.endsWith('.sample') || base.endsWith('.template')) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Recursively collects files in folderPath without following symlinks and skipping default ignores.
 */
async function walkFolder(
  root: string,
  currentDir: string,
  outFiles: string[],
  config: GitSanityConfig,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return;
  if (outFiles.length >= config.maxProjectFiles) return;

  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (signal?.aborted || outFiles.length >= config.maxProjectFiles) break;
    if (entry.isSymbolicLink()) continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(root, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (isIgnored(relPath + '/', config.ignorePaths)) {
        continue;
      }
      await walkFolder(root, fullPath, outFiles, config, signal);
    } else if (entry.isFile()) {
      outFiles.push(relPath);
    }
  }
}

/**
 * Scans an entire project or workspace folder.
 * Pure Node.js implementation with zero VS Code imports.
 */
export async function scanProject(
  folderPath: string,
  options?: ScanProjectOptions
): Promise<ProjectScanResult> {
  const startTime = Date.now();
  const config = options?.config ?? DEFAULT_CONFIG;
  const signal = options?.signal;

  let files: string[] = [];

  // 1. Get file list using git if in a repository, otherwise walk filesystem
  const gitLs = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], folderPath);
  if (gitLs.code === 0 && gitLs.stdout.length > 0) {
    const rawFiles = gitLs.stdout.split('\0').filter((f) => f.length > 0);
    files = rawFiles.map((f) => f.replace(/\\/g, '/'));
  } else {
    await walkFolder(folderPath, folderPath, files, config, signal);
  }

  const skippedReasons: Record<string, number> = {};
  const addSkipped = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
  };

  let capped = false;
  if (files.length > config.maxProjectFiles) {
    files = files.slice(0, config.maxProjectFiles);
    capped = true;
  }

  const byFile = new Map<string, Finding[]>();
  const countsByRule: Record<string, number> = {};
  const countsBySeverity = { error: 0, warning: 0 };

  const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
  let scannedCount = 0;
  let skippedCount = 0;

  const validFiles: string[] = [];

  // Filter files before reading full content
  for (const relPath of files) {
    if (isIgnored(relPath, config.ignorePaths)) {
      addSkipped('ignored-path');
      skippedCount++;
      continue;
    }

    if (isEnvFile(relPath, config)) {
      addSkipped('env-file');
      skippedCount++;
      continue;
    }

    validFiles.push(relPath);
  }

  const totalToScan = validFiles.length;

  // Process valid files with concurrency limit 8
  const CONCURRENCY = 8;
  let fileIndex = 0;

  const worker = async () => {
    while (fileIndex < validFiles.length) {
      if (signal?.aborted) break;
      const currentIndex = fileIndex++;
      const relPath = validFiles[currentIndex];
      const fullPath = path.join(folderPath, relPath);

      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > maxSizeBytes) {
          addSkipped('max-size-exceeded');
          skippedCount++;
          continue;
        }

        const isBin = await isBinaryFile(fullPath);
        if (isBin) {
          addSkipped('binary-file');
          skippedCount++;
          continue;
        }

        const content = await fs.promises.readFile(fullPath, 'utf8');
        const findings = scanText(content, {
          rules: config.rules,
          entropyThreshold: config.entropyThreshold,
          entropyMinLength: config.entropyMinLength
        });

        if (findings.length > 0) {
          byFile.set(relPath, findings);
          for (const f of findings) {
            countsByRule[f.ruleId] = (countsByRule[f.ruleId] || 0) + 1;
            if (f.severity === 'error') {
              countsBySeverity.error++;
            } else {
              countsBySeverity.warning++;
            }
          }
        }

        scannedCount++;
        options?.onProgress?.(scannedCount, totalToScan);
      } catch {
        addSkipped('read-error');
        skippedCount++;
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, validFiles.length) }, () => worker());
  await Promise.all(workers);

  return {
    filesScanned: scannedCount,
    filesSkipped: skippedCount,
    skippedReasons,
    capped,
    byFile,
    countsByRule,
    countsBySeverity,
    durationMs: Date.now() - startTime
  };
}
