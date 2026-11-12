export type TodoTag = 'TODO' | 'FIXME' | 'HACK' | 'XXX';

export interface TodoFinding {
  line: number; // 0-based
  tag: TodoTag;
  startCol: number; // 0-based
  endCol: number;
}

/**
 * Finds TODO, FIXME, HACK, XXX tags inside comment-like text across multiple languages.
 * Tags inside plain string literals or identifiers (e.g. todoList) do not match.
 */
export function findTodoLines(text: string): TodoFinding[] {
  const findings: TodoFinding[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const commentStart = findCommentStartIndex(line);
    if (commentStart < 0) {
      continue;
    }

    const commentText = line.substring(commentStart);
    const tagRegex = /\b(TODO|FIXME|HACK|XXX)\b/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(commentText)) !== null) {
      const tag = match[1] as TodoTag;
      const startCol = commentStart + match.index;
      const endCol = startCol + tag.length;

      findings.push({
        line: lineIdx,
        tag,
        startCol,
        endCol
      });
    }
  }

  return findings;
}

/**
 * Returns the column index where a comment starts on the line, or -1 if no comment.
 * Ignores comment markers that appear inside string literals.
 */
function findCommentStartIndex(line: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  const trimmed = line.trim();
  // Check block comment continuation line (e.g. " * TODO")
  if (trimmed.startsWith('*')) {
    const firstNonSpace = line.indexOf('*');
    // Ensure it's not a multiplication or dereference (usually at start of indented line in docblock)
    const afterStar = line.substring(firstNonSpace + 1);
    if (/^\s/.test(afterStar) || afterStar.length === 0) {
      return firstNonSpace;
    }
  }

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const nextCh = i + 1 < line.length ? line[i + 1] : '';

    // Handle escapes inside quotes
    if (ch === '\\' && (inSingleQuote || inDoubleQuote || inBacktick)) {
      i++; // skip next char
      continue;
    }

    if (!inDoubleQuote && !inBacktick && ch === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && !inBacktick && ch === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    // When outside strings, test for comment markers
    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      // HTML comment <!--
      if (ch === '<' && line.startsWith('<!--', i)) {
        return i;
      }
      // Single line // or block /*
      if (ch === '/' && (nextCh === '/' || nextCh === '*')) {
        return i;
      }
      // SQL / Haskell comment --
      if (ch === '-' && nextCh === '-') {
        return i;
      }
      // Shell / Python / Ruby comment #
      if (ch === '#') {
        return i;
      }
      // ASM / INI comment ;
      if (ch === ';') {
        // If it's a semicolon followed by space or tag, or not followed by valid code tokens
        return i;
      }
      // LaTeX / Erlang comment %
      if (ch === '%') {
        return i;
      }
    }
  }

  return -1;
}
