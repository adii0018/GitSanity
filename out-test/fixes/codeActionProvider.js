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
exports.GitSanityCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
const scanner_1 = require("../scanner/scanner");
const envAccess_1 = require("../env/envAccess");
function getCommentSyntax(languageId) {
    switch (languageId) {
        case 'python':
        case 'shellscript':
        case 'yaml':
        case 'ruby':
        case 'dockerfile':
        case 'makefile':
            return {
                lineSuffix: (ruleId) => ` # gitsanity-ignore ${ruleId}`,
                fileHeader: '# gitsanity-ignore-file\n'
            };
        case 'html':
        case 'xml':
        case 'markdown':
            return {
                lineSuffix: (ruleId) => ` <!-- gitsanity-ignore ${ruleId} -->`,
                fileHeader: '<!-- gitsanity-ignore-file -->\n'
            };
        case 'sql':
        case 'lua':
            return {
                lineSuffix: (ruleId) => ` -- gitsanity-ignore ${ruleId}`,
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
                lineSuffix: (ruleId) => ` // gitsanity-ignore ${ruleId}`,
                fileHeader: '// gitsanity-ignore-file\n'
            };
    }
}
class GitSanityCodeActionProvider {
    constructor(configLoader) {
        this.configLoader = configLoader;
    }
    provideCodeActions(document, _range, context, _token) {
        const actions = [];
        const isLanguageSupported = (0, envAccess_1.getEnvAccessExpression)(document.languageId, 'TEST') !== undefined;
        const config = this.configLoader.getConfigFor(document.uri);
        const findings = (0, scanner_1.scanText)(document.getText(), {
            rules: config.rules,
            entropyThreshold: config.entropyThreshold,
            entropyMinLength: config.entropyMinLength
        });
        const movableFindings = isLanguageSupported
            ? findings.filter(f => f.meta !== undefined && (f.ruleId === 'secret' || f.ruleId === 'high-entropy-string'))
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
                const matchingFinding = findings.find(f => f.line === diagnostic.range.start.line &&
                    f.startCol === diagnostic.range.start.character &&
                    f.endCol === diagnostic.range.end.character);
                if (matchingFinding?.meta) {
                    const moveAction = new vscode.CodeAction('GitSanity: Move secret to .env', vscode.CodeActionKind.QuickFix);
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
                        const moveAllAction = new vscode.CodeAction(`GitSanity: Move all ${movableFindings.length} secrets in this file to .env`, vscode.CodeActionKind.QuickFix);
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
            const isPureConflictMarker = ruleId === 'conflict-marker' &&
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
    createRemoveLineAction(document, diagnostic) {
        const action = new vscode.CodeAction('GitSanity: Remove this console.log line', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const lineIndex = diagnostic.range.start.line;
        let deleteRange;
        if (lineIndex < document.lineCount - 1) {
            deleteRange = new vscode.Range(lineIndex, 0, lineIndex + 1, 0);
        }
        else if (lineIndex > 0) {
            const prevLine = document.lineAt(lineIndex - 1);
            const currentLine = document.lineAt(lineIndex);
            deleteRange = new vscode.Range(prevLine.range.end, currentLine.range.end);
        }
        else {
            deleteRange = document.lineAt(lineIndex).range;
        }
        const edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, deleteRange);
        action.edit = edit;
        return action;
    }
    createIgnoreLineAction(document, diagnostic, ruleId, commentSyntax) {
        const action = new vscode.CodeAction('GitSanity: Ignore this line', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        const lineIndex = diagnostic.range.start.line;
        const line = document.lineAt(lineIndex);
        const suffix = commentSyntax.lineSuffix(ruleId);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, line.range.end, suffix);
        action.edit = edit;
        return action;
    }
    createIgnoreFileAction(document, diagnostic, ruleId, commentSyntax) {
        const action = new vscode.CodeAction(`GitSanity: Ignore ${ruleId} in this file`, vscode.CodeActionKind.QuickFix);
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
exports.GitSanityCodeActionProvider = GitSanityCodeActionProvider;
GitSanityCodeActionProvider.providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
//# sourceMappingURL=codeActionProvider.js.map