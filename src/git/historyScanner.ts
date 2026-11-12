import * as crypto from 'crypto';
import { spawnGitLines } from './gitRunner';
import { scanText, Finding } from '../scanner/scanner';
import { redactValue } from './redact';
import { GitSanityConfig, DEFAULT_CONFIG } from '../config/configSchema';

export interface HistoryFinding {
  commitShort: string;
  file: string;
  ruleId: string;
  redactedPreview: string;
}

export interface HistoryScanResult {
  commitsScanned: number;
  findings: HistoryFinding[];
  durationMs: number;
}

export interface HistoryScanOptions {
  maxCommits?: number;
  config?: GitSanityConfig;
  signal?: AbortSignal;
  onProgress?: (commitsScanned: number) => void;
}

/**
 * Scans git history by streaming commits and diffs.
 * Reports only error-severity secret and high-entropy-string findings on added lines.
 * Pure logic with zero VS Code dependencies.
 */
export async function scanHistory(
  cwd: string,
  options?: HistoryScanOptions
): Promise<HistoryScanResult> {
  const startTime = Date.now();
  const maxCommits = options?.maxCommits ?? 500;
  const config = options?.config ?? DEFAULT_CONFIG;
  const signal = options?.signal;

  let currentCommit = '';
  let currentFile = '';
  let commitsCount = 0;

  const seenHashes = new Set<string>();
  const findings: HistoryFinding[] = [];

  const abortController = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => abortController.abort());
  }

  const args = [
    'log',
    '--all',
    '-p',
    '-U0',
    '--no-color',
    '--format=@@commit %H',
    `-n${maxCommits}`
  ];

  await spawnGitLines(
    args,
    cwd,
    (line: string) => {
      if (line.startsWith('@@commit ')) {
        currentCommit = line.slice(9).trim();
        commitsCount++;
        options?.onProgress?.(commitsCount);
        return;
      }

      if (line.startsWith('diff --git ')) {
        const parts = line.split(' ');
        if (parts.length >= 4) {
          currentFile = parts[3].replace(/^b\//, '');
        }
        return;
      }

      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6).trim();
        return;
      }

      // Check added lines only (starts with '+' but not '+++')
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedText = line.slice(1);
        const lineFindings = scanText(addedText, {
          rules: config.rules,
          entropyThreshold: config.entropyThreshold,
          entropyMinLength: config.entropyMinLength
        });

        for (const f of lineFindings) {
          // Only error-severity secret and high-entropy-string
          if (
            f.severity === 'error' &&
            (f.ruleId === 'secret' || f.ruleId === 'high-entropy-string')
          ) {
            const rawVal = f.meta?.value || addedText.slice(f.startCol, f.endCol);
            // Hash key: file + ruleId + rawVal
            const hash = crypto
              .createHash('sha256')
              .update(`${currentFile}:${f.ruleId}:${rawVal}`)
              .digest('hex');

            if (!seenHashes.has(hash)) {
              seenHashes.add(hash);
              findings.push({
                commitShort: currentCommit.slice(0, 7),
                file: currentFile,
                ruleId: f.ruleId,
                redactedPreview: redactValue(rawVal)
              });
            }
          }
        }
      }
    },
    abortController.signal
  );

  return {
    commitsScanned: commitsCount,
    findings,
    durationMs: Date.now() - startTime
  };
}
