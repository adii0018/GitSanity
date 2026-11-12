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
exports.runGit = runGit;
exports.isGitInstalled = isGitInstalled;
exports.spawnGitLines = spawnGitLines;
const child_process_1 = require("child_process");
const readline = __importStar(require("readline"));
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024; // 64 MB
/**
 * Runs a git command with an argument array using execFile.
 * Never throws on non-zero exit codes.
 */
function runGit(args, cwd, opts) {
    return new Promise((resolve) => {
        const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const maxBuffer = opts?.maxBuffer ?? DEFAULT_MAX_BUFFER;
        const child = (0, child_process_1.execFile)('git', args, {
            cwd,
            timeout,
            maxBuffer,
            windowsHide: true,
            encoding: 'utf8',
            signal: opts?.signal
        }, (error, stdout, stderr) => {
            let code = 0;
            if (error) {
                code = typeof error.code === 'number' ? error.code : 1;
            }
            resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                code
            });
        });
        if (opts?.input && child.stdin) {
            child.stdin.write(opts.input);
            child.stdin.end();
        }
    });
}
/**
 * Checks whether git is installed and executable.
 */
async function isGitInstalled() {
    try {
        const res = await runGit(['--version'], process.cwd(), { timeoutMs: 5000 });
        return res.code === 0 && res.stdout.toLowerCase().includes('git version');
    }
    catch {
        return false;
    }
}
/**
 * Streaming git execution that yields stdout lines as they arrive.
 * Supports cancellation via AbortSignal.
 */
function spawnGitLines(args, cwd, onLine, signal) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)('git', args, {
            cwd,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        if (signal) {
            if (signal.aborted) {
                child.kill();
                resolve(130);
                return;
            }
            signal.addEventListener('abort', () => {
                child.kill();
                resolve(130);
            });
        }
        const rl = readline.createInterface({
            input: child.stdout,
            crlfDelay: Infinity
        });
        rl.on('line', (line) => {
            onLine(line);
        });
        child.on('error', (err) => {
            reject(err);
        });
        child.on('close', (code) => {
            resolve(code ?? 0);
        });
    });
}
//# sourceMappingURL=gitRunner.js.map