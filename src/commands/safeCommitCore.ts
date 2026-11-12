import * as path from 'path';
import { runGit } from '../git/gitRunner';
import { getStagedFiles, getStagedContent, StagedFile } from '../git/stagedFiles';
import { scanText, Finding } from '../scanner/scanner';
import { GitSanityConfig } from '../config/configSchema';
import { isIgnored } from '../config/pathMatcher';
import { isGitSanityHookInstalled, resolveGitPaths } from '../git/hookInstaller';
import { appendEvent, getEventLogPath } from '../stats/eventLog';
import { redact } from '../git/redact';

export interface StagedFinding {
  file: string;
  finding: Finding;
}

export interface StagedScanResult {
  staged: StagedFile[];
  errors: StagedFinding[];
  warnings: StagedFinding[];
}

export interface ValidationInput {
  errorsCount: number;
  message: string;
  checklistTicked: boolean;
  branch: string;
  confirmMainBranch?: boolean;
  warnOnMainBranch?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether a commit can proceed according to GitSanity rules.
 * Runs extension-side before executing any git commit.
 */
export function validateBeforeCommit(input: ValidationInput): ValidationResult {
  if (input.errorsCount > 0) {
    return { valid: false, reason: `Commit blocked: ${input.errorsCount} error-severity issue(s) detected.` };
  }

  if (!input.checklistTicked) {
    return { valid: false, reason: 'All required review checklist items must be confirmed.' };
  }

  const trimmedMsg = (input.message || '').trim();
  if (!trimmedMsg) {
    return { valid: false, reason: 'Commit message cannot be empty.' };
  }

  const isProtected = input.branch === 'main' || input.branch === 'master' || input.branch.startsWith('HEAD');
  if (input.warnOnMainBranch && isProtected && !input.confirmMainBranch) {
    return { valid: false, reason: `Confirmation required to commit directly to protected branch '${input.branch}'.` };
  }

  return { valid: true };
}

/**
 * Scans all staged files directly from the Git index.
 */
export async function scanStagedFiles(
  root: string,
  config: GitSanityConfig
): Promise<StagedScanResult> {
  const staged = await getStagedFiles(root);
  const errors: StagedFinding[] = [];
  const warnings: StagedFinding[] = [];
  const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;

  for (const entry of staged) {
    const relPath = entry.path.replace(/\\/g, '/');
    if (isIgnored(relPath, config.ignorePaths)) continue;

    const base = path.basename(relPath);
    if (base === '.env' || (base.startsWith('.env.') && !base.endsWith('.example') && !base.endsWith('.sample'))) {
      errors.push({
        file: relPath,
        finding: {
          line: 0,
          startCol: 0,
          endCol: 0,
          ruleId: 'secret',
          message: 'Staged environment (.env) file leaks secrets into git history.',
          severity: 'error'
        }
      });
      continue;
    }

    const { content, isBinary, isTooLarge } = await getStagedContent(root, relPath, maxSizeBytes);
    if (isBinary || isTooLarge || !content) continue;

    const findings = scanText(content, {
      rules: config.rules,
      entropyThreshold: config.entropyThreshold,
      entropyMinLength: config.entropyMinLength
    });

    for (const f of findings) {
      if (f.severity === 'error') {
        errors.push({ file: relPath, finding: f });
      } else {
        warnings.push({ file: relPath, finding: f });
      }
    }
  }

  return { staged, errors, warnings };
}

/**
 * Logs commit or blocked event if GitSanity pre-commit hook is not installed.
 */
export async function logSafeCommitStatsIfNeeded(
  root: string,
  type: 'commit' | 'blocked',
  branch: string | undefined,
  filesChecked: number,
  errors: StagedFinding[],
  warnings: StagedFinding[]
): Promise<void> {
  try {
    const hookInstalled = await isGitSanityHookInstalled(root);
    if (hookInstalled) {
      // Pre-commit hook already records the event to prevent duplicate entries
      return;
    }

    const { commonDir } = await resolveGitPaths(root);
    const logPath = getEventLogPath(commonDir);

    const byRule: Record<string, number> = {};
    for (const item of [...errors, ...warnings]) {
      const rid = item.finding.ruleId;
      byRule[rid] = (byRule[rid] || 0) + 1;
    }

    await appendEvent(logPath, {
      v: 1,
      ts: new Date().toISOString(),
      type,
      branch,
      filesChecked,
      errors: errors.length,
      warnings: warnings.length,
      byRule
    });
  } catch {}
}

export interface CommitExecutionResult {
  success: boolean;
  shortHash?: string;
  error?: string;
}

/**
 * Executes the git commit command and retrieves the new HEAD short hash.
 */
export async function executeGitCommit(
  root: string,
  message: string,
  logFn?: (line: string) => void
): Promise<CommitExecutionResult> {
  const log = logFn || (() => {});
  log(`[commit] git commit -m "${message.trim()}"`);

  const commitRes = await runGit(['commit', '-m', message.trim()], root);
  if (commitRes.code !== 0) {
    log(`[commit-error] ${redact(commitRes.stderr)}`);
    return {
      success: false,
      error: redact(commitRes.stderr)
    };
  }

  const headHashRes = await runGit(['rev-parse', '--short', 'HEAD'], root);
  const shortHash = headHashRes.code === 0 ? headHashRes.stdout.trim() : 'HEAD';

  return {
    success: true,
    shortHash
  };
}
