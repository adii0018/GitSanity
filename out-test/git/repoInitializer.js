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
exports.initRepo = initRepo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitRunner_1 = require("./gitRunner");
const gitignoreTemplate_1 = require("./gitignoreTemplate");
const gitignoreFile_1 = require("../env/gitignoreFile");
/**
 * Initializes a new Git repository in the specified folder with a 'main' branch
 * and generates or updates .gitignore.
 */
async function initRepo(folderPath, envFileName = '.env') {
    // 1. Verify not already a repository root
    const checkRes = await (0, gitRunner_1.runGit)(['rev-parse', '--show-toplevel'], folderPath);
    if (checkRes.code === 0 && checkRes.stdout.trim()) {
        const existingRoot = path.normalize(checkRes.stdout.trim());
        if (existingRoot.toLowerCase() === path.normalize(folderPath).toLowerCase()) {
            return {
                success: false,
                error: 'A Git repository already exists in this folder.',
                createdGitignore: false
            };
        }
    }
    // 2. Run git init -b main (fall back to git init then symbolic-ref for older git)
    let initRes = await (0, gitRunner_1.runGit)(['init', '-b', 'main'], folderPath);
    if (initRes.code !== 0) {
        initRes = await (0, gitRunner_1.runGit)(['init'], folderPath);
        if (initRes.code === 0) {
            await (0, gitRunner_1.runGit)(['symbolic-ref', 'HEAD', 'refs/heads/main'], folderPath);
        }
    }
    if (initRes.code !== 0) {
        return {
            success: false,
            error: initRes.stderr || 'git init failed',
            createdGitignore: false
        };
    }
    // 3. Handle .gitignore
    const gitignorePath = path.join(folderPath, '.gitignore');
    let createdGitignore = false;
    if (fs.existsSync(gitignorePath)) {
        try {
            const existing = await fs.promises.readFile(gitignorePath, 'utf8');
            const updated = (0, gitignoreFile_1.addEnvToGitignore)(existing, envFileName);
            if (updated !== existing) {
                await fs.promises.writeFile(gitignorePath, updated, 'utf8');
            }
        }
        catch { }
    }
    else {
        try {
            const stacks = await (0, gitignoreTemplate_1.detectStacks)(folderPath);
            const content = (0, gitignoreTemplate_1.buildGitignore)(stacks);
            await fs.promises.writeFile(gitignorePath, content, 'utf8');
            createdGitignore = true;
        }
        catch { }
    }
    return {
        success: true,
        createdGitignore
    };
}
//# sourceMappingURL=repoInitializer.js.map