import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initRepo } from '../git/repoInitializer';
import { detectRepoState } from '../git/repoDetector';
import { runGit } from '../git/gitRunner';
import { isEnvIgnored } from '../env/gitignoreFile';
import { isGitSanityHookInstalled, installGitHook, uninstallGitHook } from '../git/hookInstaller';
import { scanHistory, HistoryFinding } from '../git/historyScanner';
import { scanProject } from '../scanner/projectScanner';
import { HealthReportPanel, HealthReportData } from '../ui/healthReport';
import { ConfigLoader } from '../config/configLoader';
import { createGitHubRepo, validateRepoName } from '../git/githubPublisher';
import { redact } from '../git/redact';
import { lastProjectScanResult, scanProjectCommand } from './projectScanCommand';

export let lastHistoryFindings: { folder: vscode.WorkspaceFolder; findings: HistoryFinding[] } | undefined;

function getActiveFolder(targetFolder?: vscode.WorkspaceFolder): vscode.WorkspaceFolder | undefined {
  if (targetFolder) return targetFolder;
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.length > 0 ? folders[0] : undefined;
}

/**
 * gitsanity.createRepository command
 */
export async function createRepositoryCommand(
  configLoader: ConfigLoader,
  projectDiagnostics: vscode.DiagnosticCollection,
  targetFolder?: vscode.WorkspaceFolder
): Promise<void> {
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

  const initResult = await initRepo(root, config.envFile || '.env');
  if (!initResult.success) {
    vscode.window.showErrorMessage(`GitSanity: ${initResult.error || 'Failed to initialize Git repository.'}`);
    return;
  }

  vscode.window.showInformationMessage(
    `GitSanity: Initialized Git repository in ${folder.name}${initResult.createdGitignore ? ' with starter .gitignore' : ''}.`
  );

  // Ask to create the first commit
  const commitChoice = await vscode.window.showInformationMessage(
    'Create the first commit?',
    { modal: true },
    'Yes, commit',
    'Not now'
  );

  if (commitChoice !== 'Yes, commit') {
    return;
  }

  // Run project scan first
  const scanResult = await scanProject(root, { config });
  if (scanResult.countsBySeverity.error > 0) {
    const errorChoice = await vscode.window.showWarningMessage(
      `Project scan found ${scanResult.countsBySeverity.error} error-severity finding(s). Committing them will leak them to git history.`,
      { modal: true },
      'Commit anyway',
      'Cancel'
    );
    if (errorChoice !== 'Commit anyway') {
      return;
    }
  }

  // Check user.name and user.email
  const repoState = await detectRepoState(root);
  if (!repoState.userConfigured) {
    vscode.window.showErrorMessage(
      'GitSanity: Git user.name and user.email are not configured. Run:\n' +
        'git config user.name "Your Name"\n' +
        'git config user.email "your.email@example.com"'
    );
    return;
  }

  await runGit(['add', '-A'], root);
  const commitRes = await runGit(['commit', '-m', 'chore: initial commit'], root);
  if (commitRes.code === 0) {
    vscode.window.showInformationMessage('GitSanity: Created initial commit ("chore: initial commit").');
  } else {
    vscode.window.showErrorMessage(`GitSanity: Initial commit failed: ${redact(commitRes.stderr)}`);
  }
}

/**
 * gitsanity.showHealthReport command
 */
export async function showHealthReportCommand(
  configLoader: ConfigLoader,
  projectDiagnostics: vscode.DiagnosticCollection,
  targetFolder?: vscode.WorkspaceFolder
): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Git operations and health reports are disabled in untrusted workspaces.');
    return;
  }

  const folder = getActiveFolder(targetFolder);
  if (!folder) {
    vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
    return;
  }

  const root = folder.uri.fsPath;
  const config = configLoader.getConfigFor(folder.uri);

  let scanResult = lastProjectScanResult?.folder.uri.fsPath === root ? lastProjectScanResult.result : undefined;
  if (!scanResult) {
    scanResult = await scanProject(root, { config });
  }

  const repoState = await detectRepoState(root);
  const hookInstalled = await isGitSanityHookInstalled(root);

  // Check .gitignore for .env
  let gitignoreText = '';
  try {
    gitignoreText = await fs.promises.readFile(path.join(root, '.gitignore'), 'utf8');
  } catch {}
  const envIgnored = isEnvIgnored(gitignoreText, config.envFile || '.env');

  // Check tracked .env files
  const trackedEnvFiles: string[] = [];
  const lsRes = await runGit(['ls-files', '-z'], root);
  if (lsRes.code === 0 && lsRes.stdout) {
    const trackedList = lsRes.stdout.split('\0').filter(Boolean);
    for (const f of trackedList) {
      const base = path.basename(f);
      if (
        (base === '.env' || base.startsWith('.env.')) &&
        !base.endsWith('.example') &&
        !base.endsWith('.sample') &&
        !base.endsWith('.template')
      ) {
        trackedEnvFiles.push(f);
      }
    }
  }

  // Check node_modules/ ignored when package.json exists
  let nodeModulesIgnored = true;
  if (fs.existsSync(path.join(root, 'package.json'))) {
    nodeModulesIgnored = isEnvIgnored(gitignoreText, 'node_modules');
  }

  // Large tracked files
  const largeFiles: { path: string; sizeMB: number }[] = [];
  const largeThreshold = (config.largeFileMB || 5) * 1024 * 1024;
  if (lsRes.code === 0 && lsRes.stdout) {
    const files = lsRes.stdout.split('\0').filter(Boolean);
    for (const f of files) {
      try {
        const stat = await fs.promises.stat(path.join(root, f));
        if (stat.size > largeThreshold) {
          largeFiles.push({ path: f, sizeMB: stat.size / (1024 * 1024) });
        }
      } catch {}
    }
  }
  largeFiles.sort((a, b) => b.sizeMB - a.sizeMB);

  const historyFindings =
    lastHistoryFindings?.folder.uri.fsPath === root ? lastHistoryFindings.findings : undefined;

  const data: HealthReportData = {
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

  HealthReportPanel.show(data);
}

/**
 * gitsanity.scanHistory command
 */
export async function scanHistoryCommand(
  configLoader: ConfigLoader,
  targetFolder?: vscode.WorkspaceFolder
): Promise<void> {
  const folder = getActiveFolder(targetFolder);
  if (!folder) return;

  const root = folder.uri.fsPath;
  const config = configLoader.getConfigFor(folder.uri);

  const confirmed = await vscode.window.showInformationMessage(
    'Scan Git commit history for leaked secrets? This only reads commit diffs and never rewrites history.',
    { modal: true },
    'Start Scan',
    'Cancel'
  );

  if (confirmed !== 'Start Scan') {
    return;
  }

  const maxCommits = vscode.workspace.getConfiguration('gitsanity').get<number>('historyMaxCommits', 500);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitSanity: Scanning Git commit history...',
      cancellable: true
    },
    async (progress, token) => {
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      const historyResult = await scanHistory(root, {
        maxCommits,
        config,
        signal: abortController.signal,
        onProgress: (scanned) => {
          progress.report({ message: `${scanned} commits analyzed` });
        }
      });

      lastHistoryFindings = { folder, findings: historyResult.findings };

      if (historyResult.findings.length === 0) {
        vscode.window.showInformationMessage(
          `GitSanity: History scan clean. Analyzed ${historyResult.commitsScanned} commits with 0 secret leaks found.`
        );
      } else {
        vscode.window
          .showWarningMessage(
            `GitSanity: Found ${historyResult.findings.length} secret finding(s) in ${historyResult.commitsScanned} commits. Deleting the secret from code does not remove it from history. Rotate any exposed secret. GitSanity never rewrites history.`,
            'Show Health Report'
          )
          .then((choice) => {
            if (choice === 'Show Health Report') {
              vscode.commands.executeCommand('gitsanity.showHealthReport', folder);
            }
          });
      }
    }
  );
}

/**
 * gitsanity.publishToGitHub command
 */
export async function publishToGitHubCommand(
  configLoader: ConfigLoader,
  targetFolder?: vscode.WorkspaceFolder
): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Git operations are disabled in untrusted workspaces.');
    return;
  }

  const folder = getActiveFolder(targetFolder);
  if (!folder) return;

  const root = folder.uri.fsPath;
  const repoState = await detectRepoState(root);

  if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
    const choice = await vscode.window.showWarningMessage(
      'No Git repository found in this folder. Create one first?',
      'Create Repository'
    );
    if (choice === 'Create Repository') {
      await vscode.commands.executeCommand('gitsanity.createRepository', folder);
    }
    return;
  }

  if (!repoState.hasCommits) {
    vscode.window.showErrorMessage(
      'GitSanity: Repository has no commits yet. Make at least one commit before publishing to GitHub.'
    );
    return;
  }

  // Check if remote 'origin' already exists
  if (repoState.remotes.some((r) => r.name === 'origin')) {
    vscode.window.showWarningMessage("GitSanity: Remote 'origin' already exists. Publish aborted.");
    return;
  }

  // Authenticate with GitHub session
  let session: vscode.AuthenticationSession | undefined;
  try {
    session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
  } catch (err) {
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
    validateInput: validateRepoName
  });

  if (!repoName) return;

  // Prompt visibility
  const visibilityChoice = await vscode.window.showQuickPick(
    [
      { label: 'Private (recommended)', description: 'Only you can see this repository', isPrivate: true },
      { label: 'Public', description: 'Anyone on the internet can see this repository', isPrivate: false }
    ],
    { placeHolder: 'Select repository visibility' }
  );

  if (!visibilityChoice) return;

  // If Public -> confirm and run project scan
  if (!visibilityChoice.isPrivate) {
    const confirmPublic = await vscode.window.showWarningMessage(
      'Are you sure you want to create a PUBLIC repository? Anyone will be able to clone and read your code.',
      { modal: true },
      'Publish Public Repository',
      'Cancel'
    );
    if (confirmPublic !== 'Publish Public Repository') return;

    const config = configLoader.getConfigFor(folder.uri);
    const scanResult = await scanProject(root, { config });
    if (scanResult.countsBySeverity.error > 0) {
      const overrideChoice = await vscode.window.showErrorMessage(
        `GitSanity blocked publish: ${scanResult.countsBySeverity.error} error-severity issue(s) detected in project. Publishing publicly would expose secrets!`,
        { modal: true },
        'Publish anyway',
        'Cancel'
      );
      if (overrideChoice !== 'Publish anyway') return;
    }
  }

  // Create repository via GitHub API
  let createRes: { cloneUrl: string; htmlUrl: string };
  try {
    createRes = await createGitHubRepo({
      token: session.accessToken,
      name: repoName.trim(),
      isPrivate: visibilityChoice.isPrivate
    });
  } catch (err: any) {
    vscode.window.showErrorMessage(`GitSanity: ${err.message || 'Failed to create GitHub repository.'}`);
    return;
  }

  // git remote add origin <clone_url>
  const remoteRes = await runGit(['remote', 'add', 'origin', createRes.cloneUrl], root);
  if (remoteRes.code !== 0) {
    vscode.window.showErrorMessage(`GitSanity: Failed to add remote origin: ${remoteRes.stderr}`);
    return;
  }

  // Ask to push now
  const pushChoice = await vscode.window.showInformationMessage(
    `Created GitHub repository '${repoName}'. Push current branch now?`,
    { modal: true },
    'Push',
    'Not now'
  );

  if (pushChoice === 'Push') {
    const branch = repoState.branch || 'main';
    const pushRes = await runGit(['push', '-u', 'origin', branch], root);

    if (pushRes.code !== 0) {
      const firstLines = pushRes.stderr.split(/\r?\n/).slice(0, 5).join('\n');
      vscode.window.showErrorMessage(
        `GitSanity: Push failed. The GitHub repository was created at ${createRes.htmlUrl}.\n${redact(firstLines)}`
      );
    } else {
      vscode.window
        .showInformationMessage(
          `GitSanity: Successfully pushed '${branch}' to ${createRes.htmlUrl}.`,
          'Open on GitHub'
        )
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
export async function installHookCommand(
  extensionContext: vscode.ExtensionContext,
  targetFolder?: vscode.WorkspaceFolder
): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Hook management is disabled in untrusted workspaces.');
    return;
  }

  const folder = getActiveFolder(targetFolder);
  if (!folder) return;

  const bundlePath = path.join(extensionContext.extensionPath, 'out', 'hook', 'pre-commit.bundle.js');
  const res = await installGitHook(folder.uri.fsPath, bundlePath);

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
export async function uninstallHookCommand(targetFolder?: vscode.WorkspaceFolder): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage('GitSanity: Hook management is disabled in untrusted workspaces.');
    return;
  }

  const folder = getActiveFolder(targetFolder);
  if (!folder) return;

  const res = await uninstallGitHook(folder.uri.fsPath);
  if (!res.success) {
    vscode.window.showErrorMessage(`GitSanity: ${res.message || 'Failed to uninstall pre-commit hook.'}`);
    return;
  }

  vscode.window.showInformationMessage('GitSanity: Pre-commit hook removed successfully.');
}
