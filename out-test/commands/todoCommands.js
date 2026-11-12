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
exports.findOldTodosCommand = findOldTodosCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitRunner_1 = require("../git/gitRunner");
const pathMatcher_1 = require("../config/pathMatcher");
const todoFinder_1 = require("../todo/todoFinder");
const todoAge_1 = require("../todo/todoAge");
async function findOldTodosCommand(configLoader) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
        return;
    }
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
        return;
    }
    let folder = folders[0];
    if (folders.length > 1) {
        const picked = await vscode.window.showWorkspaceFolderPick({
            placeHolder: 'Select workspace folder to inspect for old TODOs'
        });
        if (!picked)
            return;
        folder = picked;
    }
    const root = folder.uri.fsPath;
    const config = configLoader.getConfigFor(folder.uri);
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'GitSanity: Finding old TODO comments...',
        cancellable: true
    }, async (progress, token) => {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());
        // Get tracked files via git ls-files (cap at 5000)
        const lsRes = await (0, gitRunner_1.runGit)(['ls-files', '-z'], root, { signal: abortController.signal });
        if (lsRes.code !== 0) {
            vscode.window.showWarningMessage('GitSanity: Unable to list tracked Git files.');
            return;
        }
        const files = lsRes.stdout
            .split('\0')
            .map((f) => f.trim())
            .filter((f) => f.length > 0)
            .slice(0, 5000);
        const items = [];
        const now = Date.now();
        const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
        let scannedCount = 0;
        for (const relPath of files) {
            if (token.isCancellationRequested)
                break;
            scannedCount++;
            if (scannedCount % 50 === 0) {
                progress.report({
                    message: `${scannedCount}/${files.length} files scanned`
                });
            }
            if ((0, pathMatcher_1.isIgnored)(relPath, config.ignorePaths))
                continue;
            const fullPath = path.join(root, relPath);
            let stat;
            try {
                stat = await fs.promises.stat(fullPath);
                if (stat.size > maxSizeBytes)
                    continue;
            }
            catch {
                continue;
            }
            let content = '';
            try {
                content = await fs.promises.readFile(fullPath, 'utf8');
            }
            catch {
                continue;
            }
            const todos = (0, todoFinder_1.findTodoLines)(content);
            if (todos.length === 0)
                continue;
            const lines = todos.map((t) => t.line);
            const ageMap = await (0, todoAge_1.getTodoAges)(root, relPath, lines, now, config.maxFileSizeMB);
            const contentLines = content.split(/\r?\n/);
            for (const t of todos) {
                const ageDays = ageMap.get(t.line);
                if (ageDays !== undefined) {
                    const rawLine = contentLines[t.line] || '';
                    const preview = rawLine.trim().substring(0, 100);
                    items.push({
                        relPath,
                        line: t.line,
                        tag: t.tag,
                        ageDays,
                        preview
                    });
                }
            }
        }
        if (token.isCancellationRequested)
            return;
        if (items.length === 0) {
            vscode.window.showInformationMessage('GitSanity: No committed TODO comments found.');
            return;
        }
        // Sort oldest first
        items.sort((a, b) => b.ageDays - a.ageDays);
        const picks = items.map((item) => ({
            label: `$(clock) ${item.ageDays} day(s) old: ${item.tag} in ${item.relPath}:${item.line + 1}`,
            description: item.preview,
            detail: `Committed ~${item.ageDays} day(s) ago`,
            todo: item
        }));
        const selected = await vscode.window.showQuickPick(picks, {
            placeHolder: `Found ${items.length} TODO(s) sorted oldest first. Select one to open:`
        });
        if (selected) {
            const docPath = path.join(root, selected.todo.relPath);
            try {
                const doc = await vscode.workspace.openTextDocument(docPath);
                await vscode.window.showTextDocument(doc, {
                    selection: new vscode.Range(selected.todo.line, 0, selected.todo.line, 0)
                });
            }
            catch { }
        }
    });
}
//# sourceMappingURL=todoCommands.js.map