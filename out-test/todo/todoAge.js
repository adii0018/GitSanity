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
exports.getTodoAges = getTodoAges;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitRunner_1 = require("../git/gitRunner");
const blame_1 = require("./blame");
/**
 * Computes the age in days of TODO lines in a file by running a single git blame call.
 * lines: array of 0-based line numbers.
 * Returns Map of 0-based line number -> age in days.
 */
async function getTodoAges(root, relPath, lines, now, maxFileSizeMB = 1) {
    const result = new Map();
    if (lines.length === 0) {
        return result;
    }
    // Check file size limit
    try {
        const fullPath = path.join(root, relPath);
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > maxFileSizeMB * 1024 * 1024) {
            return result;
        }
    }
    catch {
        return result;
    }
    // Check if file is tracked by Git
    const normRelPath = relPath.replace(/\\/g, '/');
    const lsRes = await (0, gitRunner_1.runGit)(['ls-files', '--error-unmatch', '--', normRelPath], root);
    if (lsRes.code !== 0) {
        // Untracked file
        return result;
    }
    // Limit to 50 line ranges per blame call
    const targetLines = lines.slice(0, 50);
    const blameArgs = ['blame', '--line-porcelain'];
    for (const line0 of targetLines) {
        const line1 = line0 + 1;
        blameArgs.push('-L', `${line1},${line1}`);
    }
    blameArgs.push('--', normRelPath);
    const blameRes = await (0, gitRunner_1.runGit)(blameArgs, root);
    if (blameRes.code !== 0) {
        return result;
    }
    const blameMap = (0, blame_1.parseBlamePorcelain)(blameRes.stdout);
    for (const line0 of targetLines) {
        const line1 = line0 + 1;
        const info = blameMap.get(line1);
        if (info && info.authorTime > 0) {
            const ageMs = now - info.authorTime * 1000;
            const days = Math.max(0, Math.floor(ageMs / (86400 * 1000)));
            result.set(line0, days);
        }
    }
    return result;
}
//# sourceMappingURL=todoAge.js.map