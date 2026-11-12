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
exports.lastProjectScanResult = void 0;
exports.scanProjectCommand = scanProjectCommand;
exports.clearProjectScanCommand = clearProjectScanCommand;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const projectScanner_1 = require("../scanner/projectScanner");
const dashboard_1 = require("../ui/dashboard");
async function scanProjectCommand(configLoader, projectDiagnostics, targetFolder) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
        return undefined;
    }
    let folder = targetFolder || folders[0];
    if (!targetFolder && folders.length > 1) {
        const picked = await vscode.window.showWorkspaceFolderPick({
            placeHolder: 'Select workspace folder to scan'
        });
        if (!picked)
            return undefined;
        folder = picked;
    }
    const config = configLoader.getConfigFor(folder.uri);
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'GitSanity: Scanning project...',
        cancellable: true
    }, async (progress, token) => {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());
        const scanResult = await (0, projectScanner_1.scanProject)(folder.uri.fsPath, {
            config,
            signal: abortController.signal,
            onProgress: (scanned, total) => {
                progress.report({
                    message: `${scanned}/${total} files scanned`
                });
            }
        });
        exports.lastProjectScanResult = { folder, result: scanResult };
        const summaryList = Array.from(scanResult.byFile.entries())
            .map(([file, findings]) => {
            let errs = 0;
            let warns = 0;
            for (const f of findings) {
                if (f.severity === 'error')
                    errs++;
                else
                    warns++;
            }
            return { file, errors: errs, warnings: warns, total: errs + warns };
        })
            .sort((a, b) => b.total - a.total);
        (0, dashboard_1.setSessionProjectScanSummary)(summaryList);
        // Publish findings to separate DiagnosticCollection "gitsanity-project" (cap 5000)
        projectDiagnostics.clear();
        let totalPublished = 0;
        const MAX_DIAGNOSTICS = 5000;
        for (const [relPath, findings] of scanResult.byFile.entries()) {
            if (totalPublished >= MAX_DIAGNOSTICS)
                break;
            const fileUri = vscode.Uri.file(path.join(folder.uri.fsPath, relPath));
            const diags = [];
            for (const f of findings) {
                if (totalPublished >= MAX_DIAGNOSTICS)
                    break;
                const range = new vscode.Range(f.line, f.startCol, f.line, f.endCol);
                const diag = new vscode.Diagnostic(range, f.message, f.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
                diag.source = 'GitSanity';
                diag.code = f.ruleId;
                diags.push(diag);
                totalPublished++;
            }
            projectDiagnostics.set(fileUri, diags);
        }
        const totalIssues = scanResult.countsBySeverity.error + scanResult.countsBySeverity.warning;
        const summaryMsg = `GitSanity: Project scan complete. Scanned ${scanResult.filesScanned} files. Found ${scanResult.countsBySeverity.error} error(s), ${scanResult.countsBySeverity.warning} warning(s).`;
        vscode.window
            .showInformationMessage(summaryMsg, 'Show Health Report', 'View Problems')
            .then((choice) => {
            if (choice === 'Show Health Report') {
                vscode.commands.executeCommand('gitsanity.showHealthReport', folder);
            }
            else if (choice === 'View Problems') {
                vscode.commands.executeCommand('workbench.actions.view.problems');
            }
        });
        return scanResult;
    });
}
function clearProjectScanCommand(projectDiagnostics) {
    projectDiagnostics.clear();
    exports.lastProjectScanResult = undefined;
    vscode.window.showInformationMessage('GitSanity: Cleared project scan diagnostics.');
}
//# sourceMappingURL=projectScanCommand.js.map