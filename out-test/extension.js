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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const configLoader_1 = require("./config/configLoader");
const diagnosticsManager_1 = require("./diagnostics/diagnosticsManager");
const codeActionProvider_1 = require("./fixes/codeActionProvider");
const moveToEnv_1 = require("./fixes/moveToEnv");
const envWatcher_1 = require("./env/envWatcher");
const repoPrompts_1 = require("./commands/repoPrompts");
const repoDetector_1 = require("./git/repoDetector");
const hookInstaller_1 = require("./git/hookInstaller");
const eventLog_1 = require("./stats/eventLog");
const stats_1 = require("./stats/stats");
function activate(context) {
    const startTime = Date.now();
    // 1. Output Channel & Separate Project DiagnosticCollection
    const outputChannel = vscode.window.createOutputChannel('GitSanity');
    const projectDiagnostics = vscode.languages.createDiagnosticCollection('gitsanity-project');
    // 2. Initialize ConfigLoader, DiagnosticsManager & EnvWatcher
    const configLoader = new configLoader_1.ConfigLoader();
    const diagnosticsManager = new diagnosticsManager_1.DiagnosticsManager(configLoader);
    const envWatcher = new envWatcher_1.EnvWatcher(configLoader);
    // 3. Register CodeActionProvider for Quick Fixes
    const codeActionRegistration = vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new codeActionProvider_1.GitSanityCodeActionProvider(configLoader), {
        providedCodeActionKinds: codeActionProvider_1.GitSanityCodeActionProvider.providedCodeActionKinds
    });
    // 4. Create Left Status Bar Item (Click opens Menu)
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'gitsanity.menu';
    const updateStatusBar = async (counts) => {
        let branchInfo = '';
        let hookInfo = '';
        let streakInfo = '';
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.length > 0 && folders[0].uri.scheme === 'file') {
            try {
                const repo = await (0, repoDetector_1.detectRepoState)(folders[0].uri.fsPath);
                if (repo.branch) {
                    branchInfo = ` | Branch: ${repo.branch}`;
                }
                const hookActive = await (0, hookInstaller_1.isGitSanityHookInstalled)(folders[0].uri.fsPath);
                hookInfo = ` | Hook: ${hookActive ? 'active' : 'inactive'}`;
                const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(folders[0].uri.fsPath);
                const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
                const events = await (0, eventLog_1.readEvents)(logPath);
                const streak = (0, stats_1.computeStreak)(events);
                if (streak >= 1) {
                    streakInfo = ` | Streak: ${streak} clean commit${streak === 1 ? '' : 's'}`;
                }
            }
            catch { }
        }
        if (counts.total === 0) {
            statusBarItem.text = '$(shield) GitSanity: Clean';
            statusBarItem.tooltip = `GitSanity: Clean (0 issues)${branchInfo}${hookInfo}${streakInfo}. Click for GitSanity menu.`;
        }
        else {
            const errorText = `${counts.errors} error${counts.errors === 1 ? '' : 's'}`;
            const warningText = `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`;
            statusBarItem.text = `$(error) ${counts.errors} errors, $(warning) ${counts.warnings} warnings`;
            statusBarItem.tooltip = `GitSanity: ${errorText}, ${warningText}${branchInfo}${hookInfo}${streakInfo}. Click for GitSanity menu.`;
        }
    };
    // Initial status bar display
    updateStatusBar(diagnosticsManager.getIssueCounts());
    statusBarItem.show();
    // Subscribe to diagnostic updates
    const statusSubscription = diagnosticsManager.onDidChangeTotalIssues((counts) => {
        updateStatusBar(counts);
    });
    // 5. Register Commands (Lazy-load heavy modules to ensure fast activation)
    const createConfigCommand = vscode.commands.registerCommand('gitsanity.createConfig', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage('GitSanity: Please open a workspace folder to create .gitsanity.json.');
            return;
        }
        const targetFolder = folders[0];
        const configUri = vscode.Uri.joinPath(targetFolder.uri, '.gitsanity.json');
        try {
            await vscode.workspace.fs.stat(configUri);
            vscode.window.showInformationMessage('GitSanity: .gitsanity.json already exists.');
            const doc = await vscode.workspace.openTextDocument(configUri);
            await vscode.window.showTextDocument(doc);
            return;
        }
        catch { }
        const starterConfig = {
            $schema: './schemas/gitsanity.schema.json',
            rules: {
                'console-log': 'warn',
                debugger: 'error', // gitsanity-ignore debugger
                'conflict-marker': 'error',
                secret: 'error',
                'high-entropy-string': 'warn',
                'old-todo': 'off'
            },
            ignorePaths: ['tests/', 'scripts/'],
            maxFileSizeMB: 1,
            entropyThreshold: 4.5,
            entropyMinLength: 20,
            envFile: '.env',
            envExampleFile: '.env.example',
            createEnvExample: true,
            largeFileMB: 5,
            maxProjectFiles: 20000,
            blockOnWarnings: false,
            todoMaxAgeDays: 90
        };
        const content = Buffer.from(JSON.stringify(starterConfig, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(configUri, content);
        const doc = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(doc);
    });
    const rescanCommand = vscode.commands.registerCommand('gitsanity.rescanOpenFiles', () => {
        diagnosticsManager.rescanAllOpenDocuments();
    });
    const moveSecretCommand = vscode.commands.registerCommand('gitsanity.moveSecretToEnv', async (documentUri, range) => {
        await (0, moveToEnv_1.moveSecretToEnv)(documentUri, range, configLoader);
    });
    const moveAllSecretsCommand = vscode.commands.registerCommand('gitsanity.moveAllSecretsInFile', async () => {
        await (0, moveToEnv_1.moveAllSecretsInFile)(configLoader);
    });
    const addEnvToGitignoreCommand = vscode.commands.registerCommand('gitsanity.addEnvToGitignore', async (folderUri) => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0)
            return;
        const targetFolder = folderUri ? vscode.workspace.getWorkspaceFolder(folderUri) || folders[0] : folders[0];
        const config = configLoader.getConfigFor(targetFolder.uri);
        await envWatcher.addEnvToGitignoreForFolder(targetFolder, config.envFile || '.env');
    });
    const menuCommand = vscode.commands.registerCommand('gitsanity.menu', async () => {
        const { showGitSanityMenu } = await Promise.resolve().then(() => __importStar(require('./commands/menu')));
        await showGitSanityMenu();
    });
    const createRepoCommand = vscode.commands.registerCommand('gitsanity.createRepository', async (folder) => {
        const { createRepositoryCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await createRepositoryCommand(configLoader, projectDiagnostics, folder);
    });
    const scanProjCommand = vscode.commands.registerCommand('gitsanity.scanProject', async (folder) => {
        const { scanProjectCommand } = await Promise.resolve().then(() => __importStar(require('./commands/projectScanCommand')));
        await scanProjectCommand(configLoader, projectDiagnostics, folder);
    });
    const clearProjCommand = vscode.commands.registerCommand('gitsanity.clearProjectScan', async () => {
        const { clearProjectScanCommand } = await Promise.resolve().then(() => __importStar(require('./commands/projectScanCommand')));
        clearProjectScanCommand(projectDiagnostics);
    });
    const healthReportCommand = vscode.commands.registerCommand('gitsanity.showHealthReport', async (folder) => {
        const { showHealthReportCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await showHealthReportCommand(configLoader, projectDiagnostics, folder);
    });
    const scanHistoryCmd = vscode.commands.registerCommand('gitsanity.scanHistory', async (folder) => {
        const { scanHistoryCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await scanHistoryCommand(configLoader, folder);
    });
    const publishToGitHubCmd = vscode.commands.registerCommand('gitsanity.publishToGitHub', async (folder) => {
        const { publishToGitHubCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await publishToGitHubCommand(configLoader, folder);
    });
    const installHookCmd = vscode.commands.registerCommand('gitsanity.installHook', async (folder) => {
        const { installHookCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await installHookCommand(context, folder);
    });
    const uninstallHookCmd = vscode.commands.registerCommand('gitsanity.uninstallHook', async (folder) => {
        const { uninstallHookCommand } = await Promise.resolve().then(() => __importStar(require('./commands/repoCommands')));
        await uninstallHookCommand(folder);
    });
    const safeCommitCmd = vscode.commands.registerCommand('gitsanity.safeCommit', async () => {
        const { safeCommitCommand } = await Promise.resolve().then(() => __importStar(require('./commands/safeCommit')));
        await safeCommitCommand(configLoader, projectDiagnostics, outputChannel);
    });
    const undoCommitCmd = vscode.commands.registerCommand('gitsanity.undoLastCommit', async (folder) => {
        const { undoLastCommitCommand } = await Promise.resolve().then(() => __importStar(require('./commands/undoCommit')));
        await undoLastCommitCommand(folder);
    });
    const reviewBeforeCommitCmd = vscode.commands.registerCommand('gitsanity.reviewBeforeCommit', async () => {
        const { ReviewPanelManager } = await Promise.resolve().then(() => __importStar(require('./ui/reviewPanel')));
        await ReviewPanelManager.createOrShow(context.extensionUri, configLoader, outputChannel);
    });
    const showDashboardCmd = vscode.commands.registerCommand('gitsanity.showDashboard', async () => {
        const { DashboardPanelManager } = await Promise.resolve().then(() => __importStar(require('./ui/dashboard')));
        await DashboardPanelManager.createOrShow(context.extensionUri);
    });
    const findOldTodosCmd = vscode.commands.registerCommand('gitsanity.findOldTodos', async () => {
        const { findOldTodosCommand } = await Promise.resolve().then(() => __importStar(require('./commands/todoCommands')));
        await findOldTodosCommand(configLoader);
    });
    // 6. Register all disposables
    context.subscriptions.push(outputChannel, projectDiagnostics, configLoader, diagnosticsManager, envWatcher, codeActionRegistration, statusBarItem, statusSubscription, createConfigCommand, rescanCommand, moveSecretCommand, moveAllSecretsCommand, addEnvToGitignoreCommand, menuCommand, createRepoCommand, scanProjCommand, clearProjCommand, healthReportCommand, scanHistoryCmd, publishToGitHubCmd, installHookCmd, uninstallHookCmd, safeCommitCmd, undoCommitCmd, reviewBeforeCommitCmd, showDashboardCmd, findOldTodosCmd);
    // 7. On-open prompt (asynchronous, non-blocking)
    (0, repoPrompts_1.checkRepoPromptsOnOpen)(context);
    // 8. Debug activation measurement
    if (context.extensionMode === vscode.ExtensionMode.Development) {
        outputChannel.appendLine(`[debug] GitSanity activated in ${Date.now() - startTime}ms`);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map