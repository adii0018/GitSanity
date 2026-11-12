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
exports.DashboardPanelManager = exports.renderDashboardHtml = exports.renderBarChartSvg = exports.buildDashboardViewModel = void 0;
exports.setSessionProjectScanSummary = setSessionProjectScanSummary;
exports.getSessionProjectScanSummary = getSessionProjectScanSummary;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const hookInstaller_1 = require("../git/hookInstaller");
const eventLog_1 = require("../stats/eventLog");
const dashboardHtml_1 = require("./dashboardHtml");
Object.defineProperty(exports, "buildDashboardViewModel", { enumerable: true, get: function () { return dashboardHtml_1.buildDashboardViewModel; } });
Object.defineProperty(exports, "renderBarChartSvg", { enumerable: true, get: function () { return dashboardHtml_1.renderBarChartSvg; } });
Object.defineProperty(exports, "renderDashboardHtml", { enumerable: true, get: function () { return dashboardHtml_1.renderDashboardHtml; } });
// In-memory session store of the latest project scan
let sessionProjectScanSummary;
function setSessionProjectScanSummary(summary) {
    sessionProjectScanSummary = summary;
}
function getSessionProjectScanSummary() {
    return sessionProjectScanSummary;
}
class DashboardPanelManager {
    static async createOrShow(extensionUri) {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage('GitSanity: Git operations and stats are disabled in untrusted workspaces.');
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
                placeHolder: 'Select workspace folder for dashboard'
            });
            if (!picked)
                return;
            targetFolder = picked;
        }
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (DashboardPanelManager.currentPanel) {
            DashboardPanelManager.currentPanel.reveal(column);
            await DashboardPanelManager.updateContent(DashboardPanelManager.currentPanel, targetFolder);
            return;
        }
        const panel = vscode.window.createWebviewPanel('gitsanityDashboard', 'GitSanity Dashboard', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: []
        });
        DashboardPanelManager.currentPanel = panel;
        panel.onDidDispose(() => {
            DashboardPanelManager.currentPanel = undefined;
        });
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'installHook') {
                vscode.commands.executeCommand('gitsanity.installHook', targetFolder);
            }
            else if (msg.command === 'openFile') {
                if (typeof msg.file === 'string') {
                    const root = path.resolve(targetFolder.uri.fsPath);
                    const filePath = path.resolve(root, msg.file);
                    if (filePath === root || filePath.startsWith(root + path.sep)) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(filePath);
                            await vscode.window.showTextDocument(doc);
                        }
                        catch { }
                    }
                }
            }
            else if (msg.command === 'resetStats') {
                const confirm = await vscode.window.showWarningMessage('Reset all GitSanity statistics for this repository?', { modal: true }, 'Reset');
                if (confirm === 'Reset') {
                    try {
                        const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(targetFolder.uri.fsPath);
                        const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
                        if (fs.existsSync(logPath)) {
                            await fs.promises.unlink(logPath);
                        }
                        vscode.window.showInformationMessage('GitSanity: Statistics reset successfully.');
                        await DashboardPanelManager.updateContent(panel, targetFolder);
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`GitSanity: Failed to reset statistics.`);
                    }
                }
            }
        });
        await DashboardPanelManager.updateContent(panel, targetFolder);
    }
    static async updateContent(panel, folder) {
        const root = folder.uri.fsPath;
        let events = [];
        try {
            const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(root);
            const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
            events = await (0, eventLog_1.readEvents)(logPath);
        }
        catch { }
        const model = (0, dashboardHtml_1.buildDashboardViewModel)(events, new Date(), getSessionProjectScanSummary());
        const nonce = crypto.randomBytes(16).toString('base64');
        panel.webview.html = (0, dashboardHtml_1.renderDashboardHtml)(model, nonce);
    }
}
exports.DashboardPanelManager = DashboardPanelManager;
//# sourceMappingURL=dashboard.js.map