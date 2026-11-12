# GitSanity Architecture & Technical Specification

GitSanity is designed from the ground up as a zero-runtime-dependency, local-first security and hygiene extension for Visual Studio Code and Git CLI workflows.

---

## 1. Core Principles

1. **Pure Core Logic**: Core scanning, AST/text heuristics, Git operations, and statistical calculations reside in pure modules with **zero** `vscode` dependencies (`src/scanner/`, `src/git/`, `src/hook/`, `src/env/`, `src/stats/`, `src/todo/`).
2. **Double Shield Protection**:
   - **Editor Shield**: Live diagnostics as you type and an interactive pre-commit review panel.
   - **CLI Shield**: A standalone bundled pre-commit hook that directly checks staged Git index trees (`git show :<path>`).
3. **No Telemetry & Strict Privacy**: Zero network calls (except user-initiated GitHub repo creation via native Node `https`). All logs and stats are stored strictly inside the local `.git` directory (`<git-common-dir>/gitsanity/events.jsonl`) and contain only numerical counts and rule IDs—never file contents, secret values, or credentials.
4. **Resilience & Fallbacks**: Hooks and git scanners must never corrupt or lock a developer out of Git. Internal failures fail open (exit code 0).
5. **Workspace Trust**: In untrusted workspaces, all Git executions, hook modifications, and GitHub integrations are automatically disabled (`capabilities.untrustedWorkspaces: { supported: "limited" }`). In-editor file scanning remains functional.

---

## 2. Component Architecture

```
+-----------------------------------------------------------------------------------+
|                               Visual Studio Code Host                             |
|                                                                                   |
|   +---------------------+   +---------------------+   +-----------------------+   |
|   | DiagnosticsManager  |   | CodeActionProvider  |   |  ReviewPanel /        |   |
|   | (live editor scan)  |   | (Move to .env fix)  |   |  Dashboard Webviews   |   |
|   +----------+----------+   +----------+----------+   +-----------+-----------+   |
|              |                         |                          |               |
|              |                         |                          |               |
+--------------|-------------------------|--------------------------|---------------+
               |                         |                          |
               v                         v                          v
+-----------------------------------------------------------------------------------+
|                        GitSanity Pure Logic Modules                               |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |    src/scanner     |  |      src/env       |  |          src/git            |  |
|  | - Rules & Shannon  |  | - Parser/Writer    |  | - GitRunner & Detectors     |  |
|  |   Entropy Engine   |  | - Language syntax  |  | - History & Index Streamers |  |
|  | - ProjectScanner   |  | - .gitignore guard |  | - Hook Installer / Text    |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |     src/stats      |  |      src/todo      |  |          src/hook           |  |
|  | - Event Log rotater|  | - TodoFinder       |  | - PrecommitCore             |  |
|  | - Streaks & Trends |  | - Blame porcelain  |  | - Bundled Hook CLI script   |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
+-----------------------------------------------------------------------------------+
                                         ^
                                         |
                       +-----------------+-----------------+
                       |                                   |
           +-----------+-----------+           +-----------+-----------+
           | .git/hooks/pre-commit |           |  Git CLI / Developer  |
           | (bundled standalone)  |           |   Terminal commits    |
           +-----------------------+           +-----------------------+
```

---

## 3. Module Breakdown

### `src/scanner/`
- **`rules.ts`**: Pure rules detecting AWS access keys, generic secret/token assignments, hex secrets, merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), debugger breakpoints, and `console.log`.
- **`entropy.ts`**: Shannon entropy calculation ($-\sum p \log_2 p$) for detecting high-entropy random keys inside quoted literals. Automatically excludes UUIDs, URLs, and camelCase identifiers.
- **`scanner.ts`**: Line-by-line scanner that handles inline directives (`gitsanity-ignore`, `gitsanity-ignore-next-line`, `gitsanity-ignore-file`) and metadata extraction.
- **`projectScanner.ts`**: Fast whole-project scanner utilizing `git ls-files` with a concurrency worker pool of 8. Binary files are detected via null byte detection in the first 8000 bytes.

### `src/env/`
- **`envName.ts`**: Converts camelCase, kebab-case, and snake_case variable names to `UPPER_SNAKE_CASE`.
- **`envFile.ts`**: Preserves `.env` comments, whitespace, and formatting while safely appending or updating variables. Avoids collisions by suffixing existing keys (`_2`, `_3`).
- **`envAccess.ts`**: Multi-language generator producing native environment lookup expressions for JavaScript, TypeScript, Python, Ruby, PHP, Go, Java, C#, and Shell.

### `src/git/`
- **`gitRunner.ts`**: Executes Git using `child_process.execFile` and streaming `spawnGitLines` with `AbortSignal` cancellation support.
- **`redact.ts`**: Sanitizes logs and messages, masking GitHub tokens (`ghp_*`, `gho_*`, `github_pat_*`), URL-embedded passwords, and raw secrets.
- **`repoDetector.ts`**: Evaluates workspace repository status (`no-git`, `no-repo`, `local-repo`, `remote-repo`).
- **`stagedFiles.ts`**: Reads staged changes directly from the Git index (`git show :<path>`) rather than disk.
- **`commitMessage.ts`**: Derives Conventional Commits messages from staged paths and changes.
- **`hookInstaller.ts`**: Installs or removes GitSanity hook blocks safely into `.git/hooks/pre-commit`.
- **`historyScanner.ts`**: Streams `git log -p` diffs to detect committed secrets in past commits without exposing secret strings.

### `src/hook/`
- **`precommitCore.ts`**: Pure execution engine for pre-commit checks. Rejects staged `.env` files and error-level issues; warns on large files.
- **`preCommit.ts`**: Entry point bundled via `esbuild` into `out/hook/pre-commit.bundle.js` for standalone execution in CLI Git hooks.

### `src/stats/`
- **`eventLog.ts`**: Maintains append-only JSONL event history inside `<git-common-dir>/gitsanity/events.jsonl`. Automatically rotates at 512 KB, retaining the last 2000 events.
- **`stats.ts`**: Computes clean commit streaks, weekly trends over the last 8 weeks, top mistakes, and milestones (7, 30, 100 clean commits).

### `src/todo/`
- **`todoFinder.ts`**: Matches `TODO`, `FIXME`, `HACK`, `XXX` inside comments across multiple languages.
- **`blame.ts`**: Parses `git blame --line-porcelain` to extract author timestamps while skipping uncommitted lines.
- **`todoAge.ts`**: Computes age in days with batched line range arguments (`-L`).

### `src/ui/`
- **`healthReport.ts`**: Webview panel providing repository health and security hygiene analysis.
- **`reviewPanel.ts`**: Interactive staged review panel with human checklists and commit guards.
- **`dashboard.ts`**: Visual dashboard rendering streak metrics, SVG trend charts, and milestones.
- **`htmlEscape.ts`**: Security utility escaping HTML characters against XSS in webviews.

---

## 4. Build, Packaging & Performance

- **Extension Bundle**: Bundled into a single minified file `out/extension.js` via `esbuild`.
- **Hook Bundle**: Bundled into `out/hook/pre-commit.bundle.js` via `esbuild`.
- **Fast Activation**: Heavy modules (webviews, GitHub publisher, history scanner) are dynamically imported on demand.
- **Type Checking**: Clean separation of `tsc --noEmit` for type checking and `tsconfig.test.json` for running the integration test suite.
