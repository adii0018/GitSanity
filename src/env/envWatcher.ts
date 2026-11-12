import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import { isEnvIgnored, addEnvToGitignore } from './gitignoreFile';

export class EnvWatcher implements vscode.Disposable {
  private readonly warnedFolders = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly configLoader: ConfigLoader) {
    // Watch for .gitignore and .env file creations or changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/{.gitignore,.env,.env.*}');
    this.disposables.push(
      watcher.onDidCreate(() => this.checkAllFolders()),
      watcher.onDidChange(() => this.checkAllFolders()),
      watcher
    );

    // Initial check across workspace folders
    this.checkAllFolders();
  }

  public async checkAllFolders(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
      await this.checkWorkspaceFolder(folder);
    }
  }

  public async checkWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const folderKey = folder.uri.toString();
    if (this.warnedFolders.has(folderKey)) {
      return;
    }

    // Only perform check if a .git directory exists in the folder
    const gitDir = vscode.Uri.joinPath(folder.uri, '.git');
    try {
      await vscode.workspace.fs.stat(gitDir);
    } catch {
      return;
    }

    const config = this.configLoader.getConfigFor(folder.uri);
    const envFileName = config.envFile || '.env';
    const envUri = vscode.Uri.joinPath(folder.uri, envFileName);

    // Only proceed if the env file actually exists
    try {
      await vscode.workspace.fs.stat(envUri);
    } catch {
      return;
    }

    // Read .gitignore if present
    const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
    let gitignoreText = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
      gitignoreText = Buffer.from(bytes).toString('utf8');
    } catch {}

    if (!isEnvIgnored(gitignoreText, envFileName)) {
      this.warnedFolders.add(folderKey);
      const choice = await vscode.window.showWarningMessage(
        `GitSanity: ${envFileName} is not in .gitignore. Your secrets could be committed.`,
        'Add to .gitignore',
        'Dismiss'
      );

      if (choice === 'Add to .gitignore') {
        await this.addEnvToGitignoreForFolder(folder, envFileName);
      }
    }
  }

  public async addEnvToGitignoreForFolder(
    folder: vscode.WorkspaceFolder,
    envFileName: string
  ): Promise<void> {
    const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
    let gitignoreText = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
      gitignoreText = Buffer.from(bytes).toString('utf8');
    } catch {}

    const updatedText = addEnvToGitignore(gitignoreText, envFileName);
    await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(updatedText, 'utf8'));
    vscode.window.showInformationMessage(`GitSanity: Added ${envFileName} to .gitignore.`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.warnedFolders.clear();
  }
}
