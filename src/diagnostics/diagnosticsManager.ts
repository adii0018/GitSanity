import * as vscode from 'vscode';
import { scanText } from '../scanner/scanner';

const ONE_MB = 1024 * 1024;
const DEBOUNCE_DELAY_MS = 300;

export class DiagnosticsManager implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeTotalIssues = new vscode.EventEmitter<number>();

  public readonly onDidChangeTotalIssues = this._onDidChangeTotalIssues.event;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gitsanity');

    // Register document event listeners
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.scanDocument(doc)),
      vscode.workspace.onDidSaveTextDocument(doc => this.scanDocument(doc)),
      vscode.workspace.onDidChangeTextDocument(event => this.handleDocumentChange(event.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.handleDocumentClose(doc))
    );

    // Scan all already-open documents on startup
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

    const text = document.getText();
    if (Buffer.byteLength(text, 'utf8') > ONE_MB) {
      this.diagnosticCollection.delete(document.uri);
      this._onDidChangeTotalIssues.fire(this.getTotalIssueCount());
      return;
    }

    const findings = scanText(text);
    const diagnostics: vscode.Diagnostic[] = findings.map(f => {
      const range = new vscode.Range(
        new vscode.Position(f.line, f.startCol),
        new vscode.Position(f.line, f.endCol)
      );
      const severity = f.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;

      const diagnostic = new vscode.Diagnostic(range, f.message, severity);
      diagnostic.source = 'GitSanity';
      diagnostic.code = f.ruleId;
      return diagnostic;
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
    this._onDidChangeTotalIssues.fire(this.getTotalIssueCount());
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
    this._onDidChangeTotalIssues.fire(this.getTotalIssueCount());
  }

  /**
   * Checks whether the document is eligible for scanning (scheme === 'file').
   */
  private shouldScan(document: vscode.TextDocument): boolean {
    return document.uri.scheme === 'file';
  }

  /**
   * Returns the total count of diagnostics across all tracked documents.
   */
  public getTotalIssueCount(): number {
    let count = 0;
    this.diagnosticCollection.forEach((_uri, diagnostics) => {
      count += diagnostics.length;
    });
    return count;
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
