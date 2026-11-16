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
exports.validateBranchName = void 0;
exports.switchBranchCommand = switchBranchCommand;
const vscode = __importStar(require("vscode"));
const gitRunner_1 = require("../git/gitRunner");
const repoDetector_1 = require("../git/repoDetector");
const redact_1 = require("../git/redact");
const branchValidation_1 = require("../git/branchValidation");
Object.defineProperty(exports, "validateBranchName", { enumerable: true, get: function () { return branchValidation_1.validateBranchName; } });
async function switchBranchCommand(targetFolder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
        return;
    }
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0)
        return;
    const folder = targetFolder || folders[0];
    const root = folder.uri.fsPath;
    const repoState = await (0, repoDetector_1.detectRepoState)(root);
    if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
        vscode.window.showWarningMessage('GitSanity: No Git repository found in this folder.');
        return;
    }
    const currentBranch = repoState.branch || '';
    // 1. Fetch all branches
    const branchRes = await (0, gitRunner_1.runGit)(['branch', '-a', '--format=%(refname:short)|%(HEAD)'], root);
    const branchLines = branchRes.code === 0 ? branchRes.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
    const localBranches = [];
    const remoteBranches = [];
    for (const line of branchLines) {
        const [name] = line.split('|');
        if (!name)
            continue;
        if (name.startsWith('origin/') || name.includes('/')) {
            if (!name.endsWith('/HEAD')) {
                remoteBranches.push(name);
            }
        }
        else {
            localBranches.push(name);
        }
    }
    const items = [
        {
            label: '$(plus) Create New Branch...',
            description: 'Create and switch to a new branch following Git naming rules',
            action: 'create'
        }
    ];
    if (localBranches.length > 0) {
        items.push({
            label: 'Local Branches',
            kind: vscode.QuickPickItemKind.Separator,
            action: 'switch'
        });
        for (const b of localBranches) {
            const isCurrent = b === currentBranch;
            items.push({
                label: isCurrent ? `$(check) ${b}` : `$(git-branch) ${b}`,
                description: isCurrent ? '(current)' : '',
                action: 'switch',
                branchName: b
            });
        }
    }
    if (remoteBranches.length > 0) {
        items.push({
            label: 'Remote Branches',
            kind: vscode.QuickPickItemKind.Separator,
            action: 'switch'
        });
        for (const r of remoteBranches) {
            items.push({
                label: `$(cloud) ${r}`,
                description: 'Checkout remote tracking branch',
                action: 'switch',
                branchName: r
            });
        }
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Current branch: ${currentBranch || 'none'}. Switch branch or create new:`
    });
    if (!picked)
        return;
    if (picked.action === 'create') {
        const branchName = await vscode.window.showInputBox({
            prompt: 'Enter new branch name (e.g., feat/new-feature, fix/bug-123):',
            placeHolder: 'feature/my-branch',
            validateInput: async (val) => {
                const staticErr = (0, branchValidation_1.validateBranchName)(val);
                if (staticErr)
                    return staticErr;
                const checkRes = await (0, gitRunner_1.runGit)(['check-ref-format', '--branch', val.trim()], root);
                if (checkRes.code !== 0) {
                    return 'Invalid branch name according to git ref rules.';
                }
                const existsRes = await (0, gitRunner_1.runGit)(['rev-parse', '--verify', `refs/heads/${val.trim()}`], root);
                if (existsRes.code === 0) {
                    return `A branch named '${val.trim()}' already exists.`;
                }
                return null;
            }
        });
        if (!branchName || !branchName.trim())
            return;
        const trimmed = branchName.trim();
        let createRes = await (0, gitRunner_1.runGit)(['switch', '-c', trimmed], root);
        if (createRes.code !== 0) {
            createRes = await (0, gitRunner_1.runGit)(['checkout', '-b', trimmed], root);
        }
        if (createRes.code !== 0) {
            vscode.window.showErrorMessage(`GitSanity: Failed to create branch: ${(0, redact_1.redact)(createRes.stderr)}`);
            return;
        }
        vscode.window.showInformationMessage(`GitSanity: Created and switched to branch '${trimmed}'.`);
        vscode.commands.executeCommand('gitsanity.refreshStatus');
        vscode.commands.executeCommand('gitsanity.refreshGraph');
        return;
    }
    if (picked.action === 'switch' && picked.branchName) {
        if (picked.branchName === currentBranch) {
            vscode.window.showInformationMessage(`Already on branch '${currentBranch}'.`);
            return;
        }
        const target = picked.branchName;
        let args = ['switch', target];
        if (target.startsWith('origin/')) {
            const localName = target.slice('origin/'.length);
            args = ['switch', '-c', localName, '--track', target];
        }
        let switchRes = await (0, gitRunner_1.runGit)(args, root);
        if (switchRes.code !== 0) {
            const checkoutTarget = target.startsWith('origin/') ? target.slice('origin/'.length) : target;
            switchRes = await (0, gitRunner_1.runGit)(['checkout', checkoutTarget], root);
        }
        if (switchRes.code !== 0) {
            vscode.window.showErrorMessage(`GitSanity: Failed to switch branch: ${(0, redact_1.redact)(switchRes.stderr.split(/\r?\n/)[0])}`);
            return;
        }
        vscode.window.showInformationMessage(`GitSanity: Switched to branch '${target}'.`);
        vscode.commands.executeCommand('gitsanity.refreshStatus');
        vscode.commands.executeCommand('gitsanity.refreshGraph');
    }
}
//# sourceMappingURL=branchCommands.js.map