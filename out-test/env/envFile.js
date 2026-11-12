"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnv = parseEnv;
exports.upsertEnvEntry = upsertEnvEntry;
exports.ensureExampleEntry = ensureExampleEntry;
/**
 * Parses .env file contents into a Map of key-value pairs and detects the file's EOL style.
 * Ignores comments and blank lines, handles quoted values and 'export ' prefixes.
 */
function parseEnv(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const entries = new Map();
    if (!text) {
        return { entries, eol };
    }
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
        let line = rawLine.trim();
        // Skip empty lines and comment lines
        if (!line || line.startsWith('#')) {
            continue;
        }
        // Support 'export VAR=value'
        if (line.startsWith('export ') && !line.includes('=')) {
            continue;
        }
        if (line.startsWith('export ')) {
            line = line.slice(7).trim();
        }
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) {
            entries.set(line.trim(), '');
            continue;
        }
        const key = line.slice(0, eqIndex).trim();
        let val = line.slice(eqIndex + 1).trim();
        // Handle quoted values
        if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
            (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
            const quote = val[0];
            val = val.slice(1, -1);
            if (quote === '"') {
                val = val
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
            }
        }
        entries.set(key, val);
    }
    return { entries, eol };
}
/**
 * Formats a value for .env, quoting and escaping only when necessary.
 */
function formatEnvValue(value) {
    const needsQuotes = /[ #"'\\\r\n\t]/.test(value) || value.includes('=') || value === '';
    if (!needsQuotes) {
        return value;
    }
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
    return `"${escaped}"`;
}
/**
 * Upserts a key-value entry into .env text:
 * - If identical key and value exist -> "already-present", text unchanged.
 * - If key exists with different value -> renames to KEY_2, KEY_3, etc. -> "renamed".
 * - Otherwise appends on its own line preserving EOL style -> "added".
 */
function upsertEnvEntry(text, name, value) {
    const { entries, eol } = parseEnv(text);
    let finalName = name;
    let status = 'added';
    if (entries.has(name)) {
        if (entries.get(name) === value) {
            return { text, finalName: name, status: 'already-present' };
        }
        // Name exists with different value; find an available NAME_2, NAME_3, ...
        let suffix = 2;
        let candidate = `${name}_${suffix}`;
        while (entries.has(candidate)) {
            if (entries.get(candidate) === value) {
                return { text, finalName: candidate, status: 'already-present' };
            }
            suffix++;
            candidate = `${name}_${suffix}`;
        }
        finalName = candidate;
        status = 'renamed';
    }
    const formattedVal = formatEnvValue(value);
    const lineToAdd = `${finalName}=${formattedVal}`;
    let newText;
    if (!text || text.length === 0) {
        newText = `${lineToAdd}${eol}`;
    }
    else {
        const hasTrailingNewline = text.endsWith('\n');
        newText = hasTrailingNewline ? `${text}${lineToAdd}${eol}` : `${text}${eol}${lineToAdd}${eol}`;
    }
    return { text: newText, finalName, status };
}
/**
 * Ensures an entry "NAME=" exists in .env.example with an empty value.
 * Idempotent: does nothing if NAME already exists.
 */
function ensureExampleEntry(text, name) {
    const { entries, eol } = parseEnv(text);
    if (entries.has(name)) {
        return text;
    }
    const lineToAdd = `${name}=`;
    if (!text || text.length === 0) {
        return `${lineToAdd}${eol}`;
    }
    const hasTrailingNewline = text.endsWith('\n');
    return hasTrailingNewline ? `${text}${lineToAdd}${eol}` : `${text}${eol}${lineToAdd}${eol}`;
}
//# sourceMappingURL=envFile.js.map