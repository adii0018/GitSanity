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
exports.checkRepoPromptsOnOpen = checkRepoPromptsOnOpen;
const vscode = __importStar(require("vscode"));
const repoDetector_1 = require("../git/repoDetector");
const sessionCheckedFolders = new Set();
async function checkRepoPromptsOnOpen(context) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
        return;
    }
    const config = vscode.workspace.getConfiguration('gitsanity');
    const promptEnabled = config.get('promptOnOpen', true);
    if (!promptEnabled) {
        return;
    }
    for (const folder of folders) {
        if (folder.uri.scheme !== 'file') {
            continue;
        }
        const folderKey = folder.uri.fsPath;
        if (sessionCheckedFolders.has(folderKey)) {
            continue;
        }
        sessionCheckedFolders.add(folderKey);
        const dismissedKey = `gitsanity.dismissedPrompt.${folderKey}`;
        const isDismissed = context.workspaceState.get(dismissedKey, false);
        if (isDismissed) {
            continue;
        }
        try {
            const stateResult = await (0, repoDetector_1.detectRepoState)(folder.uri.fsPath);
            if (stateResult.state === 'no-repo') {
                const choice = await vscode.window.showInformationMessage('This folder is not a Git repository.', 'Create Repository', 'Not now', "Don't ask again");
                if (choice === 'Create Repository') {
                    vscode.commands.executeCommand('gitsanity.createRepository', folder);
                }
                else if (choice === "Don't ask again") {
                    await context.workspaceState.update(dismissedKey, true);
                }
            }
            else if (stateResult.state === 'local-repo' || stateResult.state === 'remote-repo') {
                const scanOfferedKey = `gitsanity.offeredScan.${folderKey}`;
                const scanOffered = context.workspaceState.get(scanOfferedKey, false);
                if (!scanOffered) {
                    await context.workspaceState.update(scanOfferedKey, true);
                    const choice = await vscode.window.showInformationMessage('Scan the entire project with GitSanity?', 'Scan Project', 'Not now', "Don't ask again");
                    if (choice === 'Scan Project') {
                        vscode.commands.executeCommand('gitsanity.scanProject', folder);
                    }
                    else if (choice === "Don't ask again") {
                        await context.workspaceState.update(dismissedKey, true);
                    }
                }
            }
        }
        catch { }
    }
}
//# sourceMappingURL=repoPrompts.js.map