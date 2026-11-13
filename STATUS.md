# GitSanity Implementation & Release Status

This document tracks the completeness of every feature across all phases in GitSanity (v0.1.0 Release Candidate).

## Feature Checklist

### Phase 1: Core Scanner & Diagnostics
- [x] Pure TypeScript scanner in `src/scanner/` with zero `vscode` imports (**DONE**)
- [x] Standard rules: `console-log` (warn), `debugger` (error), `conflict-marker` (error), `secret` (error: AWS keys `AKIA...`, generic & hex assignments >=16 chars) (**DONE**)
- [x] Live diagnostics with 300 ms debouncing, skipping non-file schemes and oversized files (**DONE**)
- [x] Quick Fix provider: Remove `console.log` line (**DONE**)
- [x] Status bar item displaying clean / issue counts (**DONE**)

### Phase 2: Configuration & Control
- [x] `.gitsanity.json` configuration schema & parser with non-throwing validation (**DONE**)
- [x] File watcher, multi-root workspace support, JSON schema validation (**DONE**)
- [x] Ignore system: built-in defaults + glob-free `pathMatcher` (**DONE**)
- [x] Inline directives: `gitsanity-ignore`, `gitsanity-ignore <rules>`, `gitsanity-ignore-next-line`, `gitsanity-ignore-file` (**DONE**)
- [x] `high-entropy-string` rule with Shannon entropy (filtering UUIDs, URLs, bare hex hashes, camelCase) (**DONE**)
- [x] Quick Fixes: "Ignore this line" and "Ignore rule in this file" (**DONE**)
- [x] Commands: `GitSanity: Create Config File` and `GitSanity: Rescan Open Files` (**DONE**)

### Phase 3: Smart Auto-Fix ("Move to .env")
- [x] Finding metadata extraction for secrets and high-entropy strings (**DONE**)
- [x] Safe env var naming (`toEnvVarName`), collision handling with numeric suffixes (**DONE**)
- [x] `.env` parsing & upsert preserving EOL (`\n` vs `\r\n`) (**DONE**)
- [x] `.env.example` sync with placeholder generation (**DONE**)
- [x] `.gitignore` detection & automatic entry creation (**DONE**)
- [x] Multi-language environment access replacement (JS/TS, Python with `import os`, Ruby, PHP, Go, Java, C#, shell) (**DONE**)
- [x] Disk-before-code write ordering & secret rotation warning notice (**DONE**)
- [x] `.env` files exempted from diagnostics scan & unignored `.env` watcher warning (**DONE**)

### Phase 4: Repository Awareness, Project/History Scan & GitHub Publish
- [x] Repo detection (`no-repo`, `local-repo`, `remote-repo`, remote URL redaction) (**DONE**)
- [x] On-open prompts for uninitialized folders and scan suggestions (**DONE**)
- [x] `GitSanity: Create Repository` with `git init -b main`, stack-aware `.gitignore`, and scan-gated initial commit (**DONE**)
- [x] Project scan with Git awareness (`ls-files`), binary check, size skips, file cap, cancellable progress (**DONE**)
- [x] History scan streaming `git log -p`, deduplication by hash (raw values never retained), non-destructive (**DONE**)
- [x] Health Report webview with strict CSP, nonces, and theme-adaptive UI (**DONE**)
- [x] `GitSanity: Publish to GitHub` using `vscode.authentication`, repo name validation, scan-gate on public visibility, no stored tokens (**DONE**)

### Phase 5: Git Hook & Safe Commit
- [x] Pure staged-file scanner reading directly from Git index (`git show :path`) (**DONE**)
- [x] Pre-commit hook core and standalone bundled script (`out/hook/pre-commit.bundle.js`) (**DONE**)
- [x] Pre-commit installer preserving existing hooks via `# >>> GitSanity >>>` markers (**DONE**)
- [x] Idempotent install/uninstall, `core.hooksPath` / Husky detection, strict LF endings (**DONE**)
- [x] Fail-safe hook execution (never crashes commit on internal errors) (**DONE**)
- [x] `GitSanity: Safe Commit` command with staged review, main/master branch warning, suggested commit messages, Push & Undo actions (**DONE**)
- [x] `GitSanity: Undo Last Commit` with safety guards for merge commits, remote pushed commits, and initial commits (**DONE**)
- [x] `GitSanity: Show Menu` command and status bar click binding (**DONE**)
- [x] Blocking checks for staged `.env` files and warnings for large staged files (**DONE**)

### Phase 6: Review Panel, Stats, Streak & Old TODOs
- [x] Event log at `<common-dir>/gitsanity/events.jsonl` (counts and rule IDs only, rotated) (**DONE**)
- [x] Clean commit streak tracking, weekly issue metrics, milestone toasts (**DONE**)
- [x] Review Before Commit webview with interactive checklist and extension-side re-validation (**DONE**)
- [x] Dashboard webview with pure inline SVG bar charts and empty state (**DONE**)
- [x] `old-todo` rule utilizing `git blame`, cached against mtime/HEAD, non-blocking while typing (**DONE**)
- [x] `GitSanity: Find Old TODOs` command with interactive pick-to-navigate (**DONE**)
- [x] Activity Bar Side Panel (`gitsanity-sidebar`) with live Status & Safety and Quick Actions tree views (**DONE**)

### Phase 7: Release Polish, Bundling & Packaging
- [x] Esbuild bundler configuration for `out/extension.js` and `out/hook/pre-commit.bundle.js` (**DONE**)
- [x] Lazy loading of commands and webview managers in `src/extension.ts` (**DONE**)
- [x] `package.json` Marketplace metadata (`displayName: "GitSanity"`, `version: "0.1.0"`, `preview: true`, keywords, categories) (**DONE**)
- [x] Workspace Trust declaration (`untrustedWorkspaces: { supported: "limited" }`) (**DONE**)
- [x] MIT LICENSE (2026) and user-facing `CHANGELOG.md` (**DONE**)
- [x] Brand icon `media/icon.png` (128x128 PNG generated without external dependencies) (**DONE**)
- [x] End-user `README.md`, `docs/ARCHITECTURE.md`, `docs/PUBLISHING.md` (**DONE**)
- [x] Packaging configuration `.vscodeignore` excluding tests, maps, samples, scripts (**DONE**)
- [x] Self-scan passing with 0 errors (**DONE**)
- [x] Test suite: 8 suites passing in `npm test` (**DONE**)
