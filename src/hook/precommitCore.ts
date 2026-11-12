import * as fs from 'fs';
import * as path from 'path';
import { getStagedFiles, getStagedContent } from '../git/stagedFiles';
import { runGit } from '../git/gitRunner';
import { parseConfig, DEFAULT_CONFIG, GitSanityConfig } from '../config/configSchema';
import { isIgnored } from '../config/pathMatcher';
import { scanText, Finding } from '../scanner/scanner';
import { appendEvent, getEventLogPath } from '../stats/eventLog';

export interface PrecommitOptions {
  root: string;
  stdout?: (msg: string) => void;
}

function isEnvFile(fileName: string): boolean {
  const base = path.basename(fileName);
  if (base === '.env') return true;
  if (base.startsWith('.env.')) {
    if (base.endsWith('.example') || base.endsWith('.sample') || base.endsWith('.template')) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Core pre-commit verification logic.
 * Runs staged index checks with zero VS Code dependencies.
 */
export async function runPrecommit(opts: PrecommitOptions): Promise<0 | 1> {
  const log = opts.stdout || ((msg: string) => process.stdout.write(msg + '\n'));

  try {
    const root = opts.root;

    // 1. Read config or use defaults
    let config: GitSanityConfig = DEFAULT_CONFIG;
    const configPath = path.join(root, '.gitsanity.json');
    if (fs.existsSync(configPath)) {
      try {
        const text = fs.readFileSync(configPath, 'utf8');
        config = parseConfig(text).config;
      } catch {}
    }

    // 2. Get staged files
    const staged = await getStagedFiles(root);
    if (staged.length === 0) {
      return 0;
    }

    interface HookFinding {
      file: string;
      line: number;
      severity: 'error' | 'warning';
      ruleId: string;
      message: string;
    }

    const allFindings: HookFinding[] = [];
    const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
    const largeFileThresholdBytes = (config.largeFileMB || 5) * 1024 * 1024;

    for (const entry of staged) {
      const relPath = entry.path.replace(/\\/g, '/');

      // Check if .env file is staged (blocking error)
      if (isEnvFile(relPath)) {
        allFindings.push({
          file: relPath,
          line: 1,
          severity: 'error',
          ruleId: 'env-file-staged',
          message: 'Staging environment (.env) files is dangerous and leaks secrets.'
        });
        continue;
      }

      // Check ignore paths
      if (isIgnored(relPath, config.ignorePaths)) {
        continue;
      }

      // Check file size for large file warning
      const sizeRes = await runGit(['cat-file', '-s', `:${relPath}`], root);
      if (sizeRes.code === 0) {
        const size = parseInt(sizeRes.stdout.trim(), 10);
        if (!Number.isNaN(size) && size > largeFileThresholdBytes) {
          allFindings.push({
            file: relPath,
            line: 1,
            severity: 'warning',
            ruleId: 'large-file',
            message: `Staged file is larger than ${config.largeFileMB} MB.`
          });
        }
      }

      // Get index content
      const { content, isBinary, isTooLarge } = await getStagedContent(root, relPath, maxSizeBytes);
      if (isBinary || isTooLarge || !content) {
        continue;
      }

      // Scan content
      const findings = scanText(content, {
        rules: config.rules,
        entropyThreshold: config.entropyThreshold,
        entropyMinLength: config.entropyMinLength
      });

      for (const f of findings) {
        allFindings.push({
          file: relPath,
          line: f.line + 1, // 1-based for command line
          severity: f.severity === 'error' ? 'error' : 'warning',
          ruleId: f.ruleId,
          message: f.message
        });
      }
    }

    const errors = allFindings.filter((f) => f.severity === 'error');
    const warnings = allFindings.filter((f) => f.severity === 'warning');

    if (allFindings.length > 0) {
      // Print findings: path:line  severity  ruleId  message
      for (const f of allFindings) {
        log(`${f.file}:${f.line}  ${f.severity}  ${f.ruleId}  ${f.message}`);
      }
      log(`\nGitSanity: ${errors.length} error(s), ${warnings.length} warning(s) found in staged files.`);
      log('Fix the issues, or bypass once with: git commit --no-verify\n');
    }

    let exitCode: 0 | 1 = 0;
    if (errors.length > 0 || (config.blockOnWarnings && warnings.length > 0)) {
      exitCode = 1;
    }

    // Record stats event (never alters exit code or crashes hook)
    try {
      let commonDir = path.join(root, '.git');
      const commonRes = await runGit(['rev-parse', '--git-common-dir'], root);
      if (commonRes.code === 0 && commonRes.stdout.trim()) {
        const raw = commonRes.stdout.trim();
        commonDir = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
      }
      let branch: string | undefined;
      const branchRes = await runGit(['branch', '--show-current'], root);
      if (branchRes.code === 0 && branchRes.stdout.trim()) {
        branch = branchRes.stdout.trim();
      }

      const byRule: Record<string, number> = {};
      for (const f of allFindings) {
        byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
      }

      const logPath = getEventLogPath(commonDir);
      await appendEvent(logPath, {
        v: 1,
        ts: new Date().toISOString(),
        type: exitCode === 1 ? 'blocked' : 'commit',
        branch,
        filesChecked: staged.length,
        errors: errors.length,
        warnings: warnings.length,
        byRule
      });
    } catch {}

    return exitCode;
  } catch (err) {
    log('GitSanity hook error (check skipped)');
    return 0;
  }
}
