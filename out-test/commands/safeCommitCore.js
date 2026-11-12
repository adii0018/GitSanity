"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBeforeCommit = validateBeforeCommit;
exports.scanStagedFiles = scanStagedFiles;
exports.logSafeCommitStatsIfNeeded = logSafeCommitStatsIfNeeded;
exports.executeGitCommit = executeGitCommit;
const path = __importStar(require("path"));
const gitRunner_1 = require("../git/gitRunner");
const stagedFiles_1 = require("../git/stagedFiles");
const scanner_1 = require("../scanner/scanner");
const pathMatcher_1 = require("../config/pathMatcher");
const hookInstaller_1 = require("../git/hookInstaller");
const eventLog_1 = require("../stats/eventLog");
const redact_1 = require("../git/redact");
/**
 * Validates whether a commit can proceed according to GitSanity rules.
 * Runs extension-side before executing any git commit.
 */
function validateBeforeCommit(input) {
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
async function scanStagedFiles(root, config) {
    const staged = await (0, stagedFiles_1.getStagedFiles)(root);
    const errors = [];
    const warnings = [];
    const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
    for (const entry of staged) {
        const relPath = entry.path.replace(/\\/g, '/');
        if ((0, pathMatcher_1.isIgnored)(relPath, config.ignorePaths))
            continue;
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
        const { content, isBinary, isTooLarge } = await (0, stagedFiles_1.getStagedContent)(root, relPath, maxSizeBytes);
        if (isBinary || isTooLarge || !content)
            continue;
        const findings = (0, scanner_1.scanText)(content, {
            rules: config.rules,
            entropyThreshold: config.entropyThreshold,
            entropyMinLength: config.entropyMinLength
        });
        for (const f of findings) {
            if (f.severity === 'error') {
                errors.push({ file: relPath, finding: f });
            }
            else {
                warnings.push({ file: relPath, finding: f });
            }
        }
    }
    return { staged, errors, warnings };
}
/**
 * Logs commit or blocked event if GitSanity pre-commit hook is not installed.
 */
async function logSafeCommitStatsIfNeeded(root, type, branch, filesChecked, errors, warnings) {
    try {
        const hookInstalled = await (0, hookInstaller_1.isGitSanityHookInstalled)(root);
        if (hookInstalled) {
            // Pre-commit hook already records the event to prevent duplicate entries
            return;
        }
        const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(root);
        const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
        const byRule = {};
        for (const item of [...errors, ...warnings]) {
            const rid = item.finding.ruleId;
            byRule[rid] = (byRule[rid] || 0) + 1;
        }
        await (0, eventLog_1.appendEvent)(logPath, {
            v: 1,
            ts: new Date().toISOString(),
            type,
            branch,
            filesChecked,
            errors: errors.length,
            warnings: warnings.length,
            byRule
        });
    }
    catch { }
}
/**
 * Executes the git commit command and retrieves the new HEAD short hash.
 */
async function executeGitCommit(root, message, logFn) {
    const log = logFn || (() => { });
    log(`[commit] git commit -m "${message.trim()}"`);
    const commitRes = await (0, gitRunner_1.runGit)(['commit', '-m', message.trim()], root);
    if (commitRes.code !== 0) {
        log(`[commit-error] ${(0, redact_1.redact)(commitRes.stderr)}`);
        return {
            success: false,
            error: (0, redact_1.redact)(commitRes.stderr)
        };
    }
    const headHashRes = await (0, gitRunner_1.runGit)(['rev-parse', '--short', 'HEAD'], root);
    const shortHash = headHashRes.code === 0 ? headHashRes.stdout.trim() : 'HEAD';
    return {
        success: true,
        shortHash
    };
}
//# sourceMappingURL=safeCommitCore.js.map