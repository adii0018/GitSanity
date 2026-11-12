"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnvAccessExpression = getEnvAccessExpression;
/**
 * Returns language-specific code expression, import requirements, and hints for accessing an env variable.
 * Returns undefined for unsupported languages.
 */
function getEnvAccessExpression(languageId, varName) {
    switch (languageId) {
        case 'javascript':
        case 'javascriptreact':
        case 'typescript':
        case 'typescriptreact':
            return {
                expression: `process.env.${varName}`,
                hint: "Load .env at startup, e.g. with the dotenv package or your framework's env support."
            };
        case 'python':
            return {
                expression: `os.environ["${varName}"]`,
                importLine: 'import os'
            };
        case 'ruby':
            return {
                expression: `ENV["${varName}"]`
            };
        case 'php':
            return {
                expression: `getenv('${varName}')`
            };
        case 'go':
            return {
                expression: `os.Getenv("${varName}")`,
                hint: 'Make sure the "os" package is imported.'
            };
        case 'java':
            return {
                expression: `System.getenv("${varName}")`
            };
        case 'csharp':
            return {
                expression: `Environment.GetEnvironmentVariable("${varName}")`
            };
        case 'shellscript':
            return {
                expression: `\${${varName}}`,
                hint: 'Source your .env file before running this script.'
            };
        default:
            return undefined;
    }
}
//# sourceMappingURL=envAccess.js.map