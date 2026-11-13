import * as vscode from 'vscode';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager';
import { detectRepoState } from '../git/repoDetector';
import { isGitSanityHookInstalled, resolveGitPaths } from '../git/hookInstaller';
import { getEventLogPath, readEvents } from '../stats/eventLog';
import { computeStreak } from '../stats/stats';

export class GitSanityStatusTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly diagnosticsManager: DiagnosticsManager) {
    this.diagnosticsManager.onDidChangeTotalIssues(() => this.refresh());
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];

    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
      const item = new vscode.TreeItem('No workspace folder open', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('folder');
      return [item];
    }

    const folder = folders[0];
    const root = folder.uri.fsPath;

    // 1. Diagnostic Issues Count
    const counts = this.diagnosticsManager.getIssueCounts();
    let issueLabel = 'Safety: Clean (0 issues)';
    let issueIcon = new vscode.ThemeIcon('shield', new vscode.ThemeColor('testing.iconPassed'));
    if (counts.errors > 0 || counts.warnings > 0) {
      issueLabel = `Safety: ${counts.errors} error(s), ${counts.warnings} warning(s)`;
      issueIcon = new vscode.ThemeIcon(
        counts.errors > 0 ? 'error' : 'warning',
        new vscode.ThemeColor(counts.errors > 0 ? 'errorForeground' : 'editorWarning.foreground')
      );
    }
    const issueItem = new vscode.TreeItem(issueLabel, vscode.TreeItemCollapsibleState.None);
    issueItem.iconPath = issueIcon;
    issueItem.tooltip = 'Real-time in-editor issues detected by GitSanity.';
    issueItem.command = {
      command: 'workbench.actions.view.problems',
      title: 'Show Problems'
    };
    items.push(issueItem);

    if (!vscode.workspace.isTrusted) {
      const trustItem = new vscode.TreeItem('Workspace: Untrusted (Git features disabled)', vscode.TreeItemCollapsibleState.None);
      trustItem.iconPath = new vscode.ThemeIcon('shield');
      items.push(trustItem);
      return items;
    }

    // 2. Git Repo & Branch
    try {
      const repoState = await detectRepoState(root);
      if (repoState.state === 'no-repo') {
        const noRepoItem = new vscode.TreeItem('Git: Not a repository', vscode.TreeItemCollapsibleState.None);
        noRepoItem.iconPath = new vscode.ThemeIcon('git-branch');
        noRepoItem.command = { command: 'gitsanity.createRepository', title: 'Initialize Repository' };
        items.push(noRepoItem);
      } else {
        const branchItem = new vscode.TreeItem(`Branch: ${repoState.branch || 'detached'}`, vscode.TreeItemCollapsibleState.None);
        branchItem.iconPath = new vscode.ThemeIcon('git-branch');
        items.push(branchItem);

        // 3. Pre-commit Hook Status
        const hookActive = await isGitSanityHookInstalled(root);
        const hookItem = new vscode.TreeItem(
          `Pre-commit Hook: ${hookActive ? 'Active' : 'Inactive'}`,
          vscode.TreeItemCollapsibleState.None
        );
        hookItem.iconPath = hookActive
          ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
          : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
        if (!hookActive) {
          hookItem.command = { command: 'gitsanity.installHook', title: 'Install Hook' };
          hookItem.tooltip = 'Click to install GitSanity pre-commit hook';
        }
        items.push(hookItem);

        // 4. Streak
        try {
          const { commonDir } = await resolveGitPaths(root);
          const logPath = getEventLogPath(commonDir);
          const events = await readEvents(logPath);
          const streak = computeStreak(events);
          const streakItem = new vscode.TreeItem(
            `Clean Streak: ${streak} commit(s)`,
            vscode.TreeItemCollapsibleState.None
          );
          streakItem.iconPath = new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.orange'));
          streakItem.tooltip = 'Number of consecutive safe commits with 0 errors.';
          items.push(streakItem);
        } catch {}
      }
    } catch {}

    return items;
  }
}

interface ActionItemDef {
  label: string;
  icon: string;
  command: string;
  description?: string;
  tooltip?: string;
}

export class GitSanityActionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private static readonly ACTIONS: ActionItemDef[] = [
    {
      label: 'Safe Commit',
      icon: 'git-commit',
      command: 'gitsanity.safeCommit',
      tooltip: 'Scan staged changes, verify checklist, and commit safely.'
    },
    {
      label: 'Review Before Commit',
      icon: 'checklist',
      command: 'gitsanity.reviewBeforeCommit',
      tooltip: 'Open the staged changes review panel.'
    },
    {
      label: 'Show Dashboard',
      icon: 'graph',
      command: 'gitsanity.showDashboard',
      tooltip: 'Open the GitSanity analytics dashboard with streaks and charts.'
    },
    {
      label: 'Health Report',
      icon: 'pulse',
      command: 'gitsanity.showHealthReport',
      tooltip: 'Run repository diagnostic health check.'
    },
    {
      label: 'Scan Entire Project',
      icon: 'search',
      command: 'gitsanity.scanProject',
      tooltip: 'Scan all workspace files for secrets and issues.'
    },
    {
      label: 'Scan Git Commit History',
      icon: 'history',
      command: 'gitsanity.scanHistory',
      tooltip: 'Scan past commits for leaked secrets.'
    },
    {
      label: 'Find Old TODOs',
      icon: 'clock',
      command: 'gitsanity.findOldTodos',
      tooltip: 'Search for aged TODO comments via git blame.'
    },
    {
      label: 'Install Pre-commit Hook',
      icon: 'plug',
      command: 'gitsanity.installHook',
      tooltip: 'Install or update the pre-commit hook.'
    },
    {
      label: 'Create Config File',
      icon: 'gear',
      command: 'gitsanity.createConfig',
      tooltip: 'Create or edit .gitsanity.json configuration.'
    }
  ];

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    return GitSanityActionsTreeProvider.ACTIONS.map((a) => {
      const item = new vscode.TreeItem(a.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(a.icon);
      item.tooltip = a.tooltip;
      item.command = {
        command: a.command,
        title: a.label
      };
      return item;
    });
  }
}
