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
exports.EnvWatcher = void 0;
const vscode = __importStar(require("vscode"));
const gitignoreFile_1 = require("./gitignoreFile");
class EnvWatcher {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.warnedFolders = new Set();
        this.disposables = [];
        // Watch for .gitignore and .env file creations or changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/{.gitignore,.env,.env.*}');
        this.disposables.push(watcher.onDidCreate(() => this.checkAllFolders()), watcher.onDidChange(() => this.checkAllFolders()), watcher);
        // Initial check across workspace folders
        this.checkAllFolders();
    }
    async checkAllFolders() {
        const folders = vscode.workspace.workspaceFolders || [];
        for (const folder of folders) {
            await this.checkWorkspaceFolder(folder);
        }
    }
    async checkWorkspaceFolder(folder) {
        const folderKey = folder.uri.toString();
        if (this.warnedFolders.has(folderKey)) {
            return;
        }
        // Only perform check if a .git directory exists in the folder
        const gitDir = vscode.Uri.joinPath(folder.uri, '.git');
        try {
            await vscode.workspace.fs.stat(gitDir);
        }
        catch {
            return;
        }
        const config = this.configLoader.getConfigFor(folder.uri);
        const envFileName = config.envFile || '.env';
        const envUri = vscode.Uri.joinPath(folder.uri, envFileName);
        // Only proceed if the env file actually exists
        try {
            await vscode.workspace.fs.stat(envUri);
        }
        catch {
            return;
        }
        // Read .gitignore if present
        const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
        let gitignoreText = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
            gitignoreText = Buffer.from(bytes).toString('utf8');
        }
        catch { }
        if (!(0, gitignoreFile_1.isEnvIgnored)(gitignoreText, envFileName)) {
            this.warnedFolders.add(folderKey);
            const choice = await vscode.window.showWarningMessage(`GitSanity: ${envFileName} is not in .gitignore. Your secrets could be committed.`, 'Add to .gitignore', 'Dismiss');
            if (choice === 'Add to .gitignore') {
                await this.addEnvToGitignoreForFolder(folder, envFileName);
            }
        }
    }
    async addEnvToGitignoreForFolder(folder, envFileName) {
        const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
        let gitignoreText = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
            gitignoreText = Buffer.from(bytes).toString('utf8');
        }
        catch { }
        const updatedText = (0, gitignoreFile_1.addEnvToGitignore)(gitignoreText, envFileName);
        await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(updatedText, 'utf8'));
        vscode.window.showInformationMessage(`GitSanity: Added ${envFileName} to .gitignore.`);
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.warnedFolders.clear();
    }
}
exports.EnvWatcher = EnvWatcher;
//# sourceMappingURL=envWatcher.js.map