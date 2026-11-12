import * as vscode from 'vscode';

export class GitSanityCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'GitSanity' && diagnostic.code === 'console-log') {
        const action = this.createRemoveLineAction(document, diagnostic);
        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  private createRemoveLineAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'GitSanity: Remove this console.log line',
      vscode.CodeActionKind.QuickFix
    );

    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const lineIndex = diagnostic.range.start.line;
    let deleteRange: vscode.Range;

    if (lineIndex < document.lineCount - 1) {
      // Line with subsequent lines: delete from line start to next line start
      deleteRange = new vscode.Range(lineIndex, 0, lineIndex + 1, 0);
    } else if (lineIndex > 0) {
      // Last line with preceding lines: delete from end of previous line to end of this line
      const prevLine = document.lineAt(lineIndex - 1);
      const currentLine = document.lineAt(lineIndex);
      deleteRange = new vscode.Range(prevLine.range.end, currentLine.range.end);
    } else {
      // Sole line in document
      deleteRange = document.lineAt(lineIndex).range;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, deleteRange);
    action.edit = edit;

    return action;
  }
}
