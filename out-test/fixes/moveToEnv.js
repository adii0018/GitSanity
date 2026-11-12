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
exports.moveSecretToEnv = moveSecretToEnv;
exports.moveAllSecretsInFile = moveAllSecretsInFile;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const scanner_1 = require("../scanner/scanner");
const envName_1 = require("../env/envName");
const envFile_1 = require("../env/envFile");
const gitignoreFile_1 = require("../env/gitignoreFile");
const envAccess_1 = require("../env/envAccess");
function getSafeWorkspaceFile(folder, relativePath, defaultName) {
    const target = relativePath || defaultName;
    const root = path.resolve(folder.uri.fsPath);
    const resolved = path.resolve(root, target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return { uri: vscode.Uri.joinPath(folder.uri, defaultName), fileName: defaultName };
    }
    const rel = path.relative(root, resolved).replace(/\\/g, '/');
    return { uri: vscode.Uri.file(resolved), fileName: rel || defaultName };
}
function pythonAlreadyImportsOs(text) {
    const lines = text.split(/\r?\n/);
    return lines.some(l => {
        const t = l.trim();
        return t === 'import os' || t.startsWith('import os,') || t.startsWith('import os ');
    });
}
function findPythonImportInsertLine(document) {
    let insertLine = 0;
    for (let i = 0; i < Math.min(document.lineCount, 5); i++) {
        const lineText = document.lineAt(i).text.trim();
        if (lineText.startsWith('#!') || /coding[:=]\s*[-\w.]+/.test(lineText)) {
            insertLine = i + 1;
        }
        else {
            break;
        }
    }
    return insertLine;
}
async function ensureEnvInGitignore(folder, envFileName) {
    const gitDir = vscode.Uri.joinPath(folder.uri, '.git');
    try {
        await vscode.workspace.fs.stat(gitDir);
    }
    catch {
        // Only manage .gitignore if a .git directory exists
        return;
    }
    const gitignoreUri = vscode.Uri.joinPath(folder.uri, '.gitignore');
    let gitignoreText = '';
    try {
        const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
        gitignoreText = Buffer.from(bytes).toString('utf8');
    }
    catch { }
    if (!(0, gitignoreFile_1.isEnvIgnored)(gitignoreText, envFileName)) {
        const updated = (0, gitignoreFile_1.addEnvToGitignore)(gitignoreText, envFileName);
        await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(updated, 'utf8'));
    }
}
/**
 * Handles the single-secret "Move secret to .env" command.
 */
async function moveSecretToEnv(documentUri, range, configLoader) {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const text = document.getText();
    const config = configLoader.getConfigFor(document.uri);
    const findings = (0, scanner_1.scanText)(text, {
        rules: config.rules,
        entropyThreshold: config.entropyThreshold,
        entropyMinLength: config.entropyMinLength
    });
    const finding = findings.find(f => f.line === range.start.line &&
        f.startCol === range.start.character &&
        f.endCol === range.end.character &&
        f.meta !== undefined);
    if (!finding || !finding.meta) {
        vscode.window.showInformationMessage('GitSanity: No movable secret found at the selected range.');
        return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        vscode.window.showWarningMessage('GitSanity: File must be within a workspace folder to move secrets to .env.');
        return;
    }
    const access = (0, envAccess_1.getEnvAccessExpression)(document.languageId, 'DUMMY');
    if (!access) {
        vscode.window.showInformationMessage(`GitSanity: Language "${document.languageId}" is not supported for .env auto-fix yet.`);
        return;
    }
    const { uri: envUri, fileName: envFileName } = getSafeWorkspaceFile(folder, config.envFile, '.env');
    let envText = '';
    try {
        const bytes = await vscode.workspace.fs.readFile(envUri);
        envText = Buffer.from(bytes).toString('utf8');
    }
    catch { }
    const baseName = (0, envName_1.toEnvVarName)(finding.meta.keyName, 1);
    const { text: updatedEnvText, finalName } = (0, envFile_1.upsertEnvEntry)(envText, baseName, finding.meta.value);
    // Write .env file
    await vscode.workspace.fs.writeFile(envUri, Buffer.from(updatedEnvText, 'utf8'));
    // Update .env.example if enabled
    if (config.createEnvExample !== false) {
        const { uri: exampleUri } = getSafeWorkspaceFile(folder, config.envExampleFile, '.env.example');
        let exampleText = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(exampleUri);
            exampleText = Buffer.from(bytes).toString('utf8');
        }
        catch { }
        const updatedExampleText = (0, envFile_1.ensureExampleEntry)(exampleText, finalName);
        await vscode.workspace.fs.writeFile(exampleUri, Buffer.from(updatedExampleText, 'utf8'));
    }
    // Apply replacement in document
    const envExpr = (0, envAccess_1.getEnvAccessExpression)(document.languageId, finalName);
    const edit = new vscode.WorkspaceEdit();
    const replaceRange = new vscode.Range(new vscode.Position(finding.line, finding.meta.literalStartCol), new vscode.Position(finding.line, finding.meta.literalEndCol));
    edit.replace(document.uri, replaceRange, envExpr.expression);
    // For Python: insert import os if needed
    if (document.languageId === 'python' && envExpr.importLine && !pythonAlreadyImportsOs(text)) {
        const insertLine = findPythonImportInsertLine(document);
        edit.insert(document.uri, new vscode.Position(insertLine, 0), `${envExpr.importLine}\n`);
    }
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
        vscode.window.showErrorMessage(`GitSanity: Failed to update document. The ${envFileName} file was already updated.`);
        return;
    }
    // Ensure env file is in .gitignore
    await ensureEnvInGitignore(folder, envFileName);
    let msg = `Moved secret to ${envFileName} as ${finalName}. If this secret was ever committed or pushed, rotate it now: removing it from code does not remove it from Git history.`;
    if (envExpr.hint) {
        msg += ` ${envExpr.hint}`;
    }
    vscode.window.showInformationMessage(msg);
}
/**
 * Handles "Move All Secrets in This File to .env".
 */
async function moveAllSecretsInFile(configLoader) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const document = editor.document;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
        vscode.window.showWarningMessage('GitSanity: File must be within a workspace folder to move secrets to .env.');
        return;
    }
    const accessCheck = (0, envAccess_1.getEnvAccessExpression)(document.languageId, 'DUMMY');
    if (!accessCheck) {
        vscode.window.showInformationMessage(`GitSanity: Language "${document.languageId}" is not supported for .env auto-fix yet.`);
        return;
    }
    const config = configLoader.getConfigFor(document.uri);
    const text = document.getText();
    const findings = (0, scanner_1.scanText)(text, {
        rules: config.rules,
        entropyThreshold: config.entropyThreshold,
        entropyMinLength: config.entropyMinLength
    });
    const movableFindings = findings.filter(f => f.meta !== undefined && (f.ruleId === 'secret' || f.ruleId === 'high-entropy-string'));
    if (movableFindings.length === 0) {
        vscode.window.showInformationMessage('GitSanity: No movable secrets found in this file.');
        return;
    }
    // Modal confirmation
    const confirm = await vscode.window.showWarningMessage(`Move ${movableFindings.length} secrets to .env?`, { modal: true }, 'Move');
    if (confirm !== 'Move') {
        return;
    }
    const { uri: envUri, fileName: envFileName } = getSafeWorkspaceFile(folder, config.envFile, '.env');
    let envText = '';
    try {
        const bytes = await vscode.workspace.fs.readFile(envUri);
        envText = Buffer.from(bytes).toString('utf8');
    }
    catch { }
    const { uri: exampleUri } = getSafeWorkspaceFile(folder, config.envExampleFile, '.env.example');
    let exampleText = '';
    try {
        const bytes = await vscode.workspace.fs.readFile(exampleUri);
        exampleText = Buffer.from(bytes).toString('utf8');
    }
    catch { }
    const replacements = [];
    let fallbackIndex = 1;
    for (const finding of movableFindings) {
        const baseName = (0, envName_1.toEnvVarName)(finding.meta.keyName, fallbackIndex++);
        const { text: updatedEnv, finalName } = (0, envFile_1.upsertEnvEntry)(envText, baseName, finding.meta.value);
        envText = updatedEnv;
        if (config.createEnvExample !== false) {
            exampleText = (0, envFile_1.ensureExampleEntry)(exampleText, finalName);
        }
        replacements.push({ finding, finalName });
    }
    // Write .env and .env.example
    await vscode.workspace.fs.writeFile(envUri, Buffer.from(envText, 'utf8'));
    if (config.createEnvExample !== false) {
        await vscode.workspace.fs.writeFile(exampleUri, Buffer.from(exampleText, 'utf8'));
    }
    // Apply replacements from last to first so line/col ranges stay valid
    replacements.sort((a, b) => {
        if (a.finding.line !== b.finding.line) {
            return b.finding.line - a.finding.line;
        }
        return b.finding.meta.literalStartCol - a.finding.meta.literalStartCol;
    });
    const edit = new vscode.WorkspaceEdit();
    for (const { finding, finalName } of replacements) {
        const expr = (0, envAccess_1.getEnvAccessExpression)(document.languageId, finalName).expression;
        const range = new vscode.Range(new vscode.Position(finding.line, finding.meta.literalStartCol), new vscode.Position(finding.line, finding.meta.literalEndCol));
        edit.replace(document.uri, range, expr);
    }
    // For Python: insert import os if needed
    if (document.languageId === 'python' && !pythonAlreadyImportsOs(text)) {
        const insertLine = findPythonImportInsertLine(document);
        edit.insert(document.uri, new vscode.Position(insertLine, 0), 'import os\n');
    }
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
        vscode.window.showErrorMessage(`GitSanity: Failed to update document. The ${envFileName} file was already updated.`);
        return;
    }
    await ensureEnvInGitignore(folder, envFileName);
    vscode.window.showInformationMessage(`GitSanity: Moved ${movableFindings.length} secrets to ${envFileName}. If these secrets were ever committed or pushed, rotate them now: removing them from code does not remove them from Git history.`);
}
//# sourceMappingURL=moveToEnv.js.map