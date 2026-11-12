import * as vscode from 'vscode';
import * as path from 'path';
import { scanText } from '../scanner/scanner';
import { ConfigLoader } from '../config/configLoader';
import { isIgnored } from '../config/pathMatcher';

const DEBOUNCE_DELAY_MS = 300;

export interface IssueCounts {
  errors: number;
  warnings: number;
  total: number;
}

export class DiagnosticsManager implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeTotalIssues = new vscode.EventEmitter<IssueCounts>();

  public readonly onDidChangeTotalIssues = this._onDidChangeTotalIssues.event;

  constructor(private readonly configLoader: ConfigLoader) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gitsanity');

    // Register document event listeners
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.scanDocument(doc)),
      vscode.workspace.onDidSaveTextDocument(doc => this.scanDocument(doc)),
      vscode.workspace.onDidChangeTextDocument(event => this.handleDocumentChange(event.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.handleDocumentClose(doc)),
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

    const diagnostics: vscode.Diagnostic[] = findings.map(f => {
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

    this.diagnosticCollection.set(document.uri, diagnostics);
    this._onDidChangeTotalIssues.fire(this.getIssueCounts());
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

    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
    this._onDidChangeTotalIssues.dispose();
  }
}
