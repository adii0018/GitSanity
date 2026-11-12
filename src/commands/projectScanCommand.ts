import * as vscode from 'vscode';
import * as path from 'path';
import { scanProject, ProjectScanResult } from '../scanner/projectScanner';
import { ConfigLoader } from '../config/configLoader';
import { setSessionProjectScanSummary } from '../ui/dashboard';

export let lastProjectScanResult: { folder: vscode.WorkspaceFolder; result: ProjectScanResult } | undefined;

export async function scanProjectCommand(
  configLoader: ConfigLoader,
  projectDiagnostics: vscode.DiagnosticCollection,
  targetFolder?: vscode.WorkspaceFolder
): Promise<ProjectScanResult | undefined> {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
    return undefined;
  }

  let folder = targetFolder || folders[0];
  if (!targetFolder && folders.length > 1) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder to scan'
    });
    if (!picked) return undefined;
    folder = picked;
  }

  const config = configLoader.getConfigFor(folder.uri);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitSanity: Scanning project...',
      cancellable: true
    },
    async (progress, token) => {
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      const scanResult = await scanProject(folder.uri.fsPath, {
        config,
        signal: abortController.signal,
        onProgress: (scanned, total) => {
          progress.report({
            message: `${scanned}/${total} files scanned`
          });
        }
      });

      lastProjectScanResult = { folder, result: scanResult };

      const summaryList = Array.from(scanResult.byFile.entries())
        .map(([file, findings]) => {
          let errs = 0;
          let warns = 0;
          for (const f of findings) {
            if (f.severity === 'error') errs++;
            else warns++;
          }
          return { file, errors: errs, warnings: warns, total: errs + warns };
        })
        .sort((a, b) => b.total - a.total);
      setSessionProjectScanSummary(summaryList);

      // Publish findings to separate DiagnosticCollection "gitsanity-project" (cap 5000)
      projectDiagnostics.clear();
      let totalPublished = 0;
      const MAX_DIAGNOSTICS = 5000;

      for (const [relPath, findings] of scanResult.byFile.entries()) {
        if (totalPublished >= MAX_DIAGNOSTICS) break;
        const fileUri = vscode.Uri.file(path.join(folder.uri.fsPath, relPath));
        const diags: vscode.Diagnostic[] = [];

        for (const f of findings) {
          if (totalPublished >= MAX_DIAGNOSTICS) break;
          const range = new vscode.Range(f.line, f.startCol, f.line, f.endCol);
          const diag = new vscode.Diagnostic(
            range,
            f.message,
            f.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
          );
          diag.source = 'GitSanity';
          diag.code = f.ruleId;
          diags.push(diag);
          totalPublished++;
        }

        projectDiagnostics.set(fileUri, diags);
      }

      const totalIssues = scanResult.countsBySeverity.error + scanResult.countsBySeverity.warning;
      const summaryMsg = `GitSanity: Project scan complete. Scanned ${scanResult.filesScanned} files. Found ${scanResult.countsBySeverity.error} error(s), ${scanResult.countsBySeverity.warning} warning(s).`;

      vscode.window
        .showInformationMessage(summaryMsg, 'Show Health Report', 'View Problems')
        .then((choice) => {
          if (choice === 'Show Health Report') {
            vscode.commands.executeCommand('gitsanity.showHealthReport', folder);
          } else if (choice === 'View Problems') {
            vscode.commands.executeCommand('workbench.actions.view.problems');
          }
        });

      return scanResult;
    }
  );
}

export function clearProjectScanCommand(projectDiagnostics: vscode.DiagnosticCollection): void {
  projectDiagnostics.clear();
  lastProjectScanResult = undefined;
  vscode.window.showInformationMessage('GitSanity: Cleared project scan diagnostics.');
}
