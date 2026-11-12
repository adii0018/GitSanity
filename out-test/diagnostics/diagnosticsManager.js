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
exports.DiagnosticsManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const scanner_1 = require("../scanner/scanner");
const pathMatcher_1 = require("../config/pathMatcher");
const todoFinder_1 = require("../todo/todoFinder");
const todoAge_1 = require("../todo/todoAge");
const gitRunner_1 = require("../git/gitRunner");
const DEBOUNCE_DELAY_MS = 300;
class DiagnosticsManager {
    constructor(configLoader) {
        this.configLoader = configLoader;
        this.debounceTimers = new Map();
        this.disposables = [];
        this.todoCache = new Map();
        this._onDidChangeTotalIssues = new vscode.EventEmitter();
        this.onDidChangeTotalIssues = this._onDidChangeTotalIssues.event;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gitsanity');
        // Register document event listeners
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((doc) => this.scanDocument(doc)), vscode.workspace.onDidSaveTextDocument((doc) => this.scanDocument(doc)), vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event.document)), vscode.workspace.onDidCloseTextDocument((doc) => this.handleDocumentClose(doc)), this.configLoader.onDidChangeConfig(() => this.rescanAllOpenDocuments()));
        // Initial scan of all currently open documents
        this.rescanAllOpenDocuments();
    }
    /**
     * Rescans all open text documents.
     */
    rescanAllOpenDocuments() {
        for (const doc of vscode.workspace.textDocuments) {
            this.scanDocument(doc);
        }
    }
    /**
     * Scans a document immediately and updates diagnostics.
     */
    scanDocument(document) {
        if (!this.shouldScan(document)) {
            return;
        }
        const config = this.configLoader.getConfigFor(document.uri);
        // Skip .env files (where secrets belong)
        const baseName = path.basename(document.fileName);
        const isEnvFile = baseName === '.env' ||
            baseName.startsWith('.env.') ||
            baseName === config.envFile ||
            baseName === config.envExampleFile;
        if (isEnvFile) {
            this.diagnosticCollection.delete(document.uri);
            this._onDidChangeTotalIssues.fire(this.getIssueCounts());
            return;
        }
        // Check ignore paths (relative to workspace folder)
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const relPath = folder
            ? path.relative(folder.uri.fsPath, document.uri.fsPath)
            : path.basename(document.fileName);
        if ((0, pathMatcher_1.isIgnored)(relPath, config.ignorePaths)) {
            this.diagnosticCollection.delete(document.uri);
            this._onDidChangeTotalIssues.fire(this.getIssueCounts());
            return;
        }
        // Check file size limit
        const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;
        const text = document.getText();
        if (Buffer.byteLength(text, 'utf8') > maxSizeBytes) {
            this.diagnosticCollection.delete(document.uri);
            this._onDidChangeTotalIssues.fire(this.getIssueCounts());
            return;
        }
        // Scan text with document-specific config options
        const findings = (0, scanner_1.scanText)(text, {
            rules: config.rules,
            entropyThreshold: config.entropyThreshold,
            entropyMinLength: config.entropyMinLength
        });
        const diagnostics = findings.map((f) => {
            const range = new vscode.Range(new vscode.Position(f.line, f.startCol), new vscode.Position(f.line, f.endCol));
            const severity = f.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
            const diagnostic = new vscode.Diagnostic(range, f.message, severity);
            diagnostic.source = 'GitSanity';
            diagnostic.code = f.ruleId;
            return diagnostic;
        });
        // Check old-todo rule if enabled
        const oldTodoSetting = config.rules['old-todo'];
        if (oldTodoSetting && oldTodoSetting !== 'off' && folder) {
            const lines = text.split(/\r?\n/);
            const todos = (0, todoFinder_1.findTodoLines)(text);
            if (document.isDirty) {
                // Unsaved changes: reuse cached ages if line content unchanged
                const cached = this.todoCache.get(document.uri.toString());
                const todoDiags = [];
                if (cached) {
                    for (const t of todos) {
                        if ((0, scanner_1.isLineIgnoredForRule)(lines, t.line, 'old-todo'))
                            continue;
                        const currentLineText = lines[t.line];
                        if (cached.lineTexts.get(t.line) === currentLineText) {
                            const age = cached.lineAges.get(t.line);
                            if (age !== undefined && age >= (config.todoMaxAgeDays ?? 90)) {
                                todoDiags.push(this.createTodoDiagnostic(t, age, oldTodoSetting));
                            }
                        }
                    }
                }
                this.diagnosticCollection.set(document.uri, [...diagnostics, ...todoDiags]);
                this._onDidChangeTotalIssues.fire(this.getIssueCounts());
                return;
            }
            // File is clean: update base diagnostics immediately and kick off blame check
            this.diagnosticCollection.set(document.uri, diagnostics);
            this._onDidChangeTotalIssues.fire(this.getIssueCounts());
            this.updateOldTodoDiagnostics(document, config, diagnostics, todos, lines);
            return;
        }
        this.diagnosticCollection.set(document.uri, diagnostics);
        this._onDidChangeTotalIssues.fire(this.getIssueCounts());
    }
    async updateOldTodoDiagnostics(document, config, baseDiagnostics, todos, lines) {
        if (!vscode.workspace.isTrusted)
            return;
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!folder)
            return;
        const root = folder.uri.fsPath;
        const relPath = path.relative(root, document.uri.fsPath).replace(/\\/g, '/');
        try {
            const headRes = await (0, gitRunner_1.runGit)(['rev-parse', 'HEAD'], root);
            const headHash = headRes.code === 0 ? headRes.stdout.trim() : 'no-head';
            const stat = await fs.promises.stat(document.uri.fsPath);
            const cacheKey = `${headHash}:${stat.mtimeMs}`;
            const uriKey = document.uri.toString();
            let entry = this.todoCache.get(uriKey);
            if (!entry || entry.cacheKey !== cacheKey) {
                const todoLines = todos.map((t) => t.line);
                const ageMap = await (0, todoAge_1.getTodoAges)(root, relPath, todoLines, Date.now(), config.maxFileSizeMB);
                const textMap = new Map();
                for (const t of todos) {
                    textMap.set(t.line, lines[t.line]);
                }
                entry = { cacheKey, lineAges: ageMap, lineTexts: textMap };
                this.todoCache.set(uriKey, entry);
            }
            const todoDiags = [];
            const oldTodoSetting = config.rules['old-todo'];
            for (const t of todos) {
                if ((0, scanner_1.isLineIgnoredForRule)(lines, t.line, 'old-todo'))
                    continue;
                const age = entry.lineAges.get(t.line);
                if (age !== undefined && age >= (config.todoMaxAgeDays ?? 90)) {
                    todoDiags.push(this.createTodoDiagnostic(t, age, oldTodoSetting));
                }
            }
            if (vscode.workspace.textDocuments.some((d) => d.uri.toString() === uriKey)) {
                this.diagnosticCollection.set(document.uri, [...baseDiagnostics, ...todoDiags]);
                this._onDidChangeTotalIssues.fire(this.getIssueCounts());
            }
        }
        catch { }
    }
    createTodoDiagnostic(t, age, severitySetting) {
        const range = new vscode.Range(new vscode.Position(t.line, t.startCol), new vscode.Position(t.line, t.endCol));
        const severity = severitySetting === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
        const diag = new vscode.Diagnostic(range, `TODO is ${age} days old. Resolve it or open an issue.`, severity);
        diag.source = 'GitSanity';
        diag.code = 'old-todo';
        return diag;
    }
    /**
     * Handles document change with a 300 ms debounce per document.
     */
    handleDocumentChange(document) {
        if (!this.shouldScan(document)) {
            return;
        }
        const uriKey = document.uri.toString();
        const existingTimer = this.debounceTimers.get(uriKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            this.debounceTimers.delete(uriKey);
            this.scanDocument(document);
        }, DEBOUNCE_DELAY_MS);
        this.debounceTimers.set(uriKey, timer);
    }
    /**
     * Cleans up diagnostics and timers when a document is closed.
     */
    handleDocumentClose(document) {
        const uriKey = document.uri.toString();
        const timer = this.debounceTimers.get(uriKey);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(uriKey);
        }
        this.todoCache.delete(uriKey);
        this.diagnosticCollection.delete(document.uri);
        this._onDidChangeTotalIssues.fire(this.getIssueCounts());
    }
    /**
     * Checks whether the document is eligible for scanning (scheme === 'file').
     */
    shouldScan(document) {
        return document.uri.scheme === 'file';
    }
    /**
     * Returns error, warning, and total counts across all tracked documents.
     */
    getIssueCounts() {
        let errors = 0;
        let warnings = 0;
        this.diagnosticCollection.forEach((_uri, diagnostics) => {
            for (const d of diagnostics) {
                if (d.severity === vscode.DiagnosticSeverity.Error) {
                    errors++;
                }
                else if (d.severity === vscode.DiagnosticSeverity.Warning) {
                    warnings++;
                }
            }
        });
        return { errors, warnings, total: errors + warnings };
    }
    /**
     * Returns the total count of diagnostics across all tracked documents.
     */
    getTotalIssueCount() {
        return this.getIssueCounts().total;
    }
    dispose() {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.todoCache.clear();
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this._onDidChangeTotalIssues.dispose();
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnosticsManager.js.map