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
exports.GitSanityActionsTreeProvider = exports.GitSanityStatusTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const repoDetector_1 = require("../git/repoDetector");
const hookInstaller_1 = require("../git/hookInstaller");
const eventLog_1 = require("../stats/eventLog");
const stats_1 = require("../stats/stats");
class GitSanityStatusTreeProvider {
    constructor(diagnosticsManager) {
        this.diagnosticsManager = diagnosticsManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.diagnosticsManager.onDidChangeTotalIssues(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const items = [];
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
            issueIcon = new vscode.ThemeIcon(counts.errors > 0 ? 'error' : 'warning', new vscode.ThemeColor(counts.errors > 0 ? 'errorForeground' : 'editorWarning.foreground'));
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
            const repoState = await (0, repoDetector_1.detectRepoState)(root);
            if (repoState.state === 'no-repo') {
                const noRepoItem = new vscode.TreeItem('Git: Not a repository', vscode.TreeItemCollapsibleState.None);
                noRepoItem.iconPath = new vscode.ThemeIcon('git-branch');
                noRepoItem.command = { command: 'gitsanity.createRepository', title: 'Initialize Repository' };
                items.push(noRepoItem);
            }
            else {
                const branchItem = new vscode.TreeItem(`Branch: ${repoState.branch || 'detached'}`, vscode.TreeItemCollapsibleState.None);
                branchItem.iconPath = new vscode.ThemeIcon('git-branch');
                items.push(branchItem);
                // 3. Pre-commit Hook Status
                const hookActive = await (0, hookInstaller_1.isGitSanityHookInstalled)(root);
                const hookItem = new vscode.TreeItem(`Pre-commit Hook: ${hookActive ? 'Active' : 'Inactive'}`, vscode.TreeItemCollapsibleState.None);
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
                    const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(root);
                    const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
                    const events = await (0, eventLog_1.readEvents)(logPath);
                    const streak = (0, stats_1.computeStreak)(events);
                    const streakItem = new vscode.TreeItem(`Clean Streak: ${streak} commit(s)`, vscode.TreeItemCollapsibleState.None);
                    streakItem.iconPath = new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.orange'));
                    streakItem.tooltip = 'Number of consecutive safe commits with 0 errors.';
                    items.push(streakItem);
                }
                catch { }
            }
        }
        catch { }
        return items;
    }
}
exports.GitSanityStatusTreeProvider = GitSanityStatusTreeProvider;
class GitSanityActionsTreeProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren() {
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
exports.GitSanityActionsTreeProvider = GitSanityActionsTreeProvider;
GitSanityActionsTreeProvider.ACTIONS = [
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
//# sourceMappingURL=sidebar.js.map