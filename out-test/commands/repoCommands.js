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
exports.lastHistoryFindings = void 0;
exports.createRepositoryCommand = createRepositoryCommand;
exports.showHealthReportCommand = showHealthReportCommand;
exports.scanHistoryCommand = scanHistoryCommand;
exports.publishToGitHubCommand = publishToGitHubCommand;
exports.installHookCommand = installHookCommand;
exports.uninstallHookCommand = uninstallHookCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const repoInitializer_1 = require("../git/repoInitializer");
const repoDetector_1 = require("../git/repoDetector");
const gitRunner_1 = require("../git/gitRunner");
const gitignoreFile_1 = require("../env/gitignoreFile");
const hookInstaller_1 = require("../git/hookInstaller");
const historyScanner_1 = require("../git/historyScanner");
const projectScanner_1 = require("../scanner/projectScanner");
const healthReport_1 = require("../ui/healthReport");
const githubPublisher_1 = require("../git/githubPublisher");
const redact_1 = require("../git/redact");
const projectScanCommand_1 = require("./projectScanCommand");
function getActiveFolder(targetFolder) {
    if (targetFolder)
        return targetFolder;
    const folders = vscode.workspace.workspaceFolders || [];
    return folders.length > 0 ? folders[0] : undefined;
}
/**
 * gitsanity.createRepository command
 */
async function createRepositoryCommand(configLoader, projectDiagnostics, targetFolder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
        return;
    }
    const folder = getActiveFolder(targetFolder);
    if (!folder) {
        vscode.window.showErrorMessage('GitSanity: No folder open to initialize as Git repository.');
        return;
    }
    const root = folder.uri.fsPath;
    const config = configLoader.getConfigFor(folder.uri);
    const initResult = await (0, repoInitializer_1.initRepo)(root, config.envFile || '.env');
    if (!initResult.success) {
        vscode.window.showErrorMessage(`GitSanity: ${initResult.error || 'Failed to initialize Git repository.'}`);
        return;
    }
    vscode.window.showInformationMessage(`GitSanity: Initialized Git repository in ${folder.name}${initResult.createdGitignore ? ' with starter .gitignore' : ''}.`);
    // Ask to create the first commit
    const commitChoice = await vscode.window.showInformationMessage('Create the first commit?', { modal: true }, 'Yes, commit', 'Not now');
    if (commitChoice !== 'Yes, commit') {
        return;
    }
    // Run project scan first
    const scanResult = await (0, projectScanner_1.scanProject)(root, { config });
    if (scanResult.countsBySeverity.error > 0) {
        const errorChoice = await vscode.window.showWarningMessage(`Project scan found ${scanResult.countsBySeverity.error} error-severity finding(s). Committing them will leak them to git history.`, { modal: true }, 'Commit anyway', 'Cancel');
        if (errorChoice !== 'Commit anyway') {
            return;
        }
    }
    // Check user.name and user.email
    const repoState = await (0, repoDetector_1.detectRepoState)(root);
    if (!repoState.userConfigured) {
        vscode.window.showErrorMessage('GitSanity: Git user.name and user.email are not configured. Run:\n' +
            'git config user.name "Your Name"\n' +
            'git config user.email "your.email@example.com"');
        return;
    }
    await (0, gitRunner_1.runGit)(['add', '-A'], root);
    const commitRes = await (0, gitRunner_1.runGit)(['commit', '-m', 'chore: initial commit'], root);
    if (commitRes.code === 0) {
        vscode.window.showInformationMessage('GitSanity: Created initial commit ("chore: initial commit").');
    }
    else {
        vscode.window.showErrorMessage(`GitSanity: Initial commit failed: ${commitRes.stderr}`);
    }
}
/**
 * gitsanity.showHealthReport command
 */
async function showHealthReportCommand(configLoader, projectDiagnostics, targetFolder) {
    const folder = getActiveFolder(targetFolder);
    if (!folder) {
        vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
        return;
    }
    const root = folder.uri.fsPath;
    const config = configLoader.getConfigFor(folder.uri);
    let scanResult = projectScanCommand_1.lastProjectScanResult?.folder.uri.fsPath === root ? projectScanCommand_1.lastProjectScanResult.result : undefined;
    if (!scanResult) {
        scanResult = await (0, projectScanner_1.scanProject)(root, { config });
    }
    const repoState = await (0, repoDetector_1.detectRepoState)(root);
    const hookInstalled = await (0, hookInstaller_1.isGitSanityHookInstalled)(root);
    // Check .gitignore for .env
    let gitignoreText = '';
    try {
        gitignoreText = await fs.promises.readFile(path.join(root, '.gitignore'), 'utf8');
    }
    catch { }
    const envIgnored = (0, gitignoreFile_1.isEnvIgnored)(gitignoreText, config.envFile || '.env');
    // Check tracked .env files
    const trackedEnvFiles = [];
    const lsRes = await (0, gitRunner_1.runGit)(['ls-files', '-z'], root);
    if (lsRes.code === 0 && lsRes.stdout) {
        const trackedList = lsRes.stdout.split('\0').filter(Boolean);
        for (const f of trackedList) {
            const base = path.basename(f);
            if ((base === '.env' || base.startsWith('.env.')) &&
                !base.endsWith('.example') &&
                !base.endsWith('.sample') &&
                !base.endsWith('.template')) {
                trackedEnvFiles.push(f);
            }
        }
    }
    // Check node_modules/ ignored when package.json exists
    let nodeModulesIgnored = true;
    if (fs.existsSync(path.join(root, 'package.json'))) {
        nodeModulesIgnored = (0, gitignoreFile_1.isEnvIgnored)(gitignoreText, 'node_modules');
    }
    // Large tracked files
    const largeFiles = [];
    const largeThreshold = (config.largeFileMB || 5) * 1024 * 1024;
    if (lsRes.code === 0 && lsRes.stdout) {
        const files = lsRes.stdout.split('\0').filter(Boolean);
        for (const f of files) {
            try {
                const stat = await fs.promises.stat(path.join(root, f));
                if (stat.size > largeThreshold) {
                    largeFiles.push({ path: f, sizeMB: stat.size / (1024 * 1024) });
                }
            }
            catch { }
        }
    }
    largeFiles.sort((a, b) => b.sizeMB - a.sizeMB);
    const historyFindings = exports.lastHistoryFindings?.folder.uri.fsPath === root ? exports.lastHistoryFindings.findings : undefined;
    const data = {
        folder,
        repoState,
        isHookInstalled: hookInstalled,
        scanResult,
        envIgnored,
        trackedEnvFiles,
        nodeModulesIgnored,
        largeFiles: largeFiles.slice(0, 10),
        historyFindings
    };
    healthReport_1.HealthReportPanel.show(data);
}
/**
 * gitsanity.scanHistory command
 */
async function scanHistoryCommand(configLoader, targetFolder) {
    const folder = getActiveFolder(targetFolder);
    if (!folder)
        return;
    const root = folder.uri.fsPath;
    const config = configLoader.getConfigFor(folder.uri);
    const confirmed = await vscode.window.showInformationMessage('Scan Git commit history for leaked secrets? This only reads commit diffs and never rewrites history.', { modal: true }, 'Start Scan', 'Cancel');
    if (confirmed !== 'Start Scan') {
        return;
    }
    const maxCommits = vscode.workspace.getConfiguration('gitsanity').get('historyMaxCommits', 500);
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'GitSanity: Scanning Git commit history...',
        cancellable: true
    }, async (progress, token) => {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());
        const historyResult = await (0, historyScanner_1.scanHistory)(root, {
            maxCommits,
            config,
            signal: abortController.signal,
            onProgress: (scanned) => {
                progress.report({ message: `${scanned} commits analyzed` });
            }
        });
        exports.lastHistoryFindings = { folder, findings: historyResult.findings };
        if (historyResult.findings.length === 0) {
            vscode.window.showInformationMessage(`GitSanity: History scan clean. Analyzed ${historyResult.commitsScanned} commits with 0 secret leaks found.`);
        }
        else {
            vscode.window
                .showWarningMessage(`GitSanity: Found ${historyResult.findings.length} secret finding(s) in ${historyResult.commitsScanned} commits. Deleting the secret from code does not remove it from history. Rotate any exposed secret. GitSanity never rewrites history.`, 'Show Health Report')
                .then((choice) => {
                if (choice === 'Show Health Report') {
                    vscode.commands.executeCommand('gitsanity.showHealthReport', folder);
                }
            });
        }
    });
}
/**
 * gitsanity.publishToGitHub command
 */
async function publishToGitHubCommand(configLoader, targetFolder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
        return;
    }
    const folder = getActiveFolder(targetFolder);
    if (!folder)
        return;
    const root = folder.uri.fsPath;
    const repoState = await (0, repoDetector_1.detectRepoState)(root);
    if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
        const choice = await vscode.window.showWarningMessage('No Git repository found in this folder. Create one first?', 'Create Repository');
        if (choice === 'Create Repository') {
            await vscode.commands.executeCommand('gitsanity.createRepository', folder);
        }
        return;
    }
    if (!repoState.hasCommits) {
        vscode.window.showErrorMessage('GitSanity: Repository has no commits yet. Make at least one commit before publishing to GitHub.');
        return;
    }
    // Check if remote 'origin' already exists
    if (repoState.remotes.some((r) => r.name === 'origin')) {
        vscode.window.showWarningMessage("GitSanity: Remote 'origin' already exists. Publish aborted.");
        return;
    }
    // Authenticate with GitHub session
    let session;
    try {
        session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
    }
    catch (err) {
        vscode.window.showErrorMessage('GitSanity: GitHub authentication failed or was cancelled.');
        return;
    }
    if (!session) {
        return;
    }
    // Prompt for repo name
    const defaultRepoName = folder.name.replace(/[^A-Za-z0-9._-]/g, '-');
    const repoName = await vscode.window.showInputBox({
        prompt: 'Enter name for new GitHub repository:',
        value: defaultRepoName,
        validateInput: githubPublisher_1.validateRepoName
    });
    if (!repoName)
        return;
    // Prompt visibility
    const visibilityChoice = await vscode.window.showQuickPick([
        { label: 'Private (recommended)', description: 'Only you can see this repository', isPrivate: true },
        { label: 'Public', description: 'Anyone on the internet can see this repository', isPrivate: false }
    ], { placeHolder: 'Select repository visibility' });
    if (!visibilityChoice)
        return;
    // If Public -> confirm and run project scan
    if (!visibilityChoice.isPrivate) {
        const confirmPublic = await vscode.window.showWarningMessage('Are you sure you want to create a PUBLIC repository? Anyone will be able to clone and read your code.', { modal: true }, 'Publish Public Repository', 'Cancel');
        if (confirmPublic !== 'Publish Public Repository')
            return;
        const config = configLoader.getConfigFor(folder.uri);
        const scanResult = await (0, projectScanner_1.scanProject)(root, { config });
        if (scanResult.countsBySeverity.error > 0) {
            const overrideChoice = await vscode.window.showErrorMessage(`GitSanity blocked publish: ${scanResult.countsBySeverity.error} error-severity issue(s) detected in project. Publishing publicly would expose secrets!`, { modal: true }, 'Publish anyway', 'Cancel');
            if (overrideChoice !== 'Publish anyway')
                return;
        }
    }
    // Create repository via GitHub API
    let createRes;
    try {
        createRes = await (0, githubPublisher_1.createGitHubRepo)({
            token: session.accessToken,
            name: repoName.trim(),
            isPrivate: visibilityChoice.isPrivate
        });
    }
    catch (err) {
        vscode.window.showErrorMessage(`GitSanity: ${err.message || 'Failed to create GitHub repository.'}`);
        return;
    }
    // git remote add origin <clone_url>
    const remoteRes = await (0, gitRunner_1.runGit)(['remote', 'add', 'origin', createRes.cloneUrl], root);
    if (remoteRes.code !== 0) {
        vscode.window.showErrorMessage(`GitSanity: Failed to add remote origin: ${remoteRes.stderr}`);
        return;
    }
    // Ask to push now
    const pushChoice = await vscode.window.showInformationMessage(`Created GitHub repository '${repoName}'. Push current branch now?`, { modal: true }, 'Push', 'Not now');
    if (pushChoice === 'Push') {
        const branch = repoState.branch || 'main';
        const pushRes = await (0, gitRunner_1.runGit)(['push', '-u', 'origin', branch], root);
        if (pushRes.code !== 0) {
            const firstLines = pushRes.stderr.split(/\r?\n/).slice(0, 5).join('\n');
            vscode.window.showErrorMessage(`GitSanity: Push failed. The GitHub repository was created at ${createRes.htmlUrl}.\n${(0, redact_1.redact)(firstLines)}`);
        }
        else {
            vscode.window
                .showInformationMessage(`GitSanity: Successfully pushed '${branch}' to ${createRes.htmlUrl}.`, 'Open on GitHub')
                .then((c) => {
                if (c === 'Open on GitHub') {
                    vscode.env.openExternal(vscode.Uri.parse(createRes.htmlUrl));
                }
            });
            return;
        }
    }
    vscode.window
        .showInformationMessage(`GitSanity: GitHub repository created at ${createRes.htmlUrl}.`, 'Open on GitHub')
        .then((c) => {
        if (c === 'Open on GitHub') {
            vscode.env.openExternal(vscode.Uri.parse(createRes.htmlUrl));
        }
    });
}
/**
 * gitsanity.installHook command
 */
async function installHookCommand(extensionContext, targetFolder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Hook management is disabled in untrusted workspaces.');
        return;
    }
    const folder = getActiveFolder(targetFolder);
    if (!folder)
        return;
    const bundlePath = path.join(extensionContext.extensionPath, 'out', 'hook', 'pre-commit.bundle.js');
    const res = await (0, hookInstaller_1.installGitHook)(folder.uri.fsPath, bundlePath);
    if (!res.success) {
        vscode.window.showErrorMessage(`GitSanity: ${res.message || 'Failed to install pre-commit hook.'}`);
        return;
    }
    let msg = 'GitSanity: Pre-commit hook installed successfully.';
    if (res.warning) {
        msg += ` (Note: ${res.warning})`;
    }
    vscode.window.showInformationMessage(msg);
}
/**
 * gitsanity.uninstallHook command
 */
async function uninstallHookCommand(targetFolder) {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage('GitSanity: Hook management is disabled in untrusted workspaces.');
        return;
    }
    const folder = getActiveFolder(targetFolder);
    if (!folder)
        return;
    const res = await (0, hookInstaller_1.uninstallGitHook)(folder.uri.fsPath);
    if (!res.success) {
        vscode.window.showErrorMessage(`GitSanity: ${res.message || 'Failed to uninstall pre-commit hook.'}`);
        return;
    }
    vscode.window.showInformationMessage('GitSanity: Pre-commit hook removed successfully.');
}
//# sourceMappingURL=repoCommands.js.map