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
exports.ConfigLoader = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configSchema_1 = require("./configSchema");
class ConfigLoader {
    constructor() {
        this.configCache = new Map();
        this.warnedFiles = new Set();
        this.disposables = [];
        this._onDidChangeConfig = new vscode.EventEmitter();
        this.onDidChangeConfig = this._onDidChangeConfig.event;
        this.reloadAllSync();
        // Watch for .gitsanity.json across workspace folders
        const watcher = vscode.workspace.createFileSystemWatcher('**/.gitsanity.json');
        this.disposables.push(watcher.onDidCreate(uri => this.handleConfigFileEvent(uri)), watcher.onDidChange(uri => this.handleConfigFileEvent(uri)), watcher.onDidDelete(uri => this.handleConfigFileDelete(uri)), watcher);
        // Watch for workspace folder additions/removals
        this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.reloadAllSync();
            this._onDidChangeConfig.fire();
        }));
    }
    /**
     * Returns the config for a given document URI, or DEFAULT_CONFIG if outside workspace.
     */
    getConfigFor(uri) {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return configSchema_1.DEFAULT_CONFIG;
        }
        const key = folder.uri.toString();
        const cached = this.configCache.get(key);
        if (cached) {
            return cached;
        }
        // Attempt to load synchronously
        this.loadFolderConfigSync(folder);
        return this.configCache.get(key) || configSchema_1.DEFAULT_CONFIG;
    }
    /**
     * Synchronously reloads configs for all open workspace folders.
     */
    reloadAllSync() {
        const folders = vscode.workspace.workspaceFolders || [];
        for (const folder of folders) {
            this.loadFolderConfigSync(folder);
        }
    }
    loadFolderConfigSync(folder) {
        const key = folder.uri.toString();
        if (folder.uri.scheme !== 'file') {
            this.configCache.set(key, configSchema_1.DEFAULT_CONFIG);
            return;
        }
        const configPath = path.join(folder.uri.fsPath, '.gitsanity.json');
        const configUri = vscode.Uri.file(configPath);
        if (!fs.existsSync(configPath)) {
            this.configCache.set(key, configSchema_1.DEFAULT_CONFIG);
            this.warnedFiles.delete(configUri.toString());
            return;
        }
        try {
            const text = fs.readFileSync(configPath, 'utf8');
            const { config, errors } = (0, configSchema_1.parseConfig)(text);
            if (errors.length > 0) {
                if (!this.warnedFiles.has(configUri.toString())) {
                    this.warnedFiles.add(configUri.toString());
                    vscode.window
                        .showWarningMessage('GitSanity: .gitsanity.json has errors, using defaults for invalid fields', 'Open File')
                        .then(choice => {
                        if (choice === 'Open File') {
                            vscode.window.showTextDocument(configUri);
                        }
                    });
                }
            }
            else {
                this.warnedFiles.delete(configUri.toString());
            }
            this.configCache.set(key, config);
        }
        catch (err) {
            this.configCache.set(key, configSchema_1.DEFAULT_CONFIG);
        }
    }
    handleConfigFileEvent(uri) {
        // Reset warning status so newly introduced errors will trigger a warning
        this.warnedFiles.delete(uri.toString());
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            this.loadFolderConfigSync(folder);
        }
        else {
            this.reloadAllSync();
        }
        this._onDidChangeConfig.fire();
    }
    handleConfigFileDelete(uri) {
        this.warnedFiles.delete(uri.toString());
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            this.configCache.set(folder.uri.toString(), configSchema_1.DEFAULT_CONFIG);
        }
        this._onDidChangeConfig.fire();
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.configCache.clear();
        this.warnedFiles.clear();
        this._onDidChangeConfig.dispose();
    }
}
exports.ConfigLoader = ConfigLoader;
//# sourceMappingURL=configLoader.js.map