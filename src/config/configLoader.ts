import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitSanityConfig, DEFAULT_CONFIG, parseConfig } from './configSchema';

export class ConfigLoader implements vscode.Disposable {
  private readonly configCache = new Map<string, GitSanityConfig>();
  private readonly warnedFiles = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeConfig = new vscode.EventEmitter<void>();

  public readonly onDidChangeConfig = this._onDidChangeConfig.event;

  constructor() {
    this.reloadAllSync();

    // Watch for .gitsanity.json across workspace folders
    const watcher = vscode.workspace.createFileSystemWatcher('**/.gitsanity.json');
    this.disposables.push(
      watcher.onDidCreate(uri => this.handleConfigFileEvent(uri)),
      watcher.onDidChange(uri => this.handleConfigFileEvent(uri)),
      watcher.onDidDelete(uri => this.handleConfigFileDelete(uri)),
      watcher
    );

    // Watch for workspace folder additions/removals
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.reloadAllSync();
        this._onDidChangeConfig.fire();
      })
    );
  }

  /**
   * Returns the config for a given document URI, or DEFAULT_CONFIG if outside workspace.
   */
  public getConfigFor(uri: vscode.Uri): GitSanityConfig {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return DEFAULT_CONFIG;
    }

    const key = folder.uri.toString();
    const cached = this.configCache.get(key);
    if (cached) {
      return cached;
    }

    // Attempt to load synchronously
    this.loadFolderConfigSync(folder);
    return this.configCache.get(key) || DEFAULT_CONFIG;
  }

  /**
   * Synchronously reloads configs for all open workspace folders.
   */
  public reloadAllSync(): void {
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
      this.loadFolderConfigSync(folder);
    }
  }

  private loadFolderConfigSync(folder: vscode.WorkspaceFolder): void {
    const key = folder.uri.toString();
    if (folder.uri.scheme !== 'file') {
      this.configCache.set(key, DEFAULT_CONFIG);
      return;
    }

    const configPath = path.join(folder.uri.fsPath, '.gitsanity.json');
    const configUri = vscode.Uri.file(configPath);

    if (!fs.existsSync(configPath)) {
      this.configCache.set(key, DEFAULT_CONFIG);
      this.warnedFiles.delete(configUri.toString());
      return;
    }

    try {
      const text = fs.readFileSync(configPath, 'utf8');
      const { config, errors } = parseConfig(text);

      if (errors.length > 0) {
        if (!this.warnedFiles.has(configUri.toString())) {
          this.warnedFiles.add(configUri.toString());
          vscode.window
            .showWarningMessage(
              'GitSanity: .gitsanity.json has errors, using defaults for invalid fields',
              'Open File'
            )
            .then(choice => {
              if (choice === 'Open File') {
                vscode.window.showTextDocument(configUri);
              }
            });
        }
      } else {
        this.warnedFiles.delete(configUri.toString());
      }

      this.configCache.set(key, config);
    } catch (err) {
      this.configCache.set(key, DEFAULT_CONFIG);
    }
  }

  private handleConfigFileEvent(uri: vscode.Uri): void {
    // Reset warning status so newly introduced errors will trigger a warning
    this.warnedFiles.delete(uri.toString());

    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      this.loadFolderConfigSync(folder);
    } else {
      this.reloadAllSync();
    }
    this._onDidChangeConfig.fire();
  }

  private handleConfigFileDelete(uri: vscode.Uri): void {
    this.warnedFiles.delete(uri.toString());
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      this.configCache.set(folder.uri.toString(), DEFAULT_CONFIG);
    }
    this._onDidChangeConfig.fire();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.configCache.clear();
    this.warnedFiles.clear();
    this._onDidChangeConfig.dispose();
  }
}
