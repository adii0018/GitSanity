const Module = require('module');
const originalRequire = Module.prototype.require;

const mockVscode = {
  workspace: {
    workspaceFolders: [],
    textDocuments: [],
    createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {}, forEach() {} }),
    onDidOpenTextDocument: () => ({ dispose() {} }),
    onDidSaveTextDocument: () => ({ dispose() {} }),
    onDidChangeTextDocument: () => ({ dispose() {} }),
    onDidCloseTextDocument: () => ({ dispose() {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    createFileSystemWatcher: () => ({
      onDidCreate: () => ({ dispose() {} }),
      onDidChange: () => ({ dispose() {} }),
      onDidDelete: () => ({ dispose() {} }),
      dispose() {}
    }),
    getConfiguration: () => ({ get: () => undefined })
  },
  commands: { registerCommand: () => ({ dispose() {} }) },
  languages: {
    createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {}, forEach() {} }),
    registerCodeActionsProvider: () => ({ dispose() {} })
  },
  window: {
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    createOutputChannel: () => ({ appendLine() {}, append() {}, dispose() {} })
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  CodeActionKind: { QuickFix: { value: 'quickfix' } },
  CodeAction: class { constructor(title, kind) { this.title = title; this.kind = kind; } },
  Range: class { constructor() {} },
  Position: class { constructor() {} },
  WorkspaceEdit: class { insert() {} delete() {} replace() {} },
  EventEmitter: class {
    constructor() { this.event = () => ({ dispose() {} }); }
    fire() {}
    dispose() {}
  },
  Uri: { file: (p) => ({ fsPath: p, scheme: 'file', toString: () => p }) }
};

Module.prototype.require = function (path) {
  if (path === 'vscode') return mockVscode;
  return originalRequire.apply(this, arguments);
};

const start = Date.now();
const ext = require('../out/extension.js');
const mockContext = {
  subscriptions: [],
  workspaceState: { get: () => undefined, update: () => Promise.resolve() }
};
ext.activate(mockContext);
const duration = Date.now() - start;

console.log(`Extension activation took: ${duration} ms`);
console.log(`Subscriptions registered: ${mockContext.subscriptions.length}`);
