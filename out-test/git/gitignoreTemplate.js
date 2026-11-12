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
exports.STACK_ENTRIES = void 0;
exports.buildGitignore = buildGitignore;
exports.detectStacks = detectStacks;
const fs = __importStar(require("fs"));
exports.STACK_ENTRIES = {
    node: ['node_modules/', 'dist/', 'build/'],
    python: ['__pycache__/', '*.pyc', '.venv/', 'env/'],
    java: ['target/', 'build/', '*.class', '.gradle/'],
    go: ['bin/'],
    rust: ['target/'],
    dotnet: ['bin/', 'obj/'],
    php: ['vendor/'],
    ruby: ['vendor/bundle/', '.bundle/']
};
/**
 * Builds a starter .gitignore content tailored to detected technology stacks.
 * Pure logic with zero VS Code dependencies.
 */
function buildGitignore(detectedStacks) {
    const lines = [
        '# Environment variables',
        '.env',
        '.env.*',
        '!.env.example',
        '!.env.sample',
        '',
        '# Operating System files',
        '.DS_Store',
        'Thumbs.db',
        '',
        '# Editor files',
        '.idea/',
        '*.swp',
        '',
        '# Log files',
        '*.log'
    ];
    const addedStacks = new Set();
    for (const stack of detectedStacks) {
        const key = stack.toLowerCase();
        if (exports.STACK_ENTRIES[key] && !addedStacks.has(key)) {
            addedStacks.add(key);
            lines.push('');
            lines.push(`# ${stack.toUpperCase()}`);
            lines.push(...exports.STACK_ENTRIES[key]);
        }
    }
    lines.push('');
    return lines.join('\n');
}
/**
 * Inspects a folder root to detect project technology stacks.
 */
async function detectStacks(folderPath) {
    const stacks = [];
    try {
        const entries = await fs.promises.readdir(folderPath);
        if (entries.includes('package.json')) {
            stacks.push('node');
        }
        if (entries.includes('requirements.txt') || entries.includes('pyproject.toml')) {
            stacks.push('python');
        }
        if (entries.includes('pom.xml') || entries.includes('build.gradle')) {
            stacks.push('java');
        }
        if (entries.includes('go.mod')) {
            stacks.push('go');
        }
        if (entries.includes('Cargo.toml')) {
            stacks.push('rust');
        }
        if (entries.some((e) => e.endsWith('.csproj') || e.endsWith('.sln'))) {
            stacks.push('dotnet');
        }
        if (entries.includes('composer.json')) {
            stacks.push('php');
        }
        if (entries.includes('Gemfile')) {
            stacks.push('ruby');
        }
    }
    catch { }
    return stacks;
}
//# sourceMappingURL=gitignoreTemplate.js.map