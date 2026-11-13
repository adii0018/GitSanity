import * as vscode from 'vscode';
import { ConfigLoader } from './config/configLoader';
import { DiagnosticsManager, IssueCounts } from './diagnostics/diagnosticsManager';
import { GitSanityCodeActionProvider } from './fixes/codeActionProvider';
import { moveSecretToEnv, moveAllSecretsInFile } from './fixes/moveToEnv';
import { EnvWatcher } from './env/envWatcher';
import { checkRepoPromptsOnOpen } from './commands/repoPrompts';
import { detectRepoState } from './git/repoDetector';
import { isGitSanityHookInstalled, resolveGitPaths } from './git/hookInstaller';
import { getEventLogPath, readEvents } from './stats/eventLog';
import { computeStreak } from './stats/stats';
import { GitSanityStatusTreeProvider, GitSanityActionsTreeProvider } from './ui/sidebar';

export function activate(context: vscode.ExtensionContext): void {
  const startTime = Date.now();

  // 1. Output Channel & Separate Project DiagnosticCollection
  const outputChannel = vscode.window.createOutputChannel('GitSanity');
  const projectDiagnostics = vscode.languages.createDiagnosticCollection('gitsanity-project');

  // 2. Initialize ConfigLoader, DiagnosticsManager & EnvWatcher
  const configLoader = new ConfigLoader();
  const diagnosticsManager = new DiagnosticsManager(configLoader);
  const envWatcher = new EnvWatcher(configLoader);

  // 3. Register CodeActionProvider for Quick Fixes
  const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    new GitSanityCodeActionProvider(configLoader),
    {
      providedCodeActionKinds: GitSanityCodeActionProvider.providedCodeActionKinds
    }
  );

  // 4. Create Left Status Bar Item (Click opens Menu)
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitsanity.menu';

  const updateStatusBar = async (counts: IssueCounts): Promise<void> => {
    let branchInfo = '';
    let hookInfo = '';
    let streakInfo = '';

    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length > 0 && folders[0].uri.scheme === 'file') {
      try {
        const repo = await detectRepoState(folders[0].uri.fsPath);
        if (repo.branch) {
          branchInfo = ` | Branch: ${repo.branch}`;
        }
        const hookActive = await isGitSanityHookInstalled(folders[0].uri.fsPath);
        hookInfo = ` | Hook: ${hookActive ? 'active' : 'inactive'}`;

        const { commonDir } = await resolveGitPaths(folders[0].uri.fsPath);
        const logPath = getEventLogPath(commonDir);
        const events = await readEvents(logPath);
        const streak = computeStreak(events);
        if (streak >= 1) {
          streakInfo = ` | Streak: ${streak} clean commit${streak === 1 ? '' : 's'}`;
        }
      } catch {}
    }

    if (counts.total === 0) {
      statusBarItem.text = '$(shield) GitSanity: Clean';
      statusBarItem.tooltip = `GitSanity: Clean (0 issues)${branchInfo}${hookInfo}${streakInfo}. Click for GitSanity menu.`;
    } else {
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
    } catch {}

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

  const moveSecretCommand = vscode.commands.registerCommand(
    'gitsanity.moveSecretToEnv',
    async (documentUri: vscode.Uri, range: vscode.Range) => {
      await moveSecretToEnv(documentUri, range, configLoader);
    }
  );

  const moveAllSecretsCommand = vscode.commands.registerCommand('gitsanity.moveAllSecretsInFile', async () => {
    await moveAllSecretsInFile(configLoader);
  });

  const addEnvToGitignoreCommand = vscode.commands.registerCommand(
    'gitsanity.addEnvToGitignore',
    async (folderUri?: vscode.Uri) => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      const targetFolder = folderUri ? vscode.workspace.getWorkspaceFolder(folderUri) || folders[0] : folders[0];
      const config = configLoader.getConfigFor(targetFolder.uri);
      await envWatcher.addEnvToGitignoreForFolder(targetFolder, config.envFile || '.env');
    }
  );

  const menuCommand = vscode.commands.registerCommand('gitsanity.menu', async () => {
    const { showGitSanityMenu } = await import('./commands/menu');
    await showGitSanityMenu();
  });

  const createRepoCommand = vscode.commands.registerCommand(
    'gitsanity.createRepository',
    async (folder?: vscode.WorkspaceFolder) => {
      const { createRepositoryCommand } = await import('./commands/repoCommands');
      await createRepositoryCommand(configLoader, projectDiagnostics, folder);
    }
  );

  const scanProjCommand = vscode.commands.registerCommand(
    'gitsanity.scanProject',
    async (folder?: vscode.WorkspaceFolder) => {
      const { scanProjectCommand } = await import('./commands/projectScanCommand');
      await scanProjectCommand(configLoader, projectDiagnostics, folder);
    }
  );

  const clearProjCommand = vscode.commands.registerCommand('gitsanity.clearProjectScan', async () => {
    const { clearProjectScanCommand } = await import('./commands/projectScanCommand');
    clearProjectScanCommand(projectDiagnostics);
  });

  const healthReportCommand = vscode.commands.registerCommand(
    'gitsanity.showHealthReport',
    async (folder?: vscode.WorkspaceFolder) => {
      const { showHealthReportCommand } = await import('./commands/repoCommands');
      await showHealthReportCommand(configLoader, projectDiagnostics, folder);
    }
  );

  const scanHistoryCmd = vscode.commands.registerCommand(
    'gitsanity.scanHistory',
    async (folder?: vscode.WorkspaceFolder) => {
      const { scanHistoryCommand } = await import('./commands/repoCommands');
      await scanHistoryCommand(configLoader, folder);
    }
  );

  const publishToGitHubCmd = vscode.commands.registerCommand(
    'gitsanity.publishToGitHub',
    async (folder?: vscode.WorkspaceFolder) => {
      const { publishToGitHubCommand } = await import('./commands/repoCommands');
      await publishToGitHubCommand(configLoader, folder);
    }
  );

  const installHookCmd = vscode.commands.registerCommand(
    'gitsanity.installHook',
    async (folder?: vscode.WorkspaceFolder) => {
      const { installHookCommand } = await import('./commands/repoCommands');
      await installHookCommand(context, folder);
    }
  );

  const uninstallHookCmd = vscode.commands.registerCommand(
    'gitsanity.uninstallHook',
    async (folder?: vscode.WorkspaceFolder) => {
      const { uninstallHookCommand } = await import('./commands/repoCommands');
      await uninstallHookCommand(folder);
    }
  );

  const safeCommitCmd = vscode.commands.registerCommand('gitsanity.safeCommit', async () => {
    const { safeCommitCommand } = await import('./commands/safeCommit');
    await safeCommitCommand(configLoader, projectDiagnostics, outputChannel);
  });

  const undoCommitCmd = vscode.commands.registerCommand(
    'gitsanity.undoLastCommit',
    async (folder?: vscode.WorkspaceFolder) => {
      const { undoLastCommitCommand } = await import('./commands/undoCommit');
      await undoLastCommitCommand(folder);
    }
  );

  const reviewBeforeCommitCmd = vscode.commands.registerCommand('gitsanity.reviewBeforeCommit', async () => {
    const { ReviewPanelManager } = await import('./ui/reviewPanel');
    await ReviewPanelManager.createOrShow(context.extensionUri, configLoader, outputChannel);
  });

  const showDashboardCmd = vscode.commands.registerCommand('gitsanity.showDashboard', async () => {
    const { DashboardPanelManager } = await import('./ui/dashboard');
    await DashboardPanelManager.createOrShow(context.extensionUri);
  });

  const findOldTodosCmd = vscode.commands.registerCommand('gitsanity.findOldTodos', async () => {
    const { findOldTodosCommand } = await import('./commands/todoCommands');
    await findOldTodosCommand(configLoader);
  });

  // 6. Register Activity Bar Sidebar Tree Views
  const statusTreeProvider = new GitSanityStatusTreeProvider(diagnosticsManager);
  const actionsTreeProvider = new GitSanityActionsTreeProvider();
  const statusTreeView = vscode.window.registerTreeDataProvider('gitsanity.status', statusTreeProvider);
  const actionsTreeView = vscode.window.registerTreeDataProvider('gitsanity.actions', actionsTreeProvider);

  const refreshStatusCmd = vscode.commands.registerCommand('gitsanity.refreshStatus', () => {
    statusTreeProvider.refresh();
  });

  // 7. Register all disposables
  context.subscriptions.push(
    outputChannel,
    projectDiagnostics,
    configLoader,
    diagnosticsManager,
    envWatcher,
    codeActionRegistration,
    statusBarItem,
    statusSubscription,
    statusTreeView,
    actionsTreeView,
    refreshStatusCmd,
    createConfigCommand,
    rescanCommand,
    moveSecretCommand,
    moveAllSecretsCommand,
    addEnvToGitignoreCommand,
    menuCommand,
    createRepoCommand,
    scanProjCommand,
    clearProjCommand,
    healthReportCommand,
    scanHistoryCmd,
    publishToGitHubCmd,
    installHookCmd,
    uninstallHookCmd,
    safeCommitCmd,
    undoCommitCmd,
    reviewBeforeCommitCmd,
    showDashboardCmd,
    findOldTodosCmd
  );

  // 7. On-open prompt (asynchronous, non-blocking)
  checkRepoPromptsOnOpen(context);

  // 8. Debug activation measurement
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    outputChannel.appendLine(`[debug] GitSanity activated in ${Date.now() - startTime}ms`);
  }
}

export function deactivate(): void {}
