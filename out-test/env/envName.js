"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toEnvVarName = toEnvVarName;
/**
 * Converts camelCase, kebab-case, dotted, and snake_case identifiers to UPPER_SNAKE_CASE.
 * Strips characters that are invalid in env var names, ensures it does not start with a digit,
 * and falls back to "SECRET_<fallbackIndex>" when keyName is missing, empty, or reduced to empty.
 */
function toEnvVarName(keyName, fallbackIndex) {
    if (!keyName || typeof keyName !== 'string') {
        return `SECRET_${fallbackIndex}`;
    }
    let s = keyName.trim();
    if (!s) {
        return `SECRET_${fallbackIndex}`;
    }
    // 1. Separate camelCase words: fooBar -> foo_Bar, ABCDef -> ABC_Def
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
    s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
    // 2. Replace non-alphanumeric characters (hyphens, dots, spaces) with underscores
    s = s.replace(/[^a-zA-Z0-9_]+/g, '_');
    // 3. Uppercase
    s = s.toUpperCase();
    // 4. Collapse consecutive underscores and trim boundary underscores
    s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    // 5. Ensure it does not start with a digit (strip leading digits/underscores)
    s = s.replace(/^[0-9]+_*/, '');
    // 6. Fallback if empty after stripping
    if (!s) {
        return `SECRET_${fallbackIndex}`;
    }
    return s;
}
//# sourceMappingURL=envName.js.map