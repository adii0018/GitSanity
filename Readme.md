# GitSanity

**Scan, secure and commit safely.**

GitSanity is a VS Code extension that catches mistakes **before** they reach your Git history: leaked secrets, forgotten `console.log`, stray `debugger`, and merge conflict markers.

---

## Features

### Detection Rules
- `console-log`: Flags `console.log(...)` calls before committing.
- `debugger`: Flags `debugger;` breakpoints.
- `conflict-marker`: Flags Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
- `secret`: Flags hardcoded credentials (AWS keys, generic token/password assignments, hex secrets). Bare Git commit hashes are ignored.
- `high-entropy-string`: Detects high-entropy random strings inside quotes using Shannon entropy calculation (entropy >= 4.5 by default) while ignoring UUIDs, URLs, and camelCase identifiers.

---

## Move Secrets to `.env` (Smart Auto-Fix)

GitSanity provides a one-click Quick Fix to safely migrate hardcoded secrets to an environment file and replace the code with the language's native environment lookup.

### How It Works
1. **Name Extraction**: Converts the assignment identifier or key (e.g. `apiKey`, `stripe-secret`, `dbPassword`) into `UPPER_SNAKE_CASE` (e.g. `API_KEY`, `STRIPE_SECRET`, `DB_PASSWORD`). Bare AWS keys fall back to `AWS_ACCESS_KEY_ID`.
2. **`.env` Update**: Appends `NAME=value` to `.env` (or configured `envFile`). If the variable already exists with a different value, GitSanity automatically renames it to `NAME_2`, `NAME_3`, etc.
3. **`.env.example` Update**: Automatically ensures a placeholder `NAME=` exists in `.env.example` without values.
4. **Code Replacement**: Replaces the literal in your source file with the appropriate environment variable expression. For Python, it automatically inserts `import os` in the correct location (after any shebang and encoding lines).
5. **`.gitignore` Protection**: Verifies whether `.env` is ignored by `.gitignore`. If not, it adds it automatically.
6. **Rotation Reminder**: Displays a warning reminder that removing secrets from code does not remove them from Git history if they were previously committed.

> [!WARNING]
> **Secret Rotation Notice**: Moving a secret to `.env` keeps it out of future commits. If this secret was ever committed or pushed, rotate and revoke it immediately: removing it from working files does not erase it from Git history.

### Supported Languages

| Language | Generated Expression | Import / Hint |
|---|---|---|
| **JavaScript / TypeScript** (`.js`, `.ts`, `.jsx`, `.tsx`) | `process.env.VAR_NAME` | Load `.env` at startup (e.g. using `dotenv`) |
| **Python** (`.py`) | `os.environ["VAR_NAME"]` | Automatically inserts `import os` |
| **Ruby** (`.rb`) | `ENV["VAR_NAME"]` | Native `ENV` lookup |
| **PHP** (`.php`) | `getenv('VAR_NAME')` | Native `getenv()` |
| **Go** (`.go`) | `os.Getenv("VAR_NAME")` | Ensure `"os"` package is imported |
| **Java** (`.java`) | `System.getenv("VAR_NAME")` | Native `System.getenv` |
| **C#** (`.cs`) | `Environment.GetEnvironmentVariable("VAR_NAME")` | Native `Environment` |
| **Shell** (`.sh`, `.bash`) | `${VAR_NAME}` | Source your `.env` file before running |

---

## Configuration (`.gitsanity.json`)

GitSanity supports workspace-level configuration with real-time file-watching and schema validation.

```json
{
  "$schema": "./schemas/gitsanity.schema.json",
  "rules": {
    "console-log": "warn",
    "debugger": "error",
    "conflict-marker": "error",
    "secret": "error",
    "high-entropy-string": "warn"
  },
  "ignorePaths": [
    "tests/",
    "scripts/",
    "docs/**/*.md"
  ],
  "maxFileSizeMB": 1,
  "entropyThreshold": 4.5,
  "entropyMinLength": 20,
  "envFile": ".env",
  "envExampleFile": ".env.example",
  "createEnvExample": true
}
```

- **Rule Severities**: `"off"` (disabled), `"warn"` (warning diagnostic), `"error"` (error diagnostic).
- **Environment File Settings**:
  - `envFile`: Destination `.env` file (default `".env"`).
  - `envExampleFile`: Destination example file (default `".env.example"`).
  - `createEnvExample`: Whether to keep the example file synchronized (default `true`).
- **Default Ignores**: `node_modules/`, `.git/`, `out/`, `dist/`, `build/`, `*.min.js`, `*.map`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `*.lock`, and `.env*` files.

---

## Inline Ignore Comments

Directives work in comments across all programming languages:
- `// gitsanity-ignore`: Ignores all findings on the current line.
- `// gitsanity-ignore console-log, debugger`: Ignores only the listed rules on the current line.
- `// gitsanity-ignore-next-line [rules]`: Ignores findings on the following line.
- `// gitsanity-ignore-file`: When placed in the first 10 lines of a file, ignores all findings across the file.

---

## Commands & Quick Fixes

### Commands
- `GitSanity: Create Config File` (`gitsanity.createConfig`): Creates a starter `.gitsanity.json` in the workspace root.
- `GitSanity: Rescan Open Files` (`gitsanity.rescanOpenFiles`): Manually triggers a re-scan of all open files.
- `GitSanity: Move Secret to .env` (`gitsanity.moveSecretToEnv`): Moves the selected diagnostic secret to `.env`.
- `GitSanity: Move All Secrets in This File to .env` (`gitsanity.moveAllSecretsInFile`): Migrates all secrets in the active file in one batch with modal confirmation.
- `GitSanity: Add .env to .gitignore` (`gitsanity.addEnvToGitignore`): Appends `.env` to the repository's `.gitignore`.

### Quick Fixes
- **Remove line**: One-click deletion of `console.log` statements.
- **Move secret to .env**: Available on `secret` and `high-entropy-string` diagnostics for supported languages.
- **Move all N secrets in this file to .env**: Offered when 2 or more secrets are present in the file.
- **Ignore this line**: Appends `gitsanity-ignore <ruleId>` in the document's native comment syntax.
- **Ignore in this file**: Inserts `gitsanity-ignore-file` at the top of the file (preserving any shebang line).

---

## Repository Awareness & Health

GitSanity monitors the active workspace's Git status and provides repository management tools.

### Repository Status & Initialization
- **Detection**: Automatically identifies repository state (`no-git`, `no-repo`, `local-repo`, `remote-repo`).
- **Initialization**: `GitSanity: Initialize Git Repository` runs `git init -b main` (with fallback to default branch) and generates a tailored `.gitignore` based on detected project files (Node, Python, Java, Go, Rust, .NET, PHP, Ruby).
- **On-Open Prompts**: Offers an initial prompt to initialize Git or run a project scan when opening a folder, with "Don't ask again" persistence.

### Whole-Project Scanning
- **Command**: `GitSanity: Scan Entire Project` (`gitsanity.scanProject`).
- **Features**: Scans all tracked files (using `git ls-files` or recursive directory walk) without opening each file.
- **Diagnostics**: Publishes results to a separate `gitsanity-project` DiagnosticCollection so clearing open-file diagnostics doesn't discard project-level results.
- **Safety**: Automatically ignores binaries (checks first 8000 bytes for null bytes), `.env` files, files exceeding `maxFileSizeMB`, and respects `maxProjectFiles` (default 20,000) with a concurrency pool of 8.

### Repository Health Report (Webview Panel)
- **Command**: `GitSanity: Show Repository Health Report` (`gitsanity.showHealthReport`).
- **Visual Dashboard**: Renders a custom VS Code webview panel styled with VS Code theme variables (`--vscode-*`) and strict CSP nonce security.
- **Health Checks**:
  1. Git initialized status.
  2. Remote origin configured.
  3. Pre-commit hook installed status.
  4. `.env` file presence and whether it is safely ignored in `.gitignore`.
  5. Whole-project issue count and severity breakdown.
- **Interactive Actions**: Includes one-click buttons to initialize Git, install hooks, add `.env` to `.gitignore`, run scans, and launch Safe Commit.

### Git History Secret Scanner
- **Command**: `GitSanity: Scan Git History for Leaked Secrets` (`gitsanity.scanHistory`).
- **Deep Inspection**: Streams `git log -p` commit diffs line-by-line (up to `gitsanity.historyMaxCommits`, default 500) and inspects added lines (`+`) for error-level secrets.
- **Rotation Reminder**: If leaked secrets are discovered in past commits, GitSanity reports the offending commit hash, author, date, and sanitized line, accompanied by a rotation warning (emphasizing that rewriting history or deleting the file in a new commit does not revoke the secret).

---

## Pre-Commit Hook & Safe Commit

GitSanity ensures zero secrets or forgotten debug code escape into Git history.

### Bundled Pre-Commit Hook
- **Installation**: `GitSanity: Install Pre-commit Hook` (`gitsanity.installHook`).
- **Uninstallation**: `GitSanity: Uninstall Pre-commit Hook` (`gitsanity.uninstallHook`).
- **How It Works**:
  - Bundled as a standalone Node.js script via `esbuild` (`out/hook/pre-commit.bundle.js`) with zero runtime dependencies.
  - Installed inside `.git/hooks/pre-commit` wrapped with GitSanity marker tags (`# >>> GitSanity >>>` ... `# <<< GitSanity <<<`), co-existing safely with existing hooks.
  - Uses `git rev-parse --git-path hooks` to support worktrees, submodules, and custom `core.hooksPath`.
- **Index-Based Verification**: Inspects staged content directly from the Git index (`git show :<path>`), guaranteeing that modifications made to the working tree after `git add` cannot bypass the hook.
- **Rules Enforced**:
  - Blocks staged `.env` files (`env-file-staged`).
  - Blocks staged files containing error-severity findings (secrets, conflict markers, debugger statements).
  - Warns on files larger than `largeFileMB` (default 5 MB).
  - Configurable `blockOnWarnings: true` to block commits on warning-level findings (e.g. `console.log`).
  - Graceful fallback: always returns exit code 0 on unexpected runtime errors to avoid locking the user out of Git.

### Safe Commit Flow
- **Command**: `GitSanity: Safe Commit` (`gitsanity.safeCommit`).
- **Pre-Flight Validation**: Runs full scanner checks on all staged files before invoking Git.
- **Branch Protection**: Prompts for explicit confirmation if committing directly to protected branches (`main` or `master`).
- **Auto Commit Message**: Suggests Conventional Commits messages (e.g. `feat(scanner): ...`, `fix(env): ...`, `docs: ...`, `chore: ...`) derived from staged file paths and changes, capped at 72 characters.
- **Push & Undo Prompt**: After a successful commit, offers a one-click **Push** action or an **Undo Commit** option.

### Safe Undo Commit
- **Command**: `GitSanity: Undo Last Commit` (`gitsanity.undoCommit`).
- **Safety Guards**: Executes `git reset --soft HEAD~1`, preserving all working tree and index changes.
- **Protection**: Verifies the commit has not already been pushed to the remote, prevents undoing the repository's initial root commit, and warns on merge commits.

---

## GitHub Publishing

- **Command**: `GitSanity: Publish to GitHub` (`gitsanity.publishToGitHub`).
- **Secure Remote Creation**: Creates a private or public GitHub repository via GitHub REST API using Node's native `https` module (zero external dependencies).
- **Authentication**: Accepts a GitHub Personal Access Token (PAT) with `repo` scope.
- **Token Redaction**: Tokens and remote URLs are strictly redacted across all output channels, error messages, and logs.
- **Automatic Setup**: Sets `origin` remote, renames the local branch to `main`, and runs `git push -u origin <branch>` with confirmation.

---

## Configuration Reference

### `.gitsanity.json` File Schema

```json
{
  "$schema": "./schemas/gitsanity.schema.json",
  "rules": {
    "console-log": "warn",
    "debugger": "error",
    "conflict-marker": "error",
    "secret": "error",
    "high-entropy-string": "warn"
  },
  "ignorePaths": [
    "tests/",
    "scripts/",
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
  "blockOnWarnings": false
}
```

### VS Code Settings (`settings.json`)

- `gitsanity.promptOnOpen`: Prompt to initialize Git or scan project on folder open (default: `true`).
- `gitsanity.warnOnMainBranch`: Warn when committing directly to `main` or `master` (default: `true`).
- `gitsanity.historyMaxCommits`: Limit number of commits scanned in history (default: `500`).

---

## Command Reference

| Command ID | Title | Description |
|---|---|---|
| `gitsanity.menu` | `GitSanity: Menu` | Opens QuickPick menu of GitSanity actions |
| `gitsanity.createConfig` | `GitSanity: Create Config File` | Creates `.gitsanity.json` in workspace root |
| `gitsanity.rescanOpenFiles` | `GitSanity: Rescan Open Files` | Manually re-scans all open editors |
| `gitsanity.scanProject` | `GitSanity: Scan Entire Project` | Scans entire repository into `gitsanity-project` |
| `gitsanity.showHealthReport` | `GitSanity: Show Repository Health Report` | Opens the interactive Health Report webview |
| `gitsanity.scanHistory` | `GitSanity: Scan Git History for Leaked Secrets` | Inspects commit history for committed secrets |
| `gitsanity.installHook` | `GitSanity: Install Pre-commit Hook` | Installs the index-checking pre-commit hook |
| `gitsanity.uninstallHook` | `GitSanity: Uninstall Pre-commit Hook` | Removes the GitSanity hook block |
| `gitsanity.safeCommit` | `GitSanity: Safe Commit` | Pre-flight index check, branch check, commit & push |
| `gitsanity.undoCommit` | `GitSanity: Undo Last Commit` | Soft resets `HEAD~1` if not yet pushed |
| `gitsanity.publishToGitHub` | `GitSanity: Publish to GitHub` | Creates remote repo via GitHub API and pushes |
| `gitsanity.createRepository` | `GitSanity: Initialize Git Repository` | Inits Git repository and generates `.gitignore` |
| `gitsanity.moveSecretToEnv` | `GitSanity: Move Secret to .env` | Quick fix migration for single secret |
| `gitsanity.moveAllSecretsInFile` | `GitSanity: Move All Secrets in This File to .env` | Batch migration for all secrets in file |
| `gitsanity.addEnvToGitignore` | `GitSanity: Add .env to .gitignore` | Appends `.env` to `.gitignore` |

---

1. Install dependencies:
   ```bash
   npm install
   ```
2. Compile and run test suite:
   ```bash
   npm test
   ```
3. Press `F5` to start the Extension Development Host window.
4. Open `samples/test.js` or `samples/test.py` to test diagnostics, quick fixes, and `.env` automation.
