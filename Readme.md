# GitSanity

**Scan, secure and commit safely.**

GitSanity is a VS Code extension that catches mistakes **before** they reach your Git history: leaked secrets, forgotten `console.log`, stray `debugger`, and merge conflict markers.

## Features (Phase 1)

- **Real-Time Scanning**: Instantly scans files when opened, saved, or edited (with a 300ms debounce).
- **Zero Runtime Dependencies**: Scanner logic is pure TypeScript with no VS Code imports for cross-tool reuse.
- **Rules Enforced**:
  - `console-log` (Warning): Identifies `console.log(...)` calls.
  - `debugger` (Error): Identifies `debugger;` statements.
  - `conflict-marker` (Error): Flags Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
  - `secret` (Error): Detects hardcoded secrets, including AWS Access Keys (`AKIA...`), generic credential assignments (`api_key`, `secret`, `token`, `password`), and 32+ character hex strings in secret assignments while ignoring bare Git commit hashes.
- **Quick Fix**: One-click action on `console.log` warnings to remove the entire line.
- **Status Bar Indicator**: Live counter in the left status bar showing overall health (`$(shield) GitSanity: Active` or `$(warning) GitSanity: N issues`).

## Development & Testing

1. Open this folder in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension:
   ```bash
   npm run compile
   ```
4. Press `F5` to open the Extension Development Host window.
5. In the new window, open `samples/test.js` to inspect findings, problems panel underlines, quick fix, and status bar status.
