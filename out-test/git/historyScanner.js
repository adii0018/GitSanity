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
exports.scanHistory = scanHistory;
const crypto = __importStar(require("crypto"));
const gitRunner_1 = require("./gitRunner");
const scanner_1 = require("../scanner/scanner");
const redact_1 = require("./redact");
const configSchema_1 = require("../config/configSchema");
/**
 * Scans git history by streaming commits and diffs.
 * Reports only error-severity secret and high-entropy-string findings on added lines.
 * Pure logic with zero VS Code dependencies.
 */
async function scanHistory(cwd, options) {
    const startTime = Date.now();
    const maxCommits = options?.maxCommits ?? 500;
    const config = options?.config ?? configSchema_1.DEFAULT_CONFIG;
    const signal = options?.signal;
    let currentCommit = '';
    let currentFile = '';
    let commitsCount = 0;
    const seenHashes = new Set();
    const findings = [];
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
    await (0, gitRunner_1.spawnGitLines)(args, cwd, (line) => {
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
            const lineFindings = (0, scanner_1.scanText)(addedText, {
                rules: config.rules,
                entropyThreshold: config.entropyThreshold,
                entropyMinLength: config.entropyMinLength
            });
            for (const f of lineFindings) {
                // Only error-severity secret and high-entropy-string
                if (f.severity === 'error' &&
                    (f.ruleId === 'secret' || f.ruleId === 'high-entropy-string')) {
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
                            redactedPreview: (0, redact_1.redactValue)(rawVal)
                        });
                    }
                }
            }
        }
    }, abortController.signal);
    return {
        commitsScanned: commitsCount,
        findings,
        durationMs: Date.now() - startTime
    };
}
//# sourceMappingURL=historyScanner.js.map