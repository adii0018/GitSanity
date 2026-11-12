# GitSanity

**Scan, secure, and commit safely.**

GitSanity is a lightweight, zero-dependency VS Code extension that catches mistakes **before** they reach your Git history: leaked API keys, forgotten `console.log` statements, stray `debugger;` breakpoints, merge conflict markers, and stale TODOs.

<!-- Screenshots
Placeholder for marketplace preview screenshots.
-->

---

## Quick Start (3 Steps)

1. **Install GitSanity** from the VS Code Marketplace or from a local `.vsix` file.
2. **Open any project folder**: GitSanity immediately starts scanning your open files and highlights security issues in real-time.
3. **Protect your commits**: Run `GitSanity: Install Git Hook` from the Command Palette (<kbd>Ctrl+Shift+P</kbd> / <kbd>Cmd+Shift+P</kbd>) to prevent accidental secret leaks across terminal commands and editor commits.

---

## Features at a Glance

| Feature | Description | Command |
|---|---|---|
| **Live Editor Scanning** | Real-time diagnostics for secrets, logs, breakpoints, and conflict markers. | `GitSanity: Rescan Open Files` |
| **Move Secrets to `.env`** | One-click Quick Fix migrating hardcoded credentials to `.env`. | `GitSanity: Move Secret to .env` |
| **Review Before Commit** | Interactive pre-commit review panel with checklists and branch warnings. | `GitSanity: Review Before Commit` |
| **Safe Commit** | Pre-flight index scan with automated Conventional Commit message generation. | `GitSanity: Safe Commit` |
| **Undo Last Commit** | Safe soft-reset (`HEAD~1`) for local unpushed commits. | `GitSanity: Undo Last Commit` |
| **Pre-Commit Hook** | Bundled Node.js hook inspecting staged files directly from Git index. | `GitSanity: Install Git Hook` |
| **Repository Health Report** | Webview report assessing repository security hygiene and setup. | `GitSanity: Show Health Report` |
| **Analytics Dashboard** | Clean commit streak, milestone badges, and 8-week issue trend chart. | `GitSanity: Show Dashboard` |
| **Old TODO Detector** | Scans Git blame history to find stale TODOs and FIXMEs. | `GitSanity: Find Old TODOs` |
| **Git History Scanner** | Deep inspects commit history diffs for previously committed secrets. | `GitSanity: Scan Git History` |
| **Publish to GitHub** | Creates a private or public GitHub repo via HTTPS API and pushes code. | `GitSanity: Publish to GitHub` |

---

## Detection Rules

- `secret`: Flags AWS access keys, generic credential assignments (e.g. `api_key = "..."`, `password = "..."`), and 32+ character hex tokens.
- `high-entropy-string`: Shannon entropy detector catching random tokens, hashes, and API keys inside quotes while ignoring UUIDs, URLs, and variable names.
- `console-log`: Flags forgotten `console.log(...)` calls (warning).
- `debugger`: Flags stray `debugger;` breakpoints (error).
- `conflict-marker`: Flags Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) (error).
- `old-todo`: Flags TODO, FIXME, HACK, and XXX comments older than a configurable threshold (default 90 days).

---

## Move Secrets to `.env` (Smart Auto-Fix)

When GitSanity detects a hardcoded credential or high-entropy secret, click the lightbulb icon (<kbd>Ctrl+.</kbd> / <kbd>Cmd+.</kbd>) to trigger **GitSanity: Move to .env**.

### What It Does Automatically
1. **Converts Variable Names**: Transforms `apiKey` or `stripe-secret` to `API_KEY` or `STRIPE_SECRET`.
2. **Updates `.env`**: Appends the secret cleanly without overwriting existing entries. If a variable with that name already exists with a different value, GitSanity safely uses `API_KEY_2`.
3. **Synchronizes `.env.example`**: Adds a placeholder (e.g. `API_KEY=`) to `.env.example` so teammates know what to configure.
4. **Protects `.gitignore`**: Automatically verifies that `.env` is listed in your `.gitignore`.
5. **Replaces Code**: Replaces the literal in your code with the appropriate language expression.

### Supported Languages & Expressions

| Language | Generated Expression | Note |
|---|---|---|
| **JavaScript / TypeScript** | `process.env.VARIABLE_NAME` | Native Node.js lookup |
| **Python** | `os.environ["VARIABLE_NAME"]` | Automatically inserts `import os` |
| **Ruby** | `ENV["VARIABLE_NAME"]` | Native Ruby ENV lookup |
| **PHP** | `getenv('VARIABLE_NAME')` | Native PHP getenv |
| **Go** | `os.Getenv("VARIABLE_NAME")` | Standard library os package |
| **Java** | `System.getenv("VARIABLE_NAME")` | Standard Java environment lookup |
| **C#** | `Environment.GetEnvironmentVariable("VARIABLE_NAME")` | Standard .NET environment lookup |
| **Shell (bash/sh)** | `${VARIABLE_NAME}` | POSIX environment variable syntax |

> [!WARNING]
> **Secret Rotation Notice**: Moving a secret to `.env` prevents future leaks. If the secret was already committed or pushed to a remote repository in the past, rotate and revoke it immediately: editing working files does not remove secrets from Git history.

---

## Pre-Commit Hook & Safe Commit

### CLI Pre-Commit Hook
Run `GitSanity: Install Git Hook` to install GitSanity's bundled pre-commit hook into `.git/hooks/pre-commit`.
- **Index-Based Verification**: Directly inspects staged changes in the Git index (`git show :<path>`). Modifying files in your working directory after `git add` cannot trick the hook.
- **Blocks Dangerous Staging**: Prevents staging `.env` files and files with error-severity issues.
- **Large File Warning**: Warns when staged files exceed `largeFileMB` (default 5 MB).
- **Graceful Fallback**: Fails open (exit code 0) if an internal runtime error occurs, ensuring you are never blocked from emergency work.

### Safe Commit & Review Panel
- **`GitSanity: Review Before Commit`**: Opens an interactive webview displaying all staged files and findings, interactive human checklists ("I reviewed console.log statements", "I confirmed protected branch"), and an editable commit message with a 72-character first-line counter.
- **`GitSanity: Safe Commit`**: Fast pre-flight scan from the Command Palette, prompts for confirmation before committing directly to `main` or `master`, generates Conventional Commits messages, and provides one-click **Push** and **Undo** buttons after commit.

---

## Analytics Dashboard & Clean Streaks

Run `GitSanity: Show Dashboard` to view your security and hygiene metrics:
- **Clean Commit Streak**: Tracks consecutive commits with 0 errors and 0 warnings.
- **Milestone Badges**: Unlockable achievements at 7, 30, and 100 clean commits.
- **Weekly Trend Chart**: Inline SVG bar chart tracking errors and warnings over the last 8 weeks (with accessible data table fallback).
- **Top 5 Mistakes**: Identifies the rules most frequently triggered in your project.

---

## Configuration (`.gitsanity.json`)

Configure GitSanity per repository by creating a `.gitsanity.json` file in your workspace root (or run `GitSanity: Create Config File`):

```json
{
  "$schema": "./schemas/gitsanity.schema.json",
  "rules": {
    "console-log": "warn",
    "debugger": "error",
    "conflict-marker": "error",
    "secret": "error",
    "high-entropy-string": "warn",
    "old-todo": "off"
  },
  "ignorePaths": [
    "tests/**",
    "scripts/**",
    "docs/**/*.md"
  ],
  "maxFileSizeMB": 1,
  "entropyThreshold": 4.5,
  "entropyMinLength": 20,
  "envFile": ".env",
  "envExampleFile": ".env.example",
  "createEnvExample": true,
  "largeFileMB": 5,
  "maxProjectFiles": 20000,
  "blockOnWarnings": false,
  "todoMaxAgeDays": 90
}
```

### Inline Ignore Directives

You can suppress findings directly inside your code using comments:

- `// gitsanity-ignore`: Suppresses all findings on the current line.
- `// gitsanity-ignore console-log, debugger`: Suppresses only specified rules on the current line.
- `// gitsanity-ignore-next-line [rules]`: Suppresses findings on the following line.
- `// gitsanity-ignore-file`: Place in the first 10 lines of a file to ignore the entire file.

Directives work in comments across all languages (`//`, `#`, `/* ... */`, `<!-- ... -->`, `--`, `;`, `%`).

---

## VS Code Settings

Custom settings available under `Settings > Extensions > GitSanity`:

- `gitsanity.promptOnOpen`: Prompt to initialize Git or run a project scan when opening a folder (default: `true`).
- `gitsanity.warnOnMainBranch`: Warn before committing directly to `main` or `master` (default: `true`).
- `gitsanity.historyMaxCommits`: Maximum commits to inspect during Git history scans (default: `500`).

---

## Privacy & Security

- **100% Local Execution**: All rule scans, entropy calculations, and Git checks run locally on your machine.
- **No Telemetry**: GitSanity collects zero analytics and contains no tracking code or telemetry.
- **Sanitized Logs**: Commit events and streaks are logged strictly inside your local `.git` directory (`<git-common-dir>/gitsanity/events.jsonl`). Logs contain **only** counts and rule IDs—never file paths, code snippets, or secret values.
- **Token Protection**: GitHub Personal Access Tokens used during GitHub publishing are processed entirely in-memory and never saved to disk. All logs, error messages, and output channels strictly redact tokens and credentials.
- **Workspace Trust**: In untrusted workspaces, all Git, hook, and CLI capabilities are disabled. In-editor document scanning continues safely without executing external processes.

---

## Known Limitations

- **Large Repositories**: Whole-project scans on repositories with over 20,000 files will scan up to the configured `maxProjectFiles` limit.
- **Binary Files**: Binary files are detected via null-byte inspection and skipped automatically.
- **History Rewriting**: GitSanity does not rewrite Git history. If a secret was committed in the past, GitSanity reports the commit hash and author so you can rotate the credential.

---

## FAQ & Troubleshooting

**Q: The pre-commit hook failed with "node: command not found".**
Git hooks run in the environment of your Git client. Ensure Node.js (v16 or higher) is available on your system `PATH`.

**Q: Can I bypass the pre-commit hook in an emergency?**
Yes. You can bypass the hook using standard Git syntax: `git commit --no-verify -m "commit message"`.

**Q: What should I do if GitSanity reports a secret in Git history?**
Removing the secret from your current files does not delete it from past commits. Anyone with access to the repository can view past commits in the Git log. **Immediately rotate and revoke the compromised token or key** with the service provider.

**Q: How do I uninstall the Git hook?**
Run `GitSanity: Uninstall Git Hook` from the Command Palette. This cleanly removes the GitSanity hook block while preserving any other hooks you have configured.

---

## License

MIT License. See [LICENSE](file:///c:/Users/opg21/OneDrive/Desktop/GitSanity/LICENSE) for details.
