import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { scanText, isLineIgnoredForRule } from '../scanner/scanner';
import { ConfigLoader } from '../config/configLoader';
import { isIgnored } from '../config/pathMatcher';
import { findTodoLines, TodoFinding } from '../todo/todoFinder';
import { getTodoAges } from '../todo/todoAge';
import { runGit } from '../git/gitRunner';
import { GitSanityConfig } from '../config/configSchema';

const DEBOUNCE_DELAY_MS = 300;

export interface IssueCounts {
  errors: number;
  warnings: number;
  total: number;
}

interface TodoCacheEntry {
  cacheKey: string;
  lineAges: Map<number, number>;
  lineTexts: Map<number, string>;
}

export class DiagnosticsManager implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly todoCache: Map<string, TodoCacheEntry> = new Map();
  private readonly _onDidChangeTotalIssues = new vscode.EventEmitter<IssueCounts>();

  public readonly onDidChangeTotalIssues = this._onDidChangeTotalIssues.event;

  constructor(private readonly configLoader: ConfigLoader) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gitsanity');

    // Register document event listeners
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => this.scanDocument(doc)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.scanDocument(doc)),
      vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.handleDocumentClose(doc)),
      this.configLoader.onDidChangeConfig(() => this.rescanAllOpenDocuments())
    );

    // Initial scan of all currently open documents
    this.rescanAllOpenDocuments();
  }

  /**
   * Rescans all open text documents.
   */
  public rescanAllOpenDocuments(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.scanDocument(doc);
    }
  }

  /**
   * Scans a document immediately and updates diagnostics.
   */
  public scanDocument(document: vscode.TextDocument): void {
    if (!this.shouldScan(document)) {
      return;
    }

    const config = this.configLoader.getConfigFor(document.uri);

    // Skip .env files (where secrets belong)
    const baseName = path.basename(document.fileName);
    const isEnvFile =
      baseName === '.env' ||
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

    if (isIgnored(relPath, config.ignorePaths)) {
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
    const findings = scanText(text, {
      rules: config.rules,
      entropyThreshold: config.entropyThreshold,
      entropyMinLength: config.entropyMinLength
    });

    const diagnostics: vscode.Diagnostic[] = findings.map((f) => {
      const range = new vscode.Range(
        new vscode.Position(f.line, f.startCol),
        new vscode.Position(f.line, f.endCol)
      );
      const severity =
        f.severity === 'error'
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
      const todos = findTodoLines(text);

      if (document.isDirty) {
        // Unsaved changes: reuse cached ages if line content unchanged
        const cached = this.todoCache.get(document.uri.toString());
        const todoDiags: vscode.Diagnostic[] = [];
        if (cached) {
          for (const t of todos) {
            if (isLineIgnoredForRule(lines, t.line, 'old-todo')) continue;
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

  private async updateOldTodoDiagnostics(
    document: vscode.TextDocument,
    config: GitSanityConfig,
    baseDiagnostics: vscode.Diagnostic[],
    todos: TodoFinding[],
    lines: string[]
  ): Promise<void> {
    if (!vscode.workspace.isTrusted) return;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return;

    const root = folder.uri.fsPath;
    const relPath = path.relative(root, document.uri.fsPath).replace(/\\/g, '/');

    try {
      const headRes = await runGit(['rev-parse', 'HEAD'], root);
      const headHash = headRes.code === 0 ? headRes.stdout.trim() : 'no-head';
      const stat = await fs.promises.stat(document.uri.fsPath);
      const cacheKey = `${headHash}:${stat.mtimeMs}`;

      const uriKey = document.uri.toString();
      let entry = this.todoCache.get(uriKey);

      if (!entry || entry.cacheKey !== cacheKey) {
        const todoLines = todos.map((t) => t.line);
        const ageMap = await getTodoAges(root, relPath, todoLines, Date.now(), config.maxFileSizeMB);
        const textMap = new Map<number, string>();
        for (const t of todos) {
          textMap.set(t.line, lines[t.line]);
        }
        entry = { cacheKey, lineAges: ageMap, lineTexts: textMap };
        this.todoCache.set(uriKey, entry);
      }

      const todoDiags: vscode.Diagnostic[] = [];
      const oldTodoSetting = config.rules['old-todo'];
      for (const t of todos) {
        if (isLineIgnoredForRule(lines, t.line, 'old-todo')) continue;
        const age = entry.lineAges.get(t.line);
        if (age !== undefined && age >= (config.todoMaxAgeDays ?? 90)) {
          todoDiags.push(this.createTodoDiagnostic(t, age, oldTodoSetting));
        }
      }

      if (vscode.workspace.textDocuments.some((d) => d.uri.toString() === uriKey)) {
        this.diagnosticCollection.set(document.uri, [...baseDiagnostics, ...todoDiags]);
        this._onDidChangeTotalIssues.fire(this.getIssueCounts());
      }
    } catch {}
  }

  private createTodoDiagnostic(
    t: TodoFinding,
    age: number,
    severitySetting: 'warn' | 'error' | 'off' | undefined
  ): vscode.Diagnostic {
    const range = new vscode.Range(
      new vscode.Position(t.line, t.startCol),
      new vscode.Position(t.line, t.endCol)
    );
    const severity =
      severitySetting === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;

    const diag = new vscode.Diagnostic(
      range,
      `TODO is ${age} days old. Resolve it or open an issue.`,
      severity
    );
    diag.source = 'GitSanity';
    diag.code = 'old-todo';
    return diag;
  }

  /**
   * Handles document change with a 300 ms debounce per document.
   */
  private handleDocumentChange(document: vscode.TextDocument): void {
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
  private handleDocumentClose(document: vscode.TextDocument): void {
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
  private shouldScan(document: vscode.TextDocument): boolean {
    return document.uri.scheme === 'file';
  }

  /**
   * Returns error, warning, and total counts across all tracked documents.
   */
  public getIssueCounts(): IssueCounts {
    let errors = 0;
    let warnings = 0;
    this.diagnosticCollection.forEach((_uri, diagnostics) => {
      for (const d of diagnostics) {
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          errors++;
        } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
          warnings++;
        }
      }
    });
    return { errors, warnings, total: errors + warnings };
  }

  /**
   * Returns the total count of diagnostics across all tracked documents.
   */
  public getTotalIssueCount(): number {
    return this.getIssueCounts().total;
  }

  public dispose(): void {
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
