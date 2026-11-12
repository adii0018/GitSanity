import * as fs from 'fs';
import * as path from 'path';

export const STACK_ENTRIES: Record<string, string[]> = {
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
export function buildGitignore(detectedStacks: string[]): string {
  const lines: string[] = [
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

  const addedStacks = new Set<string>();

  for (const stack of detectedStacks) {
    const key = stack.toLowerCase();
    if (STACK_ENTRIES[key] && !addedStacks.has(key)) {
      addedStacks.add(key);
      lines.push('');
      lines.push(`# ${stack.toUpperCase()}`);
      lines.push(...STACK_ENTRIES[key]);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Inspects a folder root to detect project technology stacks.
 */
export async function detectStacks(folderPath: string): Promise<string[]> {
  const stacks: string[] = [];

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
  } catch {}

  return stacks;
}
