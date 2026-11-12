"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.KNOWN_RULE_IDS = void 0;
exports.parseConfig = parseConfig;
exports.KNOWN_RULE_IDS = [
    'console-log',
    'debugger', // gitsanity-ignore debugger
    'conflict-marker',
    'secret',
    'high-entropy-string',
    'old-todo'
];
exports.DEFAULT_CONFIG = {
    rules: {
        'console-log': 'warn',
        'debugger': 'error', // gitsanity-ignore debugger
        'conflict-marker': 'error',
        'secret': 'error',
        'high-entropy-string': 'warn',
        'old-todo': 'off'
    },
    ignorePaths: [],
    maxFileSizeMB: 1,
    entropyThreshold: 4.5,
    entropyMinLength: 20,
    envFile: '.env',
    envExampleFile: '.env.example',
    createEnvExample: true,
    largeFileMB: 5,
    maxProjectFiles: 20000,
    blockOnWarnings: false,
    todoMaxAgeDays: 90
};
function isValidRelativePath(p) {
    if (typeof p !== 'string') {
        return false;
    }
    const s = p.trim();
    if (!s) {
        return false;
    }
    if (s.includes('..')) {
        return false;
    }
    if (s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:/.test(s)) {
        return false;
    }
    return true;
}
function parseConfig(jsonText) {
    const errors = [];
    // Clone defaults so we never mutate DEFAULT_CONFIG
    const config = {
        rules: { ...exports.DEFAULT_CONFIG.rules },
        ignorePaths: [...exports.DEFAULT_CONFIG.ignorePaths],
        maxFileSizeMB: exports.DEFAULT_CONFIG.maxFileSizeMB,
        entropyThreshold: exports.DEFAULT_CONFIG.entropyThreshold,
        entropyMinLength: exports.DEFAULT_CONFIG.entropyMinLength,
        envFile: exports.DEFAULT_CONFIG.envFile,
        envExampleFile: exports.DEFAULT_CONFIG.envExampleFile,
        createEnvExample: exports.DEFAULT_CONFIG.createEnvExample,
        largeFileMB: exports.DEFAULT_CONFIG.largeFileMB,
        maxProjectFiles: exports.DEFAULT_CONFIG.maxProjectFiles,
        blockOnWarnings: exports.DEFAULT_CONFIG.blockOnWarnings,
        todoMaxAgeDays: exports.DEFAULT_CONFIG.todoMaxAgeDays
    };
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch (err) {
        errors.push(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        return { config, errors };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        errors.push('Configuration root must be a JSON object.');
        return { config, errors };
    }
    const raw = parsed;
    // 1. Validate 'rules'
    if ('rules' in raw) {
        if (typeof raw.rules !== 'object' || raw.rules === null || Array.isArray(raw.rules)) {
            errors.push('Property "rules" must be an object.');
        }
        else {
            const rawRules = raw.rules;
            for (const [key, value] of Object.entries(rawRules)) {
                if (!exports.KNOWN_RULE_IDS.includes(key)) {
                    errors.push(`Unknown rule "${key}" in rules configuration.`);
                    continue;
                }
                if (value !== 'off' && value !== 'warn' && value !== 'error') {
                    errors.push(`Invalid severity "${String(value)}" for rule "${key}". Must be "off", "warn", or "error".`);
                    continue;
                }
                config.rules[key] = value;
            }
        }
    }
    // 2. Validate 'ignorePaths'
    if ('ignorePaths' in raw) {
        if (!Array.isArray(raw.ignorePaths)) {
            errors.push('Property "ignorePaths" must be an array of strings.');
        }
        else {
            const validPaths = [];
            for (let i = 0; i < raw.ignorePaths.length; i++) {
                const item = raw.ignorePaths[i];
                if (typeof item !== 'string') {
                    errors.push(`Item at ignorePaths[${i}] must be a string.`);
                }
                else if (item.trim().length > 0) {
                    validPaths.push(item.trim());
                }
            }
            config.ignorePaths = validPaths;
        }
    }
    // 3. Validate 'maxFileSizeMB'
    if ('maxFileSizeMB' in raw) {
        if (typeof raw.maxFileSizeMB !== 'number' || Number.isNaN(raw.maxFileSizeMB) || raw.maxFileSizeMB <= 0) {
            errors.push('Property "maxFileSizeMB" must be a positive number.');
        }
        else {
            config.maxFileSizeMB = raw.maxFileSizeMB;
        }
    }
    // 4. Validate 'entropyThreshold'
    if ('entropyThreshold' in raw) {
        if (typeof raw.entropyThreshold !== 'number' || Number.isNaN(raw.entropyThreshold) || raw.entropyThreshold < 0) {
            errors.push('Property "entropyThreshold" must be a non-negative number.');
        }
        else {
            config.entropyThreshold = raw.entropyThreshold;
        }
    }
    // 5. Validate 'entropyMinLength'
    if ('entropyMinLength' in raw) {
        if (typeof raw.entropyMinLength !== 'number' ||
            !Number.isInteger(raw.entropyMinLength) ||
            raw.entropyMinLength < 1) {
            errors.push('Property "entropyMinLength" must be a positive integer.');
        }
        else {
            config.entropyMinLength = raw.entropyMinLength;
        }
    }
    // 6. Validate 'envFile'
    if ('envFile' in raw) {
        if (!isValidRelativePath(raw.envFile)) {
            errors.push('Property "envFile" must be a relative path within the workspace and cannot contain "..".');
        }
        else {
            config.envFile = raw.envFile.trim();
        }
    }
    // 7. Validate 'envExampleFile'
    if ('envExampleFile' in raw) {
        if (!isValidRelativePath(raw.envExampleFile)) {
            errors.push('Property "envExampleFile" must be a relative path within the workspace and cannot contain "..".');
        }
        else {
            config.envExampleFile = raw.envExampleFile.trim();
        }
    }
    // 8. Validate 'createEnvExample'
    if ('createEnvExample' in raw) {
        if (typeof raw.createEnvExample !== 'boolean') {
            errors.push('Property "createEnvExample" must be a boolean.');
        }
        else {
            config.createEnvExample = raw.createEnvExample;
        }
    }
    // 9. Validate 'largeFileMB'
    if ('largeFileMB' in raw) {
        if (typeof raw.largeFileMB !== 'number' || Number.isNaN(raw.largeFileMB) || raw.largeFileMB <= 0) {
            errors.push('Property "largeFileMB" must be a positive number.');
        }
        else {
            config.largeFileMB = raw.largeFileMB;
        }
    }
    // 10. Validate 'maxProjectFiles'
    if ('maxProjectFiles' in raw) {
        if (typeof raw.maxProjectFiles !== 'number' ||
            !Number.isInteger(raw.maxProjectFiles) ||
            raw.maxProjectFiles < 1) {
            errors.push('Property "maxProjectFiles" must be a positive integer.');
        }
        else {
            config.maxProjectFiles = raw.maxProjectFiles;
        }
    }
    // 11. Validate 'blockOnWarnings'
    if ('blockOnWarnings' in raw) {
        if (typeof raw.blockOnWarnings !== 'boolean') {
            errors.push('Property "blockOnWarnings" must be a boolean.');
        }
        else {
            config.blockOnWarnings = raw.blockOnWarnings;
        }
    }
    // 12. Validate 'todoMaxAgeDays'
    if ('todoMaxAgeDays' in raw) {
        if (typeof raw.todoMaxAgeDays !== 'number' || Number.isNaN(raw.todoMaxAgeDays) || raw.todoMaxAgeDays < 1) {
            errors.push('Property "todoMaxAgeDays" must be a number >= 1.');
        }
        else {
            config.todoMaxAgeDays = raw.todoMaxAgeDays;
        }
    }
    return { config, errors };
}
//# sourceMappingURL=configSchema.js.map