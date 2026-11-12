export type RuleId =
  | 'console-log'
  | 'debugger'
  | 'conflict-marker'
  | 'secret'
  | 'high-entropy-string'
  | 'old-todo';

export type RuleSeverity = 'off' | 'warn' | 'error';

export interface GitSanityConfig {
  rules: Partial<Record<RuleId, RuleSeverity>>;
  ignorePaths: string[];
  maxFileSizeMB: number;
  entropyThreshold: number;
  entropyMinLength: number;
  envFile: string;
  envExampleFile: string;
  createEnvExample: boolean;
  largeFileMB: number;
  maxProjectFiles: number;
  blockOnWarnings: boolean;
  todoMaxAgeDays: number;
}

export const KNOWN_RULE_IDS: readonly RuleId[] = [
  'console-log',
  'debugger',
  'conflict-marker',
  'secret',
  'high-entropy-string',
  'old-todo'
] as const;

export const DEFAULT_CONFIG: GitSanityConfig = {
  rules: {
    'console-log': 'warn',
    'debugger': 'error',
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

function isValidRelativePath(p: unknown): boolean {
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

export function parseConfig(jsonText: string): { config: GitSanityConfig; errors: string[] } {
  const errors: string[] = [];

  // Clone defaults so we never mutate DEFAULT_CONFIG
  const config: GitSanityConfig = {
    rules: { ...DEFAULT_CONFIG.rules },
    ignorePaths: [...DEFAULT_CONFIG.ignorePaths],
    maxFileSizeMB: DEFAULT_CONFIG.maxFileSizeMB,
    entropyThreshold: DEFAULT_CONFIG.entropyThreshold,
    entropyMinLength: DEFAULT_CONFIG.entropyMinLength,
    envFile: DEFAULT_CONFIG.envFile,
    envExampleFile: DEFAULT_CONFIG.envExampleFile,
    createEnvExample: DEFAULT_CONFIG.createEnvExample,
    largeFileMB: DEFAULT_CONFIG.largeFileMB,
    maxProjectFiles: DEFAULT_CONFIG.maxProjectFiles,
    blockOnWarnings: DEFAULT_CONFIG.blockOnWarnings
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    errors.push(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return { config, errors };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('Configuration root must be a JSON object.');
    return { config, errors };
  }

  const raw = parsed as Record<string, unknown>;

  // 1. Validate 'rules'
  if ('rules' in raw) {
    if (typeof raw.rules !== 'object' || raw.rules === null || Array.isArray(raw.rules)) {
      errors.push('Property "rules" must be an object.');
    } else {
      const rawRules = raw.rules as Record<string, unknown>;
      for (const [key, value] of Object.entries(rawRules)) {
        if (!KNOWN_RULE_IDS.includes(key as RuleId)) {
          errors.push(`Unknown rule "${key}" in rules configuration.`);
          continue;
        }

        if (value !== 'off' && value !== 'warn' && value !== 'error') {
          errors.push(
            `Invalid severity "${String(value)}" for rule "${key}". Must be "off", "warn", or "error".`
          );
          continue;
        }

        config.rules[key as RuleId] = value;
      }
    }
  }

  // 2. Validate 'ignorePaths'
  if ('ignorePaths' in raw) {
    if (!Array.isArray(raw.ignorePaths)) {
      errors.push('Property "ignorePaths" must be an array of strings.');
    } else {
      const validPaths: string[] = [];
      for (let i = 0; i < raw.ignorePaths.length; i++) {
        const item = raw.ignorePaths[i];
        if (typeof item !== 'string') {
          errors.push(`Item at ignorePaths[${i}] must be a string.`);
        } else if (item.trim().length > 0) {
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
    } else {
      config.maxFileSizeMB = raw.maxFileSizeMB;
    }
  }

  // 4. Validate 'entropyThreshold'
  if ('entropyThreshold' in raw) {
    if (typeof raw.entropyThreshold !== 'number' || Number.isNaN(raw.entropyThreshold) || raw.entropyThreshold < 0) {
      errors.push('Property "entropyThreshold" must be a non-negative number.');
    } else {
      config.entropyThreshold = raw.entropyThreshold;
    }
  }

  // 5. Validate 'entropyMinLength'
  if ('entropyMinLength' in raw) {
    if (
      typeof raw.entropyMinLength !== 'number' ||
      !Number.isInteger(raw.entropyMinLength) ||
      raw.entropyMinLength < 1
    ) {
      errors.push('Property "entropyMinLength" must be a positive integer.');
    } else {
      config.entropyMinLength = raw.entropyMinLength;
    }
  }

  // 6. Validate 'envFile'
  if ('envFile' in raw) {
    if (!isValidRelativePath(raw.envFile)) {
      errors.push('Property "envFile" must be a relative path within the workspace and cannot contain "..".');
    } else {
      config.envFile = (raw.envFile as string).trim();
    }
  }

  // 7. Validate 'envExampleFile'
  if ('envExampleFile' in raw) {
    if (!isValidRelativePath(raw.envExampleFile)) {
      errors.push('Property "envExampleFile" must be a relative path within the workspace and cannot contain "..".');
    } else {
      config.envExampleFile = (raw.envExampleFile as string).trim();
    }
  }

  // 8. Validate 'createEnvExample'
  if ('createEnvExample' in raw) {
    if (typeof raw.createEnvExample !== 'boolean') {
      errors.push('Property "createEnvExample" must be a boolean.');
    } else {
      config.createEnvExample = raw.createEnvExample;
    }
  }

  // 9. Validate 'largeFileMB'
  if ('largeFileMB' in raw) {
    if (typeof raw.largeFileMB !== 'number' || Number.isNaN(raw.largeFileMB) || raw.largeFileMB <= 0) {
      errors.push('Property "largeFileMB" must be a positive number.');
    } else {
      config.largeFileMB = raw.largeFileMB;
    }
  }

  // 10. Validate 'maxProjectFiles'
  if ('maxProjectFiles' in raw) {
    if (
      typeof raw.maxProjectFiles !== 'number' ||
      !Number.isInteger(raw.maxProjectFiles) ||
      raw.maxProjectFiles < 1
    ) {
      errors.push('Property "maxProjectFiles" must be a positive integer.');
    } else {
      config.maxProjectFiles = raw.maxProjectFiles;
    }
  }

  // 11. Validate 'blockOnWarnings'
  if ('blockOnWarnings' in raw) {
    if (typeof raw.blockOnWarnings !== 'boolean') {
      errors.push('Property "blockOnWarnings" must be a boolean.');
    } else {
      config.blockOnWarnings = raw.blockOnWarnings;
    }
  }

  // 12. Validate 'todoMaxAgeDays'
  if ('todoMaxAgeDays' in raw) {
    if (typeof raw.todoMaxAgeDays !== 'number' || Number.isNaN(raw.todoMaxAgeDays) || raw.todoMaxAgeDays < 1) {
      errors.push('Property "todoMaxAgeDays" must be a number >= 1.');
    } else {
      config.todoMaxAgeDays = raw.todoMaxAgeDays;
    }
  }

  return { config, errors };
}
