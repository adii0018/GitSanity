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
exports.scanProject = scanProject;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitRunner_1 = require("../git/gitRunner");
const scanner_1 = require("./scanner");
const pathMatcher_1 = require("../config/pathMatcher");
const configSchema_1 = require("../config/configSchema");
async function isBinaryFile(filePath) {
    let fd = null;
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
    }
    catch {
        return false;
    }
    finally {
        if (fd) {
            await fd.close();
        }
    }
}
function isEnvFile(relPath, config) {
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
async function walkFolder(root, currentDir, outFiles, config, signal) {
    if (signal?.aborted)
        return;
    if (outFiles.length >= config.maxProjectFiles)
        return;
    let entries = [];
    try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (signal?.aborted || outFiles.length >= config.maxProjectFiles)
            break;
        if (entry.isSymbolicLink())
            continue;
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            if ((0, pathMatcher_1.isIgnored)(relPath + '/', config.ignorePaths)) {
                continue;
            }
            await walkFolder(root, fullPath, outFiles, config, signal);
        }
        else if (entry.isFile()) {
            outFiles.push(relPath);
        }
    }
}
/**
 * Scans an entire project or workspace folder.
 * Pure Node.js implementation with zero VS Code imports.
 */
async function scanProject(folderPath, options) {
    const startTime = Date.now();
    const config = options?.config ?? configSchema_1.DEFAULT_CONFIG;
    const signal = options?.signal;
    let files = [];
    // 1. Get file list using git if in a repository, otherwise walk filesystem
    const gitLs = await (0, gitRunner_1.runGit)(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], folderPath);
    if (gitLs.code === 0 && gitLs.stdout.length > 0) {
        const rawFiles = gitLs.stdout.split('\0').filter((f) => f.length > 0);
        files = rawFiles.map((f) => f.replace(/\\/g, '/'));
    }
    else {
        await walkFolder(folderPath, folderPath, files, config, signal);
    }
    const skippedReasons = {};
    const addSkipped = (reason) => {
        skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
    };
    let capped = false;
    if (files.length > config.maxProjectFiles) {
        files = files.slice(0, config.maxProjectFiles);
        capped = true;
    }
    const byFile = new Map();
    const countsByRule = {};
    const countsBySeverity = { error: 0, warning: 0 };
    const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
    let scannedCount = 0;
    let skippedCount = 0;
    const validFiles = [];
    // Filter files before reading full content
    for (const relPath of files) {
        if ((0, pathMatcher_1.isIgnored)(relPath, config.ignorePaths)) {
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
            if (signal?.aborted)
                break;
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
                const findings = (0, scanner_1.scanText)(content, {
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
                        }
                        else {
                            countsBySeverity.warning++;
                        }
                    }
                }
                scannedCount++;
                options?.onProgress?.(scannedCount, totalToScan);
            }
            catch {
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
//# sourceMappingURL=projectScanner.js.map