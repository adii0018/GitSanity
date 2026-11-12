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
exports.undoLastCommitCommand = undoLastCommitCommand;
const vscode = __importStar(require("vscode"));
const gitRunner_1 = require("../git/gitRunner");
async function undoLastCommitCommand(folder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
        return;
    }
    let targetFolder = folder;
    if (!targetFolder) {
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.length === 0)
            return;
        if (folders.length === 1) {
            targetFolder = folders[0];
        }
        else {
            const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Select repository to undo commit' });
            if (!picked)
                return;
            targetFolder = picked;
        }
    }
    const root = targetFolder.uri.fsPath;
    // 1. Check if HEAD has a parent
    const parentRes = await (0, gitRunner_1.runGit)(['rev-parse', '--verify', 'HEAD~1'], root);
    if (parentRes.code !== 0) {
        vscode.window.showErrorMessage('GitSanity: Cannot undo initial commit (HEAD has no parent).');
        return;
    }
    // 2. Check if HEAD is a merge commit
    const mergeRes = await (0, gitRunner_1.runGit)(['rev-parse', '--verify', 'HEAD^2'], root);
    if (mergeRes.code === 0) {
        vscode.window.showErrorMessage('GitSanity: Cannot undo merge commit safely.');
        return;
    }
    // 3. Check if HEAD is already reachable from upstream
    const upstreamCheck = await (0, gitRunner_1.runGit)(['rev-parse', '--abbrev-ref', '@{u}'], root);
    if (upstreamCheck.code === 0) {
        // Upstream exists, check unpushed commits
        const unpushedRes = await (0, gitRunner_1.runGit)(['rev-list', '@{u}..HEAD'], root);
        if (unpushedRes.code === 0) {
            const unpushed = unpushedRes.stdout.trim();
            if (!unpushed) {
                vscode.window.showErrorMessage('GitSanity: Cannot undo commit that has already been pushed to upstream.');
                return;
            }
        }
    }
    // Modal confirmation
    const confirm = await vscode.window.showWarningMessage('Undo last commit? Changes will remain staged in your index.', { modal: true }, 'Undo Commit');
    if (confirm !== 'Undo Commit') {
        return;
    }
    const resetRes = await (0, gitRunner_1.runGit)(['reset', '--soft', 'HEAD~1'], root);
    if (resetRes.code !== 0) {
        vscode.window.showErrorMessage(`GitSanity: Failed to undo commit: ${resetRes.stderr}`);
        return;
    }
    vscode.window.showInformationMessage('GitSanity: Successfully undone last commit. Changes remain staged.');
}
//# sourceMappingURL=undoCommit.js.map