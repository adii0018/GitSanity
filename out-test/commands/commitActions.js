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
exports.showCommitActionsCommand = showCommitActionsCommand;
const vscode = __importStar(require("vscode"));
const gitRunner_1 = require("../git/gitRunner");
const scanner_1 = require("../scanner/scanner");
async function showCommitActionsCommand(commit, configLoader, outputChannel) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0)
        return;
    const root = folders[0].uri.fsPath;
    const choice = await vscode.window.showQuickPick([
        {
            label: '$(search) Scan Commit for Leaked Secrets',
            description: `Inspect diff of ${commit.shortHash} for secrets`,
            action: 'scan'
        },
        {
            label: '$(file-text) View Changed Files & Summary',
            description: `Show files modified in ${commit.shortHash}`,
            action: 'summary'
        },
        {
            label: '$(clippy) Copy Commit Hash',
            description: commit.shortHash,
            detail: commit.hash,
            action: 'copy'
        },
        {
            label: '$(link-external) Open Commit on GitHub',
            description: 'View commit in web browser',
            action: 'github'
        },
        {
            label: '$(discard) Soft Undo to Here',
            description: 'Reset HEAD to this commit keeping changes staged',
            action: 'undo'
        }
    ], { placeHolder: `${commit.shortHash}: ${commit.subject}` });
    if (!choice)
        return;
    if (choice.action === 'scan') {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `GitSanity: Scanning commit ${commit.shortHash}...`
        }, async () => {
            const diffRes = await (0, gitRunner_1.runGit)(['show', '--format=', '--patch', commit.hash], root);
            if (diffRes.code !== 0) {
                vscode.window.showErrorMessage(`GitSanity: Could not read commit diff: ${diffRes.stderr}`);
                return;
            }
            const config = configLoader.getConfigFor(folders[0].uri);
            const findings = (0, scanner_1.scanText)(diffRes.stdout, {
                rules: config.rules,
                entropyThreshold: config.entropyThreshold,
                entropyMinLength: config.entropyMinLength
            });
            const critical = findings.filter((f) => f.severity === 'error');
            if (critical.length > 0) {
                const viewChoice = await vscode.window.showErrorMessage(`GitSanity ALERT: Found ${critical.length} critical secret(s) in commit ${commit.shortHash}! (${Array.from(new Set(critical.map((c) => c.ruleId))).join(', ')})`, 'View Output');
                if (viewChoice === 'View Output') {
                    outputChannel.clear();
                    outputChannel.appendLine(`=== GitSanity Secret Scan: Commit ${commit.shortHash} ===`);
                    outputChannel.appendLine(`Author: ${commit.author} | Date: ${commit.relDate}`);
                    outputChannel.appendLine(`Subject: ${commit.subject}\n`);
                    critical.forEach((f) => {
                        outputChannel.appendLine(`[CRITICAL] ${f.ruleId} at line ${f.line}: ${f.message}`);
                    });
                    outputChannel.show();
                }
            }
            else {
                vscode.window.showInformationMessage(`GitSanity: Clean! No leaked secrets found in commit ${commit.shortHash}.`);
            }
        });
    }
    else if (choice.action === 'summary') {
        const statRes = await (0, gitRunner_1.runGit)(['show', '--stat', '--oneline', commit.hash], root);
        outputChannel.clear();
        outputChannel.appendLine(statRes.stdout);
        outputChannel.show();
    }
    else if (choice.action === 'copy') {
        await vscode.env.clipboard.writeText(commit.hash);
        vscode.window.showInformationMessage(`Copied commit hash ${commit.shortHash} to clipboard.`);
    }
    else if (choice.action === 'github') {
        const remoteRes = await (0, gitRunner_1.runGit)(['remote', 'get-url', 'origin'], root);
        if (remoteRes.code === 0 && remoteRes.stdout.trim()) {
            let url = remoteRes.stdout.trim().replace(/\.git$/, '');
            if (url.startsWith('git@github.com:')) {
                url = 'https://github.com/' + url.slice('git@github.com:'.length);
            }
            vscode.env.openExternal(vscode.Uri.parse(`${url}/commit/${commit.hash}`));
        }
        else {
            vscode.window.showWarningMessage('No GitHub origin remote configured for this repository.');
        }
    }
    else if (choice.action === 'undo') {
        const confirm = await vscode.window.showWarningMessage(`Soft-reset to commit ${commit.shortHash}? (Changes will be kept staged)`, { modal: true }, 'Reset to here', 'Cancel');
        if (confirm === 'Reset to here') {
            const resetRes = await (0, gitRunner_1.runGit)(['reset', '--soft', commit.hash], root);
            if (resetRes.code === 0) {
                vscode.window.showInformationMessage(`GitSanity: Reset HEAD to ${commit.shortHash}.`);
                vscode.commands.executeCommand('gitsanity.refreshStatus');
                vscode.commands.executeCommand('gitsanity.refreshGraph');
            }
            else {
                vscode.window.showErrorMessage(`GitSanity: Reset failed: ${resetRes.stderr}`);
            }
        }
    }
}
//# sourceMappingURL=commitActions.js.map