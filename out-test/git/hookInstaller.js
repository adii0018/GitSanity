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
exports.resolveGitPaths = resolveGitPaths;
exports.isGitSanityHookInstalled = isGitSanityHookInstalled;
exports.installGitHook = installGitHook;
exports.uninstallGitHook = uninstallGitHook;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitRunner_1 = require("./gitRunner");
const hookText_1 = require("./hookText");
/**
 * Resolves absolute hooks directory and git common directory.
 */
async function resolveGitPaths(repoRoot) {
    const hooksRes = await (0, gitRunner_1.runGit)(['rev-parse', '--git-path', 'hooks'], repoRoot);
    const commonRes = await (0, gitRunner_1.runGit)(['rev-parse', '--git-common-dir'], repoRoot);
    const configRes = await (0, gitRunner_1.runGit)(['config', 'core.hooksPath'], repoRoot);
    const rawHooks = hooksRes.code === 0 && hooksRes.stdout.trim() ? hooksRes.stdout.trim() : '.git/hooks';
    const rawCommon = commonRes.code === 0 && commonRes.stdout.trim() ? commonRes.stdout.trim() : '.git';
    const hooksDir = path.isAbsolute(rawHooks) ? rawHooks : path.resolve(repoRoot, rawHooks);
    const commonDir = path.isAbsolute(rawCommon) ? rawCommon : path.resolve(repoRoot, rawCommon);
    const customHooksPath = configRes.code === 0 && configRes.stdout.trim() ? configRes.stdout.trim() : undefined;
    return { hooksDir, commonDir, customHooksPath };
}
/**
 * Checks whether the GitSanity hook is installed in the given repository.
 */
async function isGitSanityHookInstalled(repoRoot) {
    try {
        const { hooksDir } = await resolveGitPaths(repoRoot);
        const precommitPath = path.join(hooksDir, 'pre-commit');
        if (!fs.existsSync(precommitPath)) {
            return false;
        }
        const content = await fs.promises.readFile(precommitPath, 'utf8');
        return (0, hookText_1.isHookInstalled)(content);
    }
    catch {
        return false;
    }
}
/**
 * Installs the GitSanity pre-commit hook into the given repository.
 */
async function installGitHook(repoRoot, bundleSourcePath) {
    const { hooksDir, commonDir, customHooksPath } = await resolveGitPaths(repoRoot);
    let warning;
    if (customHooksPath) {
        warning = `Custom core.hooksPath is configured (${customHooksPath}).`;
    }
    else if (fs.existsSync(path.join(repoRoot, '.husky'))) {
        warning = 'Husky hooks manager detected in this repository.';
    }
    else if (fs.existsSync(path.join(repoRoot, 'lefthook.yml')) || fs.existsSync(path.join(repoRoot, '.lefthook'))) {
        warning = 'Lefthook manager detected in this repository.';
    }
    // Ensure directories exist
    await fs.promises.mkdir(hooksDir, { recursive: true });
    const gitsanityDir = path.join(commonDir, 'gitsanity');
    await fs.promises.mkdir(gitsanityDir, { recursive: true });
    // Copy bundled hook script
    const targetScriptPath = path.join(gitsanityDir, 'pre-commit.js');
    if (fs.existsSync(bundleSourcePath)) {
        await fs.promises.copyFile(bundleSourcePath, targetScriptPath);
    }
    else {
        return {
            success: false,
            message: `Hook bundle file not found at ${bundleSourcePath}. Run 'npm run build:hook' first.`
        };
    }
    // Update pre-commit hook file
    const precommitPath = path.join(hooksDir, 'pre-commit');
    let existingContent;
    if (fs.existsSync(precommitPath)) {
        existingContent = await fs.promises.readFile(precommitPath, 'utf8');
    }
    try {
        const updatedContent = (0, hookText_1.installHookBlock)(existingContent);
        await fs.promises.writeFile(precommitPath, updatedContent, 'utf8');
        try {
            await fs.promises.chmod(precommitPath, 0o755);
        }
        catch { }
    }
    catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : String(err)
        };
    }
    return {
        success: true,
        warning
    };
}
/**
 * Uninstalls the GitSanity hook from the repository.
 */
async function uninstallGitHook(repoRoot) {
    const { hooksDir, commonDir } = await resolveGitPaths(repoRoot);
    const precommitPath = path.join(hooksDir, 'pre-commit');
    if (!fs.existsSync(precommitPath)) {
        return { success: true, message: 'No pre-commit hook file found.' };
    }
    const existingContent = await fs.promises.readFile(precommitPath, 'utf8');
    const updatedContent = (0, hookText_1.removeHookBlock)(existingContent);
    if (updatedContent === undefined) {
        // Delete the hook file entirely if nothing remains
        try {
            await fs.promises.unlink(precommitPath);
        }
        catch { }
    }
    else {
        await fs.promises.writeFile(precommitPath, updatedContent, 'utf8');
    }
    // Clean up gitsanity/pre-commit.js
    const scriptPath = path.join(commonDir, 'gitsanity', 'pre-commit.js');
    try {
        if (fs.existsSync(scriptPath)) {
            await fs.promises.unlink(scriptPath);
        }
    }
    catch { }
    return { success: true };
}
//# sourceMappingURL=hookInstaller.js.map