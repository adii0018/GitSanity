# GitSanity Publishing & Release Guide

This guide outlines the step-by-step process for publishing GitSanity to the Visual Studio Code Marketplace and Open VSX Registry.

---

## 1. Replace Placeholders

Before packaging and publishing, update the following placeholders across the project:

1. **`package.json`**:
   - `"publisher"`: Change `"your-publisher-id"` to your verified VS Code Marketplace publisher identifier.
   - `"repository"`: Replace `"https://github.com/<your-username>/gitsanity"` with your repository URL.
   - `"bugs"`: Replace `"https://github.com/<your-username>/gitsanity/issues"` with your issues URL.
   - `"homepage"`: Replace `"https://github.com/<your-username>/gitsanity#readme"` with your project homepage or repository README URL.
2. **`LICENSE`**:
   - Replace `<Your Name>` with your legal or professional copyright name.

---

## 2. Setting Up Marketplace Accounts

### Step 2.1: Azure DevOps Organization & Personal Access Token (PAT)
1. Navigate to [dev.azure.com](https://dev.azure.com) and sign in with your Microsoft account.
2. In User Settings (gear icon in top right), select **Personal Access Tokens**.
3. Click **+ New Token**:
   - **Name**: `VS Code Marketplace - GitSanity`
   - **Organization**: Select **All accessible organizations**
   - **Scopes**: Select **Custom defined**, scroll to **Marketplace**, and check **Manage**.
   - **Expiration**: Set desired duration (e.g. 90 or 180 days).
4. Copy the generated token immediately and store it securely in your password manager.

### Step 2.2: Create Publisher Profile
1. Go to [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
2. Click **Create publisher**:
   - **ID**: Your publisher ID (must match the `"publisher"` value in `package.json`).
   - **Name**: Display name shown to users.
3. Save the publisher profile.

---

## 3. Pre-Release Verification Checklist

Before publishing, verify the following in a fresh environment:

- [ ] **Typecheck**: `npm run check` reports zero TypeScript errors.
- [ ] **Integration Tests**: `npm test` runs and passes all test suites.
- [ ] **Self-Scan**: `node scripts/selfScan.js` completes with 0 errors.
- [ ] **Clean Profile Test**:
  1. Package the extension: `npx vsce package --allow-missing-repository` (or without flag after updating repository URL).
  2. Install into VS Code:
     ```bash
     code --install-extension gitsanity-0.1.0.vsix
     ```
  3. Verify features in a test workspace:
     - Diagnostics on hardcoded secrets, `console.log`, `debugger;`.
     - Quick fix "Move to .env".
     - Hook installation via `GitSanity: Install Git Hook`.
     - "Review Before Commit" panel and "Show Dashboard".
     - Untrusted workspace behavior: git commands are disabled, live diagnostics remain active.
- [ ] **Cross-Platform Verification**:
  - Test on Windows, macOS, and Linux when feasible to verify path normalization and permissions.

---

## 4. Publishing to VS Code Marketplace

### Step 4.1: Authenticate with `vsce`
Run the login command in your terminal:
```bash
npx vsce login <your-publisher-id>
```
Paste your Personal Access Token when prompted.

### Step 4.2: Build and Publish
To publish the current release:
```bash
npx vsce publish
```
Or to publish from the pre-built `.vsix`:
```bash
npx vsce publish --packagePath gitsanity-0.1.0.vsix
```

---

## 5. Publishing to Open VSX Registry (Optional)

The Open VSX Registry serves alternative IDEs including VSCodium, Gitpod, and Eclipse Theia.

1. Sign up or log in at [open-vsx.org](https://open-vsx.org).
2. Go to your user settings and generate an Access Token.
3. Create a publisher namespace matching your publisher ID.
4. Publish using `ovsx`:
   ```bash
   npx ovsx publish gitsanity-0.1.0.vsix -p <your-open-vsx-token>
   ```

---

## 6. How to Bump Versions for Future Releases

Use standard semver version bumps with `vsce`:

```bash
# Patch release (e.g. 0.1.0 -> 0.1.1)
npx vsce publish patch

# Minor release (e.g. 0.1.0 -> 0.2.0)
npx vsce publish minor

# Major release (e.g. 0.1.0 -> 1.0.0)
npx vsce publish major
```
Ensure you update `CHANGELOG.md` with new features, improvements, and fixes for each version.
