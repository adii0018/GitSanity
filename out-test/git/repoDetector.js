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
exports.detectRepoState = detectRepoState;
const path = __importStar(require("path"));
const gitRunner_1 = require("./gitRunner");
const redact_1 = require("./redact");
/**
 * Detects the git repository state of a given folder.
 * Pure logic with zero VS Code dependencies.
 */
async function detectRepoState(folderPath) {
    const installed = await (0, gitRunner_1.isGitInstalled)();
    if (!installed) {
        return {
            state: 'no-git',
            remotes: [],
            isGitHub: false,
            userConfigured: false
        };
    }
    // 1. Check if inside a git work tree
    const toplevelRes = await (0, gitRunner_1.runGit)(['rev-parse', '--show-toplevel'], folderPath);
    if (toplevelRes.code !== 0 || !toplevelRes.stdout.trim()) {
        return {
            state: 'no-repo',
            remotes: [],
            isGitHub: false,
            userConfigured: false
        };
    }
    const root = path.normalize(toplevelRes.stdout.trim());
    // 2. Check if repo has any commits
    const headRes = await (0, gitRunner_1.runGit)(['rev-parse', '--verify', 'HEAD'], root);
    const hasCommits = headRes.code === 0;
    // 3. Get branch
    let branch;
    const branchRes = await (0, gitRunner_1.runGit)(['branch', '--show-current'], root);
    if (branchRes.code === 0 && branchRes.stdout.trim()) {
        branch = branchRes.stdout.trim();
    }
    else if (hasCommits) {
        // Possibly detached HEAD
        const shortHead = await (0, gitRunner_1.runGit)(['rev-parse', '--short', 'HEAD'], root);
        branch = shortHead.code === 0 ? `HEAD (${shortHead.stdout.trim()})` : 'HEAD';
    }
    else {
        // Unborn branch
        const symRef = await (0, gitRunner_1.runGit)(['symbolic-ref', '--short', 'HEAD'], root);
        branch = symRef.code === 0 && symRef.stdout.trim() ? symRef.stdout.trim() : 'main';
    }
    // 4. Remotes
    const remotesRes = await (0, gitRunner_1.runGit)(['remote', '-v'], root);
    const remotesMap = new Map();
    if (remotesRes.code === 0 && remotesRes.stdout.trim()) {
        const lines = remotesRes.stdout.split(/\r?\n/);
        for (const line of lines) {
            const match = line.trim().match(/^([^\s]+)\s+([^\s]+)\s+\((?:fetch|push)\)$/);
            if (match) {
                const name = match[1];
                const rawUrl = match[2];
                const safeUrl = (0, redact_1.redact)(rawUrl);
                if (!remotesMap.has(name)) {
                    remotesMap.set(name, safeUrl);
                }
            }
        }
    }
    const remotes = Array.from(remotesMap.entries()).map(([name, url]) => ({
        name,
        url
    }));
    const isGitHub = remotes.some((r) => /github\.com/i.test(r.url));
    // 5. User config
    const nameRes = await (0, gitRunner_1.runGit)(['config', 'user.name'], root);
    const emailRes = await (0, gitRunner_1.runGit)(['config', 'user.email'], root);
    const userConfigured = nameRes.stdout.trim().length > 0 && emailRes.stdout.trim().length > 0;
    const state = remotes.length > 0 ? 'remote-repo' : 'local-repo';
    return {
        state,
        root,
        branch,
        hasCommits,
        remotes,
        isGitHub,
        userConfigured
    };
}
//# sourceMappingURL=repoDetector.js.map