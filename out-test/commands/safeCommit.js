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
exports.safeCommitCommand = safeCommitCommand;
const vscode = __importStar(require("vscode"));
const gitRunner_1 = require("../git/gitRunner");
const repoDetector_1 = require("../git/repoDetector");
const stagedFiles_1 = require("../git/stagedFiles");
const commitMessage_1 = require("../git/commitMessage");
const redact_1 = require("../git/redact");
const safeCommitCore_1 = require("./safeCommitCore");
async function safeCommitCommand(configLoader, projectDiagnostics, outputChannel) {
    // Check workspace trust
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces for security.');
        return;
    }
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
        return;
    }
    // 1. Pick workspace folder
    let targetFolder = folders[0];
    if (folders.length > 1) {
        const picked = await vscode.window.showWorkspaceFolderPick({
            placeHolder: 'Select workspace folder to commit'
        });
        if (!picked)
            return;
        targetFolder = picked;
    }
    const root = targetFolder.uri.fsPath;
    const config = configLoader.getConfigFor(targetFolder.uri);
    // 2. Check repo state
    const repoState = await (0, repoDetector_1.detectRepoState)(root);
    if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
        const choice = await vscode.window.showWarningMessage('No Git repository found in this folder.', 'Create Repository');
        if (choice === 'Create Repository') {
            vscode.commands.executeCommand('gitsanity.createRepository', targetFolder);
        }
        return;
    }
    // 3. Check staged files
    let staged = await (0, stagedFiles_1.getStagedFiles)(root);
    if (staged.length === 0) {
        const statusRes = await (0, gitRunner_1.runGit)(['status', '--porcelain=v1', '-z'], root);
        const parsed = (0, stagedFiles_1.parseStatusPorcelain)(statusRes.stdout);
        const available = [
            ...parsed.unstaged.map((u) => ({ label: u.path, description: `modified (${u.status})` })),
            ...parsed.untracked.map((u) => ({ label: u, description: 'untracked' }))
        ];
        if (available.length === 0) {
            vscode.window.showInformationMessage('GitSanity: Nothing to commit (working tree clean).');
            return;
        }
        const selected = await vscode.window.showQuickPick(available, {
            canPickMany: true,
            placeHolder: 'No files staged. Select files to stage and commit:'
        });
        if (!selected || selected.length === 0) {
            return;
        }
        const pathsToStage = selected.map((s) => s.label);
        const addRes = await (0, gitRunner_1.runGit)(['add', '--', ...pathsToStage], root);
        if (addRes.code !== 0) {
            vscode.window.showErrorMessage(`GitSanity: Failed to stage files: ${addRes.stderr}`);
            return;
        }
        staged = await (0, stagedFiles_1.getStagedFiles)(root);
    }
    // 4. Scan staged index content using reusable core
    const scanRes = await (0, safeCommitCore_1.scanStagedFiles)(root, config);
    const errors = scanRes.errors;
    const warnings = scanRes.warnings;
    // If error findings exist -> BLOCK COMMIT
    if (errors.length > 0) {
        await (0, safeCommitCore_1.logSafeCommitStatsIfNeeded)(root, 'blocked', repoState.branch, scanRes.staged.length, errors, warnings);
        const errorRules = Array.from(new Set(errors.map((e) => e.finding.ruleId))).join(', ');
        const choice = await vscode.window.showErrorMessage(`GitSanity blocked commit: ${errors.length} error-severity issue(s) detected (${errorRules}).`, { modal: true }, 'Show Issues');
        if (choice === 'Show Issues') {
            projectDiagnostics.clear();
            for (const item of [...errors, ...warnings]) {
                const fileUri = vscode.Uri.file(root + '/' + item.file);
                const diag = new vscode.Diagnostic(new vscode.Range(item.finding.line, item.finding.startCol, item.finding.line, item.finding.endCol), item.finding.message, item.finding.severity === 'error'
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning);
                diag.source = 'GitSanity';
                diag.code = item.finding.ruleId;
                const current = projectDiagnostics.get(fileUri) ? [...projectDiagnostics.get(fileUri)] : [];
                current.push(diag);
                projectDiagnostics.set(fileUri, current);
            }
            vscode.commands.executeCommand('workbench.actions.view.problems');
        }
        return;
    }
    // If only warnings exist -> confirm
    if (warnings.length > 0) {
        const proceed = await vscode.window.showWarningMessage(`Commit with ${warnings.length} warning(s)?`, 'Commit anyway', 'Cancel');
        if (proceed !== 'Commit anyway') {
            return;
        }
    }
    // 5. Branch check
    const warnOnMain = vscode.workspace.getConfiguration('gitsanity').get('warnOnMainBranch', true);
    const currentBranch = repoState.branch || 'main';
    const isProtectedBranch = currentBranch === 'main' || currentBranch === 'master' || currentBranch.startsWith('HEAD');
    if (warnOnMain && isProtectedBranch) {
        const branchChoice = await vscode.window.showWarningMessage(`You are committing directly to protected branch '${currentBranch}'.`, { modal: true }, 'Commit anyway', 'Create new branch');
        if (!branchChoice)
            return;
        if (branchChoice === 'Create new branch') {
            const newBranchName = await vscode.window.showInputBox({
                prompt: 'Enter new branch name:',
                validateInput: async (val) => {
                    if (!val || !val.trim())
                        return 'Branch name cannot be empty.';
                    const checkRes = await (0, gitRunner_1.runGit)(['check-ref-format', '--branch', val.trim()], root);
                    return checkRes.code === 0 ? null : 'Invalid branch name according to git ref rules.';
                }
            });
            if (!newBranchName)
                return;
            const switchRes = await (0, gitRunner_1.runGit)(['switch', '-c', newBranchName.trim()], root);
            if (switchRes.code !== 0) {
                vscode.window.showErrorMessage(`GitSanity: Failed to create branch: ${switchRes.stderr}`);
                return;
            }
        }
    }
    // 6. Commit message suggestion
    const suggestedMsg = (0, commitMessage_1.buildCommitMessage)(staged);
    const userMsg = await vscode.window.showInputBox({
        prompt: 'Enter commit message:',
        value: suggestedMsg,
        validateInput: (val) => (!val || !val.trim() ? 'Commit message cannot be empty.' : null)
    });
    if (!userMsg || !userMsg.trim()) {
        return;
    }
    // 7. Verify user.name / user.email
    if (!repoState.userConfigured) {
        vscode.window.showErrorMessage('GitSanity: git user.name and user.email are not configured. Run:\n' +
            'git config user.name "Your Name"\n' +
            'git config user.email "your.email@example.com"');
        return;
    }
    // 8. Execute commit via core
    const commitRes = await (0, safeCommitCore_1.executeGitCommit)(root, userMsg.trim(), (line) => outputChannel.appendLine(line));
    if (!commitRes.success) {
        vscode.window.showErrorMessage(`GitSanity: Commit failed. Check the 'GitSanity' Output channel for details.`);
        return;
    }
    await (0, safeCommitCore_1.logSafeCommitStatsIfNeeded)(root, 'commit', repoState.branch, scanRes.staged.length, [], warnings);
    const shortHash = commitRes.shortHash || 'HEAD';
    const actionChoice = await vscode.window.showInformationMessage(`GitSanity: Committed ${shortHash}`, 'Push', 'Undo');
    if (actionChoice === 'Undo') {
        vscode.commands.executeCommand('gitsanity.undoLastCommit', targetFolder);
    }
    else if (actionChoice === 'Push') {
        const currentRepoState = await (0, repoDetector_1.detectRepoState)(root);
        if (currentRepoState.remotes.length === 0) {
            vscode.commands.executeCommand('gitsanity.publishToGitHub', targetFolder);
            return;
        }
        const upstreamRes = await (0, gitRunner_1.runGit)(['rev-parse', '--abbrev-ref', '@{u}'], root);
        const hasUpstream = upstreamRes.code === 0 && upstreamRes.stdout.trim().length > 0;
        const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', currentRepoState.branch || 'main'];
        outputChannel.appendLine(`[push] git ${pushArgs.join(' ')}`);
        const pushRes = await (0, gitRunner_1.runGit)(pushArgs, root);
        if (pushRes.code !== 0) {
            outputChannel.appendLine(`[push-error] ${(0, redact_1.redact)(pushRes.stderr)}`);
            vscode.window.showErrorMessage(`GitSanity: Push failed: ${(0, redact_1.redact)(pushRes.stderr.split('\n')[0])}`);
        }
        else {
            vscode.window.showInformationMessage(`GitSanity: Successfully pushed to ${currentRepoState.remotes[0].name}.`);
        }
    }
}
//# sourceMappingURL=safeCommit.js.map