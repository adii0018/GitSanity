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
exports.ReviewPanelManager = exports.renderReviewHtml = exports.buildReviewViewModel = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const gitRunner_1 = require("../git/gitRunner");
const repoDetector_1 = require("../git/repoDetector");
const stagedFiles_1 = require("../git/stagedFiles");
const safeCommitCore_1 = require("../commands/safeCommitCore");
const redact_1 = require("../git/redact");
const reviewHtml_1 = require("./reviewHtml");
Object.defineProperty(exports, "buildReviewViewModel", { enumerable: true, get: function () { return reviewHtml_1.buildReviewViewModel; } });
Object.defineProperty(exports, "renderReviewHtml", { enumerable: true, get: function () { return reviewHtml_1.renderReviewHtml; } });
class ReviewPanelManager {
    static async createOrShow(extensionUri, configLoader, outputChannel) {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces for security.');
            return;
        }
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.length === 0) {
            vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
            return;
        }
        let targetFolder = folders[0];
        if (folders.length > 1) {
            const picked = await vscode.window.showWorkspaceFolderPick({
                placeHolder: 'Select workspace folder to review'
            });
            if (!picked)
                return;
            targetFolder = picked;
        }
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (ReviewPanelManager.currentPanel) {
            ReviewPanelManager.currentPanel.reveal(column);
            await ReviewPanelManager.updateContent(ReviewPanelManager.currentPanel, targetFolder, configLoader, outputChannel);
            return;
        }
        const panel = vscode.window.createWebviewPanel('gitsanityReview', 'GitSanity: Review Before Commit', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: []
        });
        ReviewPanelManager.currentPanel = panel;
        panel.onDidDispose(() => {
            ReviewPanelManager.currentPanel = undefined;
        });
        panel.webview.onDidReceiveMessage(async (msg) => {
            const root = targetFolder.uri.fsPath;
            const config = configLoader.getConfigFor(targetFolder.uri);
            if (msg.command === 'refresh') {
                await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
            }
            else if (msg.command === 'openFile') {
                if (typeof msg.file === 'string') {
                    const normRoot = path.resolve(root);
                    const filePath = path.resolve(normRoot, msg.file);
                    if (filePath === normRoot || filePath.startsWith(normRoot + path.sep)) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(filePath);
                            const line = Math.max(0, (typeof msg.line === 'number' ? msg.line : 1) - 1);
                            await vscode.window.showTextDocument(doc, {
                                selection: new vscode.Range(line, 0, line, 0)
                            });
                        }
                        catch { }
                    }
                }
            }
            else if (msg.command === 'stageFiles') {
                const statusRes = await (0, gitRunner_1.runGit)(['status', '--porcelain=v1', '-z'], root);
                const parsed = (0, stagedFiles_1.parseStatusPorcelain)(statusRes.stdout);
                const available = [
                    ...parsed.unstaged.map((u) => ({ label: u.path, description: `modified (${u.status})` })),
                    ...parsed.untracked.map((u) => ({ label: u, description: 'untracked' }))
                ];
                if (available.length === 0) {
                    vscode.window.showInformationMessage('GitSanity: No unstaged or untracked files.');
                    return;
                }
                const selected = await vscode.window.showQuickPick(available, {
                    canPickMany: true,
                    placeHolder: 'Select files to stage:'
                });
                if (selected && selected.length > 0) {
                    const pathsToStage = selected.map((s) => s.label);
                    await (0, gitRunner_1.runGit)(['add', '--', ...pathsToStage], root);
                    await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
                }
            }
            else if (msg.command === 'commit') {
                // Strict Extension-Side Validation
                const repoState = await (0, repoDetector_1.detectRepoState)(root);
                const scanRes = await (0, safeCommitCore_1.scanStagedFiles)(root, config);
                const branch = repoState.branch || 'main';
                const warnOnMain = vscode.workspace
                    .getConfiguration('gitsanity')
                    .get('warnOnMainBranch', true);
                const chk = (msg.checklist || {});
                const checklistTicked = Boolean(chk['review-staged']) &&
                    (!chk['review-console-log'] || Boolean(chk['review-console-log'])) &&
                    (!chk['review-warnings'] || Boolean(chk['review-warnings']));
                const validation = (0, safeCommitCore_1.validateBeforeCommit)({
                    errorsCount: scanRes.errors.length,
                    message: msg.message,
                    checklistTicked,
                    branch,
                    confirmMainBranch: Boolean(chk['confirm-branch']),
                    warnOnMainBranch: warnOnMain
                });
                if (!validation.valid) {
                    vscode.window.showErrorMessage(`GitSanity: ${validation.reason}`);
                    await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
                    return;
                }
                if (!repoState.userConfigured) {
                    vscode.window.showErrorMessage('GitSanity: git user.name and user.email are not configured.');
                    return;
                }
                const commitRes = await (0, safeCommitCore_1.executeGitCommit)(root, msg.message, (line) => outputChannel.appendLine(line));
                if (!commitRes.success) {
                    vscode.window.showErrorMessage(`GitSanity: Commit failed. Check the 'GitSanity' Output channel for details.`);
                    return;
                }
                await (0, safeCommitCore_1.logSafeCommitStatsIfNeeded)(root, 'commit', branch, scanRes.staged.length, [], scanRes.warnings);
                const shortHash = commitRes.shortHash || 'HEAD';
                panel.dispose();
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
                    const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', branch];
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
        });
        await ReviewPanelManager.updateContent(panel, targetFolder, configLoader, outputChannel);
    }
    static async updateContent(panel, folder, configLoader, _outputChannel) {
        const root = folder.uri.fsPath;
        const config = configLoader.getConfigFor(folder.uri);
        const repoState = await (0, repoDetector_1.detectRepoState)(root);
        const scanRes = await (0, safeCommitCore_1.scanStagedFiles)(root, config);
        const warnOnMain = vscode.workspace
            .getConfiguration('gitsanity')
            .get('warnOnMainBranch', true);
        const model = (0, reviewHtml_1.buildReviewViewModel)(repoState.branch || 'main', scanRes.staged, [...scanRes.errors, ...scanRes.warnings], warnOnMain);
        const nonce = crypto.randomBytes(16).toString('base64');
        panel.webview.html = (0, reviewHtml_1.renderReviewHtml)(model, nonce);
    }
}
exports.ReviewPanelManager = ReviewPanelManager;
//# sourceMappingURL=reviewPanel.js.map