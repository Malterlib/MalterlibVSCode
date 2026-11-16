import * as fs from 'fs';
import * as path from 'path';

// Lays out code fragments, such as the types compilers quote in their messages, with MTool Format. Its format server
// takes the fragments as they are. For an MTool without it, each fragment is wrapped in code that parses, so the formatter
// lays it out as it would in a source file: it joins a statement onto one line and then splits it, outermost break first,
// only where it exceeds max_line_length. These functions are pure, apart from finding the style, so they can be tested
// without an editor.

export interface FragmentLayoutOptions {
  readonly maxColumns: number;
  readonly tabSize: number;
  readonly insertSpaces: boolean;
}

/**
 * How a fragment is wrapped: a type as the argument of a template, a function signature as a declaration and anything
 * else as an expression statement
 */
export type FragmentKind = 'type' | 'signature' | 'expression';

export interface PreparedFragment {
  /** The fragment on one line, with the placeholders */
  readonly text: string;
  readonly kind: FragmentKind;
  /** Identifiers of the same width that stand in for what the formatter can't parse, such as (lambda at File.cpp:1:2) */
  readonly placeholders: readonly { placeholder: string; original: string }[];
}

/**
 * Every wrapper puts the fragment two indentation levels in, so the formatter gets the fragment's width plus two levels,
 * and taking the levels off again leaves lines that fit the width. A wrapper's own text never shares a line with the
 * fragment, so it takes none of the width.
 */
const wrapperLevels = 2;

/** The columns a line takes, with tabs to the next tab stop */
export function measureColumns(line: string, tabSize: number): number {
  let columns = 0;
  for (const character of line)
    columns = character === '\t' ? columns + tabSize - columns % tabSize : columns + 1;
  return columns;
}

export function fitsColumns(text: string, options: FragmentLayoutOptions): boolean {
  return text.split(/\r\n|\r|\n/).every(line => measureColumns(line, options.tabSize) <= options.maxColumns);
}

function indentUnit(options: FragmentLayoutOptions): string {
  return options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
}

/** The settings MTool Format reads from .editorconfig for the formatted source */
export function buildEditorConfig(options: FragmentLayoutOptions): string {
  return [
    'root = true',
    '',
    '[*]',
    'malterlib_format = malterlib',
    `indent_style = ${options.insertSpaces ? 'space' : 'tab'}`,
    `indent_size = ${options.tabSize}`,
    `tab_width = ${options.tabSize}`,
    `max_line_length = ${options.maxColumns + wrapperLevels * options.tabSize}`,
    ''
  ].join('\n');
}

/** A .malterlib-format that takes the naming and layout options of the style that applies where the fragments are from */
export function buildStyleDocument(stylePath: string | undefined): string {
  const lines = ['Version: 1'];
  // Single quoted, which YAML reads without escapes, so Windows paths keep their backslashes
  if (stylePath)
    lines.push(`Extends: '${stylePath.replace(/'/g, '\'\'')}'`);
  return lines.join('\n') + '\n';
}

/**
 * The style MTool Format uses for the files of a directory: the nearest .malterlib-format in the directory or above it,
 * or where there is none, Malterlib/Core/.malterlib-format in the nearest directory above that holds one
 */
export function findStyleDocument(directory: string, exists: (file: string) => boolean = fs.existsSync): string | undefined {
  for (const name of ['.malterlib-format', path.join('Malterlib', 'Core', '.malterlib-format')]) {
    for (let current = path.resolve(directory); ; current = path.dirname(current)) {
      const candidate = path.join(current, name);
      if (exists(candidate))
        return candidate;
      if (path.dirname(current) === current)
        break;
    }
  }
  return undefined;
}

// An operator's name, such as operator< or operator(), whose symbols aren't brackets or operators of the code around it
const operatorName = /\boperator\s*(?:\(\)|\[\]|->\*?|<=>|<<=?|>>=?|(?:new|delete)(?:\s*\[\])?|[-+*/%^&|~!=<>,]+|\w+)/g;

/** Whether ( [ and, with angles, < nest and close */
function bracketsBalance(text: string, angles: boolean): boolean {
  const closers: string[] = [];
  const pairs: Record<string, string> = angles ? { '(': ')', '[': ']', '<': '>' } : { '(': ')', '[': ']' };
  for (const character of text) {
    if (pairs[character])
      closers.push(pairs[character]);
    else if (character === ')' || character === ']' || (angles && character === '>')) {
      if (closers.pop() !== character)
        return false;
    }
  }
  return closers.length === 0;
}

/**
 * Whether the fragment is a type, a function signature or an expression. It only picks the wrapper, so a guess that
 * parses either way, such as a call taken for a constructor's declaration, lays out the same.
 */
export function classifyFragment(text: string): FragmentKind {
  // Operator names and arrows aren't brackets or operators of the fragment
  const analyzed = text
    .replace(operatorName, 'operatorX')
    .replace(/->/g, ' ARROW ');
  const angles = bracketsBalance(analyzed, true);

  // The characters outside brackets, and where the first parenthesis opens
  let depth = 0;
  let topLevel = '';
  let topLevelHead = '';
  let firstParenthesis = -1;
  let firstParenthesisEnd = -1;
  for (let i = 0; i < analyzed.length; ++i) {
    const character = analyzed[i];
    if (character === '(' || character === '[' || (angles && character === '<')) {
      if (depth === 0 && character === '(' && firstParenthesis < 0) {
        firstParenthesis = i;
        topLevelHead = topLevel.trim();
      }
      ++depth;
      continue;
    }
    if (character === ')' || character === ']' || (angles && character === '>')) {
      --depth;
      if (depth === 0 && firstParenthesis >= 0 && firstParenthesisEnd < 0)
        firstParenthesisEnd = i + 1;
      continue;
    }
    if (depth === 0)
      topLevel += character;
  }

  // Operators that a type has none of outside its brackets
  const hasOperators = (part: string) => /ARROW|[=.+\-/%|!?^<>]/.test(part);

  if (firstParenthesis < 0)
    return hasOperators(topLevel) ? 'expression' : 'type';

  const head = analyzed.slice(0, firstParenthesis);
  // void (int), void (*)(int) and (anonymous namespace)::CFoo, which has a placeholder by now
  if (!head.trim() || /[\s)]$/.test(head))
    return hasOperators(topLevel) ? 'expression' : 'type';

  // A function's qualifiers, and its trailing return type, which can hold anything a type can
  const tail = analyzed.slice(firstParenthesisEnd);
  const qualifiers = /^(?:\s*(?:const|volatile|&&|&|noexcept(?:\s*\(.*\))?|override|final|=\s*0|=\s*default|=\s*delete|ARROW.*))*\s*$/;
  // A declaration has a return type, or a qualified name, as a constructor has: void f_Get(), CFoo::CFoo()
  if (!hasOperators(topLevelHead) && qualifiers.test(tail) && /\S\s+\S|::|^~/.test(topLevelHead))
    return 'signature';
  return 'expression';
}

/**
 * The fragment on one line, ready to wrap, or undefined for one the formatter can't take: one that holds what would end
 * the wrapper, such as a ; or a comment, or whose brackets don't nest.
 */
export function prepareFragment(fragment: string): PreparedFragment | undefined {
  let text = fragment.trim();
  // A path, such as the file of 'some/dir/header.h' file not found, isn't code whose slashes divide, nor is one that
  // starts as no code does, at the root, a drive, the home directory or . and .., also with spaces in it
  if (!text || /^[^\s<>()[\]]*[\\/][^\s<>()[\]]*$/.test(text) || /^(?:[\\/]|[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/])/.test(text))
    return undefined;

  // What compilers and debuggers write for unnamed entities isn't C++: (lambda at …), (anonymous namespace), {anonymous},
  // in demangled names 'lambda3', 'unnamed' and $_2, and for types they can't name, <error-type> and <dependent type>.
  // Character literals, such as the (signed char)'\x02' of a template argument, are C++ but don't fit the wrapper. An
  // identifier of the same width keeps the layout's widths. They're replaced before whitespace is collapsed, which
  // would change literals such as '  '.
  const placeholders: { placeholder: string; original: string }[] = [];
  // A character literal is one with its prefix and suffix, L'a', u8'a' and 'a'_tag, while a quote after a digit
  // separates digits: 1'000.
  // Only the compilers' spellings, (lambda at file:1:2), (anonymous namespace) and (unnamed struct at …), not code such
  // as decltype(lambda()). A placeholder that would join a name next to it, as in decltype(x0_), isn't one the layout's
  // names can be told apart from, so such a fragment isn't laid out.
  let joinsName = false;
  text = text.replace(/\((?:lambda at |(?:anonymous|unnamed) (?:namespace|class|struct|union|enum|type)\b)(?:[^()]|\([^()]*\))*\)|\{anonymous\}|<[a-z][\w -]*\btype>|(?<![\w'])(?:u8|[uUL])?'(?:\\(?:x[\da-fA-F]+|[0-7]{1,3}|u[\da-fA-F]{4}|U[\da-fA-F]{8}|.)|[^'\\\n])+'(?:[A-Za-z_]\w*)?|\$\w+/g, (original, offset: number) => {
    joinsName ||= /[\w$]/.test(text.charAt(offset - 1)) || /[\w$]/.test(text.charAt(offset + original.length));
    let placeholder = '';
    // Unique in the fragment, and among the placeholders before it, which aren't in the text yet
    for (let suffix = placeholders.length; !placeholder || text.includes(placeholder) || placeholders.some(other => other.placeholder === placeholder); ++suffix)
      placeholder = `x${suffix.toString(36)}`.padEnd(original.length, '_');
    placeholders.push({ placeholder, original });
    return placeholder;
  });
  if (joinsName)
    return undefined;
  text = text.replace(/\s+/g, ' ');

  // Digit separators are C++ the formatter takes, unlike other quotes left
  const withoutDigitSeparators = text.replace(/(?<=[\da-fA-F])'(?=[\da-fA-F])/g, '');
  if (/[;{}"'`\\#@$]|\/\/|\/\*|\*\//.test(withoutDigitSeparators) || !bracketsBalance(text, false))
    return undefined;

  const kind = classifyFragment(text);
  // A type is wrapped as a template argument, so its angle brackets have to nest too. The formatter takes an operator's
  // name within parentheses, as in decltype(&CFoo::operator<), but not outside them, such as a bare operator<, which
  // would leave all the fragments laid out with it as they are.
  if (kind === 'type') {
    const withOperatorsInParentheses = text.replace(operatorName, (name, offset: number) => {
      const before = text.slice(0, offset);
      return (before.match(/\(/g)?.length ?? 0) > (before.match(/\)/g)?.length ?? 0) ? 'operatorX' : name;
    });
    // And the > of a member access arrow, as in decltype(p->f_Get()), doesn't close one
    if (!bracketsBalance(withOperatorsInParentheses.replace(/->/g, '-'), true))
      return undefined;
  }
  return { text, kind, placeholders };
}

function fragmentMarker(index: number): string {
  return `// Fragment ${index}`;
}

/**
 * The source that holds the fragments, each behind a comment that marks where it starts in the formatted source, two
 * indentation levels in. The formatter splits a fragment the way a source file has it, so the wrappers make it what the
 * fragment is: a type is a template argument, a signature a declaration in a namespace and an expression a statement
 * in a block.
 */
export function buildFragmentSource(fragments: readonly PreparedFragment[], options: FragmentLayoutOptions): string {
  const indent = indentUnit(options);
  const lines: string[] = [];
  fragments.forEach((fragment, index) => {
    lines.push(fragmentMarker(index));
    switch (fragment.kind) {
      case 'type':
        lines.push(`using t_Fragment${index} = TCFragment<${fragment.text}>;`);
        break;
      case 'signature':
        lines.push(
          `namespace NFragment${index}`, '{',
          `${indent}namespace NFragment`, `${indent}{`,
          `${indent}${indent}${fragment.text};`,
          `${indent}}`, '}'
        );
        break;
      case 'expression':
        lines.push(
          `void fg_Fragment${index}()`, '{',
          `${indent}{`,
          `${indent}${indent}${fragment.text};`,
          `${indent}}`, '}'
        );
        break;
    }
  });
  return lines.join('\n') + '\n';
}

function wordCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of text.match(/\w+/g) ?? [])
    counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/**
 * Whether the formatted fragment has the brackets of the fragment, which the formatter can lose in code it can't parse,
 * such as std::vector<<error-type>>. A return type moved behind the parameters adds an ->.
 */
function hasSameBrackets(original: string, formatted: string): boolean {
  const brackets = (text: string) => text.replace(/->/g, '').replace(/[^()[\]<>]/g, '').split('').sort().join('');
  return brackets(original) === brackets(formatted);
}

/**
 * Whether the formatted fragment has the words of the fragment. The formatter moves some, such as a const behind its
 * type and a return type behind the parameters, which adds an auto.
 */
function hasSameWords(original: string, formatted: string): boolean {
  const originalCounts = wordCounts(original);
  const formattedCounts = wordCounts(formatted);
  for (const [word, count] of formattedCounts) {
    if ((originalCounts.get(word) ?? 0) !== count && word !== 'auto')
      return false;
  }
  for (const [word, count] of originalCounts) {
    if ((formattedCounts.get(word) ?? 0) < count)
      return false;
  }
  return true;
}

/**
 * Each fragment's text in the formatted source, without its wrapper and the wrapper's two indentation levels, so its
 * first line starts at column 0 and the others keep their indentation relative to it, or on one line as the formatter
 * writes it. A fragment that can't be found is undefined.
 */
export function extractFormattedFragments(formatted: string, fragments: readonly PreparedFragment[], options: FragmentLayoutOptions): (string | undefined)[] {
  const lines = formatted.split(/\r\n|\r|\n/);
  const starts = fragments.map((_, index) => lines.indexOf(fragmentMarker(index)));
  const levels = indentUnit(options).repeat(wrapperLevels);

  return fragments.map((fragment, index) => {
    const start = starts[index];
    if (start < 0)
      return undefined;
    const nextStart = starts.slice(index + 1).find(next => next > start) ?? lines.length;

    const chunk = lines.slice(start + 1, nextStart);
    // A type on one line is on the wrapper's line
    const onWrapperLine = fragment.kind === 'type' ? new RegExp(`^using t_Fragment${index} = TCFragment<(.*)>;$`).exec(chunk.find(line => line.trim()) ?? '') : null;
    if (onWrapperLine)
      return restoreFragment(fragment, [onWrapperLine[1]]);

    // The fragment's lines are those of the wrapper that are two levels in, and are all in one run
    const first = chunk.findIndex(line => line.startsWith(levels));
    if (first < 0)
      return undefined;
    let end = first;
    while (end < chunk.length && chunk[end].startsWith(levels))
      ++end;
    if (chunk.slice(end).some(line => line.startsWith(levels)))
      return undefined;

    const body = chunk.slice(first, end).map(line => line.slice(levels.length));
    // The statement's ; is on a line of its own once the statement is split
    if (fragment.kind !== 'type') {
      const last = body.length - 1;
      if (body[last] === ';')
        body.pop();
      else if (body[last].endsWith(';'))
        body[last] = body[last].slice(0, -1);
      else
        return undefined;
    }
    return restoreFragment(fragment, body);
  });
}

/**
 * The fragments as requests to a format server: each with its text and kind, the width and indentation to lay it out
 * with, and the directory it comes from, whose style reads the names
 */
export function buildFragmentRequests(fragments: readonly PreparedFragment[], options: FragmentLayoutOptions, directory: string): Record<string, unknown>[] {
  return fragments.map(fragment => ({
    request: 'fragment',
    text: fragment.text,
    kind: fragment.kind,
    maxColumns: options.maxColumns,
    indentStyle: options.insertSpaces ? 'space' : 'tab',
    indentSize: options.tabSize,
    directory
  }));
}

/**
 * Each fragment's text from a format server's answers, one for each fragment in their order, with its text or an
 * error. A fragment it gave an error for is undefined, and so is the whole result when the answers aren't those of the
 * fragments, each with a text or an error.
 */
export function parseFragmentAnswers(answers: readonly Record<string, unknown>[], fragments: readonly PreparedFragment[]): (string | undefined)[] | undefined {
  if (answers.length !== fragments.length)
    return undefined;

  const texts: (string | undefined)[] = [];
  for (const [index, { text, error }] of answers.entries()) {
    if (typeof text === 'string')
      texts.push(restoreFragment(fragments[index], text.split('\n')));
    else if (typeof error === 'string')
      texts.push(undefined);
    else
      return undefined;
  }
  return texts;
}

/** The fragment's formatted lines with what the placeholders stand for, if they have the fragment's words and brackets */
function restoreFragment(fragment: PreparedFragment, body: readonly string[]): string | undefined {
  if (!body.length || /^\s/.test(body[0]))
    return undefined;

  let text = body.join('\n');
  if (!hasSameWords(fragment.text, text) || !hasSameBrackets(fragment.text, text))
    return undefined;
  // Whole identifiers only, as a placeholder can start like a longer one: x1_ and x1____
  for (const { placeholder, original } of fragment.placeholders)
    text = text.replace(new RegExp(`(?<![A-Za-z0-9_])${placeholder}(?![A-Za-z0-9_])`, 'g'), () => original);
  return text;
}
