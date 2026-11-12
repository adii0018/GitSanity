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
exports.getEventLogPath = getEventLogPath;
exports.appendEvent = appendEvent;
exports.readEvents = readEvents;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_SIZE_BYTES = 512 * 1024; // 512 KB
const ROTATE_KEEP_LINES = 2000;
/**
 * Returns the absolute path to the event log file inside the git common directory.
 */
function getEventLogPath(commonDir) {
    return path.join(commonDir, 'gitsanity', 'events.jsonl');
}
/**
 * Appends an event to the log file.
 * Creates directories if needed, swallows any errors, and rotates the file
 * if it exceeds 512 KB by retaining only the last 2000 lines.
 */
async function appendEvent(logPath, event) {
    try {
        const dir = path.dirname(logPath);
        await fs.promises.mkdir(dir, { recursive: true });
        const line = JSON.stringify(event) + '\n';
        await fs.promises.appendFile(logPath, line, 'utf8');
        // Check size for rotation
        try {
            const stat = await fs.promises.stat(logPath);
            if (stat.size > MAX_SIZE_BYTES) {
                await rotateLogFile(logPath, ROTATE_KEEP_LINES);
            }
        }
        catch { }
    }
    catch {
        // Swallow any errors - logging must never break or crash callers
    }
}
/**
 * Rotates the log file keeping only the last N lines.
 */
async function rotateLogFile(logPath, keepLines) {
    try {
        const content = await fs.promises.readFile(logPath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length > keepLines) {
            const retained = lines.slice(-keepLines);
            await fs.promises.writeFile(logPath, retained.join('\n') + '\n', 'utf8');
        }
    }
    catch { }
}
/**
 * Reads events from the log file, skipping invalid or corrupt lines silently.
 */
async function readEvents(logPath, opts) {
    try {
        if (!fs.existsSync(logPath)) {
            return [];
        }
        const content = await fs.promises.readFile(logPath, 'utf8');
        const lines = content.split('\n');
        const events = [];
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed)
                continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed &&
                    parsed.v === 1 &&
                    typeof parsed.ts === 'string' &&
                    (parsed.type === 'commit' || parsed.type === 'blocked') &&
                    typeof parsed.filesChecked === 'number' &&
                    typeof parsed.errors === 'number' &&
                    typeof parsed.warnings === 'number' &&
                    typeof parsed.byRule === 'object' &&
                    parsed.byRule !== null) {
                    events.push(parsed);
                }
            }
            catch {
                // Silently skip corrupt lines
            }
        }
        if (opts && typeof opts.limit === 'number' && opts.limit > 0 && events.length > opts.limit) {
            return events.slice(-opts.limit);
        }
        return events;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=eventLog.js.map