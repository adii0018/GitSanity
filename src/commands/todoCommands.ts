import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runGit } from '../git/gitRunner';
import { isIgnored } from '../config/pathMatcher';
import { ConfigLoader } from '../config/configLoader';
import { findTodoLines } from '../todo/todoFinder';
import { getTodoAges } from '../todo/todoAge';

export interface OldTodoItem {
  relPath: string;
  line: number; // 0-based
  tag: string;
  ageDays: number;
  preview: string;
}

export async function findOldTodosCommand(configLoader: ConfigLoader): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage(
      'GitSanity: Git operations are disabled in untrusted workspaces.'
    );
    return;
  }

  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    vscode.window.showErrorMessage('GitSanity: No workspace folder open.');
    return;
  }

  let folder = folders[0];
  if (folders.length > 1) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder to inspect for old TODOs'
    });
    if (!picked) return;
    folder = picked;
  }

  const root = folder.uri.fsPath;
  const config = configLoader.getConfigFor(folder.uri);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitSanity: Finding old TODO comments...',
      cancellable: true
    },
    async (progress, token) => {
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      // Get tracked files via git ls-files (cap at 5000)
      const lsRes = await runGit(['ls-files', '-z'], root, { signal: abortController.signal });
      if (lsRes.code !== 0) {
        vscode.window.showWarningMessage('GitSanity: Unable to list tracked Git files.');
        return;
      }

      const files = lsRes.stdout
        .split('\0')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .slice(0, 5000);

      const items: OldTodoItem[] = [];
      const now = Date.now();
      const maxSizeBytes = (config.maxFileSizeMB || 1) * 1024 * 1024;

      let scannedCount = 0;
      for (const relPath of files) {
        if (token.isCancellationRequested) break;
        scannedCount++;
        if (scannedCount % 50 === 0) {
          progress.report({
            message: `${scannedCount}/${files.length} files scanned`
          });
        }

        if (isIgnored(relPath, config.ignorePaths)) continue;

        const fullPath = path.join(root, relPath);
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(fullPath);
          if (stat.size > maxSizeBytes) continue;
        } catch {
          continue;
        }

        let content = '';
        try {
          content = await fs.promises.readFile(fullPath, 'utf8');
        } catch {
          continue;
        }

        const todos = findTodoLines(content);
        if (todos.length === 0) continue;

        const lines = todos.map((t) => t.line);
        const ageMap = await getTodoAges(root, relPath, lines, now, config.maxFileSizeMB);

        const contentLines = content.split(/\r?\n/);
        for (const t of todos) {
          const ageDays = ageMap.get(t.line);
          if (ageDays !== undefined) {
            const rawLine = contentLines[t.line] || '';
            const preview = rawLine.trim().substring(0, 100);
            items.push({
              relPath,
              line: t.line,
              tag: t.tag,
              ageDays,
              preview
            });
          }
        }
      }

      if (token.isCancellationRequested) return;

      if (items.length === 0) {
        vscode.window.showInformationMessage('GitSanity: No committed TODO comments found.');
        return;
      }

      // Sort oldest first
      items.sort((a, b) => b.ageDays - a.ageDays);

      interface QuickPickTodoItem extends vscode.QuickPickItem {
        todo: OldTodoItem;
      }

      const picks: QuickPickTodoItem[] = items.map((item) => ({
        label: `$(clock) ${item.ageDays} day(s) old: ${item.tag} in ${item.relPath}:${item.line + 1}`,
        description: item.preview,
        detail: `Committed ~${item.ageDays} day(s) ago`,
        todo: item
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: `Found ${items.length} TODO(s) sorted oldest first. Select one to open:`
      });

      if (selected) {
        const docPath = path.join(root, selected.todo.relPath);
        try {
          const doc = await vscode.workspace.openTextDocument(docPath);
          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(
              selected.todo.line,
              0,
              selected.todo.line,
              0
            )
          });
        } catch {}
      }
    }
  );
}
