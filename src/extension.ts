import * as vscode from 'vscode';
import { DiagnosticsManager } from './diagnostics/diagnosticsManager';
import { GitSanityCodeActionProvider } from './fixes/codeActionProvider';

export function activate(context: vscode.ExtensionContext): void {
  // 1. Initialize DiagnosticsManager
  const diagnosticsManager = new DiagnosticsManager();

  // 2. Register CodeActionProvider for Quick Fixes
  const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    new GitSanityCodeActionProvider(),
    {
      providedCodeActionKinds: GitSanityCodeActionProvider.providedCodeActionKinds
    }
  );

  // 3. Create Left Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  const updateStatusBar = (count: number): void => {
    if (count === 0) {
      statusBarItem.text = '$(shield) GitSanity: Active';
      statusBarItem.tooltip = 'GitSanity: No issues detected';
    } else {
      const label = count === 1 ? '1 issue' : `${count} issues`;
      statusBarItem.text = `$(warning) GitSanity: ${label}`;
      statusBarItem.tooltip = `GitSanity: ${label} detected`;
    }
  };

  // Initial update & display
  updateStatusBar(diagnosticsManager.getTotalIssueCount());
  statusBarItem.show();

  // Subscribe to diagnostic updates
  const statusSubscription = diagnosticsManager.onDidChangeTotalIssues(count => {
    updateStatusBar(count);
  });

  // 4. Register all disposables with extension context
  context.subscriptions.push(
    diagnosticsManager,
    codeActionRegistration,
    statusBarItem,
    statusSubscription
  );
}

export function deactivate(): void {}
