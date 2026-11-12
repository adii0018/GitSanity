import * as vscode from 'vscode';
import { ConfigLoader } from '../config/configLoader';
import { scanText } from '../scanner/scanner';
import { getEnvAccessExpression } from '../env/envAccess';

interface CommentSyntax {
  lineSuffix(ruleId: string): string;
  fileHeader: string;
}

function getCommentSyntax(languageId: string): CommentSyntax {
  switch (languageId) {
    case 'python':
    case 'shellscript':
    case 'yaml':
    case 'ruby':
    case 'dockerfile':
    case 'makefile':
      return {
        lineSuffix: (ruleId: string) => ` # gitsanity-ignore ${ruleId}`,
        fileHeader: '# gitsanity-ignore-file\n'
      };
    case 'html':
    case 'xml':
    case 'markdown':
      return {
        lineSuffix: (ruleId: string) => ` <!-- gitsanity-ignore ${ruleId} -->`,
        fileHeader: '<!-- gitsanity-ignore-file -->\n'
      };
    case 'sql':
    case 'lua':
      return {
        lineSuffix: (ruleId: string) => ` -- gitsanity-ignore ${ruleId}`,
        fileHeader: '-- gitsanity-ignore-file\n'
      };
    case 'javascript':
    case 'typescript':
    case 'javascriptreact':
    case 'typescriptreact':
    case 'java':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'php':
    case 'swift':
    case 'kotlin':
    default:
      return {
        lineSuffix: (ruleId: string) => ` // gitsanity-ignore ${ruleId}`,
        fileHeader: '// gitsanity-ignore-file\n'
      };
  }
}

export class GitSanityCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly configLoader: ConfigLoader) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const isLanguageSupported = getEnvAccessExpression(document.languageId, 'TEST') !== undefined;
    const config = this.configLoader.getConfigFor(document.uri);
    const findings = scanText(document.getText(), {
      rules: config.rules,
      entropyThreshold: config.entropyThreshold,
      entropyMinLength: config.entropyMinLength
    });

    const movableFindings = isLanguageSupported
      ? findings.filter(
          f => f.meta !== undefined && (f.ruleId === 'secret' || f.ruleId === 'high-entropy-string')
        )
      : [];

    let offeredMoveAll = false;

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'GitSanity') {
        continue;
      }

      const ruleId = String(diagnostic.code || '');

      // 1. Remove console.log line
      if (ruleId === 'console-log') {
        actions.push(this.createRemoveLineAction(document, diagnostic));
      }

      // 2. Move secret to .env (for secret and high-entropy-string with meta)
      if (isLanguageSupported && (ruleId === 'secret' || ruleId === 'high-entropy-string')) {
        const matchingFinding = findings.find(
          f =>
            f.line === diagnostic.range.start.line &&
            f.startCol === diagnostic.range.start.character &&
            f.endCol === diagnostic.range.end.character
        );

        if (matchingFinding?.meta) {
          const moveAction = new vscode.CodeAction(
            'GitSanity: Move secret to .env',
            vscode.CodeActionKind.QuickFix
          );
          moveAction.diagnostics = [diagnostic];
          moveAction.isPreferred = ruleId === 'secret';
          moveAction.command = {
            command: 'gitsanity.moveSecretToEnv',
            title: 'GitSanity: Move secret to .env',
            arguments: [document.uri, diagnostic.range]
          };
          actions.push(moveAction);

          if (movableFindings.length >= 2 && !offeredMoveAll) {
            offeredMoveAll = true;
            const moveAllAction = new vscode.CodeAction(
              `GitSanity: Move all ${movableFindings.length} secrets in this file to .env`,
              vscode.CodeActionKind.QuickFix
            );
            moveAllAction.diagnostics = [diagnostic];
            moveAllAction.command = {
              command: 'gitsanity.moveAllSecretsInFile',
              title: `GitSanity: Move all ${movableFindings.length} secrets in this file to .env`
            };
            actions.push(moveAllAction);
          }
        }
      }

      // Check if this is a pure conflict marker line
      const lineIndex = diagnostic.range.start.line;
      const lineText = document.lineAt(lineIndex).text;
      const isPureConflictMarker =
        ruleId === 'conflict-marker' &&
        (/^<{7}(\s.*)?$/.test(lineText) || /^={7}$/.test(lineText) || /^>{7}(\s.*)?$/.test(lineText));

      // Do not offer Ignore fixes for pure conflict markers
      if (isPureConflictMarker) {
        continue;
      }

      const commentSyntax = getCommentSyntax(document.languageId);

      // 3. "GitSanity: Ignore this line"
      actions.push(this.createIgnoreLineAction(document, diagnostic, ruleId, commentSyntax));

      // 4. "GitSanity: Ignore <ruleId> in this file"
      actions.push(this.createIgnoreFileAction(document, diagnostic, ruleId, commentSyntax));
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
      deleteRange = new vscode.Range(lineIndex, 0, lineIndex + 1, 0);
    } else if (lineIndex > 0) {
      const prevLine = document.lineAt(lineIndex - 1);
      const currentLine = document.lineAt(lineIndex);
      deleteRange = new vscode.Range(prevLine.range.end, currentLine.range.end);
    } else {
      deleteRange = document.lineAt(lineIndex).range;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, deleteRange);
    action.edit = edit;

    return action;
  }

  private createIgnoreLineAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    ruleId: string,
    commentSyntax: CommentSyntax
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'GitSanity: Ignore this line',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diagnostic];

    const lineIndex = diagnostic.range.start.line;
    const line = document.lineAt(lineIndex);
    const suffix = commentSyntax.lineSuffix(ruleId);

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, line.range.end, suffix);
    action.edit = edit;

    return action;
  }

  private createIgnoreFileAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    ruleId: string,
    commentSyntax: CommentSyntax
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `GitSanity: Ignore ${ruleId} in this file`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diagnostic];

    let insertPos = new vscode.Position(0, 0);
    if (document.lineCount > 0) {
      const firstLine = document.lineAt(0).text;
      if (firstLine.startsWith('#!')) {
        insertPos = new vscode.Position(1, 0);
      }
    }

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, insertPos, commentSyntax.fileHeader);
    action.edit = edit;

    return action;
  }
}
