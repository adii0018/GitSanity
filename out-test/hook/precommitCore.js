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
exports.runPrecommit = runPrecommit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stagedFiles_1 = require("../git/stagedFiles");
const gitRunner_1 = require("../git/gitRunner");
const configSchema_1 = require("../config/configSchema");
const pathMatcher_1 = require("../config/pathMatcher");
const scanner_1 = require("../scanner/scanner");
const eventLog_1 = require("../stats/eventLog");
function isEnvFile(fileName) {
    const base = path.basename(fileName);
    if (base === '.env')
        return true;
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
async function runPrecommit(opts) {
    const log = opts.stdout || ((msg) => process.stdout.write(msg + '\n'));
    try {
        const root = opts.root;
        // 1. Read config or use defaults
        let config = configSchema_1.DEFAULT_CONFIG;
        const configPath = path.join(root, '.gitsanity.json');
        if (fs.existsSync(configPath)) {
            try {
                const text = fs.readFileSync(configPath, 'utf8');
                config = (0, configSchema_1.parseConfig)(text).config;
            }
            catch { }
        }
        // 2. Get staged files
        const staged = await (0, stagedFiles_1.getStagedFiles)(root);
        if (staged.length === 0) {
            return 0;
        }
        const allFindings = [];
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
            if ((0, pathMatcher_1.isIgnored)(relPath, config.ignorePaths)) {
                continue;
            }
            // Check file size for large file warning
            const sizeRes = await (0, gitRunner_1.runGit)(['cat-file', '-s', `:${relPath}`], root);
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
            const { content, isBinary, isTooLarge } = await (0, stagedFiles_1.getStagedContent)(root, relPath, maxSizeBytes);
            if (isBinary || isTooLarge || !content) {
                continue;
            }
            // Scan content
            const findings = (0, scanner_1.scanText)(content, {
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
        let exitCode = 0;
        if (errors.length > 0 || (config.blockOnWarnings && warnings.length > 0)) {
            exitCode = 1;
        }
        // Record stats event (never alters exit code or crashes hook)
        try {
            let commonDir = path.join(root, '.git');
            const commonRes = await (0, gitRunner_1.runGit)(['rev-parse', '--git-common-dir'], root);
            if (commonRes.code === 0 && commonRes.stdout.trim()) {
                const raw = commonRes.stdout.trim();
                commonDir = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
            }
            let branch;
            const branchRes = await (0, gitRunner_1.runGit)(['branch', '--show-current'], root);
            if (branchRes.code === 0 && branchRes.stdout.trim()) {
                branch = branchRes.stdout.trim();
            }
            const byRule = {};
            for (const f of allFindings) {
                byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
            }
            const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
            await (0, eventLog_1.appendEvent)(logPath, {
                v: 1,
                ts: new Date().toISOString(),
                type: exitCode === 1 ? 'blocked' : 'commit',
                branch,
                filesChecked: staged.length,
                errors: errors.length,
                warnings: warnings.length,
                byRule
            });
        }
        catch { }
        return exitCode;
    }
    catch (err) {
        log('GitSanity hook error (check skipped)');
        return 0;
    }
}
//# sourceMappingURL=precommitCore.js.map