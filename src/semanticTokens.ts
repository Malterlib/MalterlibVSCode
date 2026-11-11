import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// The characters classifyIdentifier takes as upper case after a prefix, and those of identifiers
const upperCaseClass = '[A-Z0-9\\u00C0-\\u00DF]';
const identifierCharClass = '[A-Za-z0-9_\\u00C0-\\u00FF]';
// The workbench only takes a match that ends where a word does, but an alternation stops at its first alternative that
// matches, so each rule checks the end itself: (in|int) would otherwise match "in" of "int" and fail.
const identifierEnd = `(?!${identifierCharClass})`;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The keywords that debugger values hold as code, in types and constants: NMib::TCVector<int const *>, nullptr
const valueKeywordScopes = new Set([
  'malterlib-keyword-builtin-character-types',
  'malterlib-keyword-builtin-constants',
  'malterlib-keyword-builtin-float-types',
  'malterlib-keyword-builtin-integer-types',
  'malterlib-keyword-builtin-type-modifiers',
  'malterlib-keyword-builtin-types',
  'malterlib-keyword-builtin-vector-types',
  'malterlib-keyword-qualifier',
  'malterlib-keyword-this',
  'malterlib-keyword-type-specification',
  'malterlib-namespace',
]);

interface CodeFragmentTokenRule<Kind> {
  regex: string;
  tokenType: string;
  kinds?: readonly Kind[];
}

/**
 * Rules that color code fragments, such as the types in compiler messages, as classifyIdentifier colors the identifiers
 * of documents: exact keywords first, then the prefixes, longest first. The rules of a prefix length only differ in
 * where they're tried among those of other lengths, so they're grouped by scope within a length. Before them come the
 * floating point constants Malterlib's debugger formatters show, which aren't C++.
 *
 * @param kinds.butValues The kinds of fragments other than debugger values. Values show prose such as "Start of time"
 * and "4 key-value pairs" more often than the names of local variables, capitalized words without a prefix, or the
 * keywords that are also words, such as value and for, so those are only colored in the other kinds, and in values
 * where a summary names a member: {IntrusiveList:4 elements} or { Value = 7 }.
 * @param kinds.values The kind of debugger values.
 */
export function buildCodeFragmentTokenRules<Kind>(
  keywords: Record<string, string>,
  prefixInfo: Record<string, { scope: string; variable: boolean }>,
  kinds?: { readonly butValues: readonly Kind[]; readonly values: Kind }
): CodeFragmentTokenRule<Kind>[] {
  const kindsButValues = kinds?.butValues;
  const rules: CodeFragmentTokenRule<Kind>[] = [];
  const addRule = (tokenType: string, alternatives: string[], kinds?: readonly Kind[]) => {
    if (alternatives.length)
      rules.push({ regex: alternatives.length > 1 ? `(?:${alternatives.join('|')})` : alternatives[0], tokenType, ...kinds ? { kinds } : {} });
  };

  // -Inf, SNaN, QNaN, and the denormal numbers the formatters mark: 1.401298464324817E-45#denorm. Only values hold
  // them, as elsewhere Inf is a name.
  const valueKinds = kinds ? [kinds.values] : undefined;
  rules.push({ regex: `[-+]?(?:Inf|SNaN|QNaN|NaN)${identifierEnd}`, tokenType: 'number', ...valueKinds ? { kinds: valueKinds } : {} });
  rules.push({ regex: `[-+]?(?:\\d[\\d']*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)#denorm${identifierEnd}`, tokenType: 'number', ...valueKinds ? { kinds: valueKinds } : {} });

  // By scope, and by whether values hold them: keywords that are also words, such as value and for, are left out of
  // values unless values hold their scope as code, while exact names, such as CFStr, aren't words
  const keywordsByScope = new Map<string, { all: string[]; butValues: string[] }>();
  for (const [keyword, scope] of Object.entries(keywords)) {
    // Keywords such as [[ don't end in an identifier character, and a match only has to end where a word does
    const end = /[A-Za-z0-9_]$/.test(keyword) ? identifierEnd : '';
    const group = keywordsByScope.get(scope) ?? { all: [], butValues: [] };
    keywordsByScope.set(scope, group);
    (/^[a-z]+$/.test(keyword) && !valueKeywordScopes.has(scope) ? group.butValues : group.all).push(escapeRegex(keyword) + end);
  }
  for (const [scope, { all, butValues }] of keywordsByScope) {
    addRule(scope, all);
    addRule(scope, butValues, kindsButValues);
  }

  const prefixesByLength = new Map<number, string[]>();
  for (const prefix of Object.keys(prefixInfo))
    prefixesByLength.set(prefix.length, [...prefixesByLength.get(prefix.length) ?? [], prefix]);
  for (const length of [...prefixesByLength.keys()].sort((a, b) => b - a)) {
    // The enum and CoreFoundation type rules go first, as their prefixes' general rules match their names too
    const specialCases: { regex: string; tokenType: string }[] = [];
    const byScope = new Map<string, string[]>();
    const add = (scope: string, regex: string) => byScope.set(scope, [...byScope.get(scope) ?? [], regex]);
    for (const prefix of prefixesByLength.get(length)!) {
      const { scope, variable } = prefixInfo[prefix];
      const escaped = escapeRegex(prefix);
      // A variable prefix can have one concept character between it and the upper case character: m_pData. Digits count
      // as upper case, but an identifier can't start with one, and fragments, unlike the identifiers of documents,
      // hold numbers: Atomic0, but not 32.
      if (variable)
        add(scope, `${prefix ? '' : '(?![0-9])'}${escaped}[binpfro]?${upperCaseClass}${identifierCharClass}*${identifierEnd}`);
      else if (prefix === 'E') {
        // An enum has no underscore, an enumerator has one: EDigestType, EDigestType_SHA256
        specialCases.push({ regex: `E${upperCaseClass}[A-Za-z0-9\\u00C0-\\u00FF]*${identifierEnd}`, tokenType: 'malterlib-enum' });
        add(scope, `E${upperCaseClass}${identifierCharClass}*${identifierEnd}`);
      } else if (prefix === 'CF') {
        // CoreFoundation types end in Ref, which can be the upper case character's: CFRef
        specialCases.push({ regex: `CF(?=${upperCaseClass})${identifierCharClass}*Ref${identifierEnd}`, tokenType: 'malterlib-type' });
        add(scope, `CF${upperCaseClass}${identifierCharClass}*${identifierEnd}`);
      } else
        add(scope, `${escaped}${upperCaseClass}${identifierCharClass}*${identifierEnd}`);
    }
    rules.push(...specialCases);
    for (const [scope, alternatives] of byScope) {
      addRule(scope, alternatives, length === 0 ? kindsButValues : undefined);
      // The names of a summary's members in values, after { or , and before : or =
      if (length === 0 && kinds)
        addRule(scope, alternatives.map(alternative => `(?<=[{,]\\s*)${alternative}(?=\\s*[:=])`), [kinds.values]);
    }
  }
  return rules;
}

export function registerSemanticTokens(context: vscode.ExtensionContext, output: vscode.OutputChannel): vscode.Disposable {
  const extensionRoot = context.extensionPath;

  function readJSON(rel: string) {
    const abs = path.join(extensionRoot, rel);
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      return {};
    }
  }

  const scopesJson = readJSON('scopes.json');
  const keywords: Record<string, string> = scopesJson.keywords || {};
  const prefixes: string[] = Object.keys(scopesJson.prefixes || {});
  const prefixInfo: Record<string, { scope: string; variable: boolean }> = scopesJson.prefixes || {};
  const scopeArray: string[] = Array.isArray(scopesJson.scopes) ? scopesJson.scopes : [];

  // Prefix maps: variable and non-variable
  const maxPrefixLen = 6;
  const prefixMapInfoVar: Record<number, Record<string, string>> = {};
  const prefixMapInfo: Record<number, Record<string, string>> = {};
  for (let i = 0; i <= maxPrefixLen; ++i) {
    prefixMapInfoVar[i] = {};
    prefixMapInfo[i] = {};
  }
  for (const prefix of prefixes) {
    const { scope, variable } = prefixInfo[prefix];
    const len = prefix.length;
    if (variable)
      prefixMapInfoVar[len][prefix] = scope;
    else
      prefixMapInfo[len][prefix] = scope;
  }

  // Concept valid chars (from C++: "binpfro")
  const validConceptChars = new Set('binpfro'.split(''));
  function isUpperCase(ch: string) {
    const code = ch.charCodeAt(0);
    return (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || (code >= 0xc0 && code <= 0xdf);
  }

  function matchVariablePrefix(identifier: string, prefix: string): boolean {
    if (!identifier.startsWith(prefix)) return false;
    const matchLen = prefix.length;
    const identLen = identifier.length;
    if (identLen <= matchLen) return false;
    let ch = identifier[matchLen];
    if (isUpperCase(ch)) return true;
    if (!validConceptChars.has(ch)) return false;
    if (identLen <= matchLen + 1) return false;
    ch = identifier[matchLen + 1];
    if (isUpperCase(ch)) return true;
    return false;
  }

  function matchOtherPrefix(identifier: string, prefix: string): boolean {
    const matchLen = prefix.length;
    const identLen = identifier.length;
    if (identLen <= matchLen) return false;
    return identifier.startsWith(prefix) && isUpperCase(identifier[matchLen]);
  }

  function classifyIdentifier(name: string): string | undefined {
    // 1. Exact keyword match
    if (keywords[name])
      return keywords[name];
    // 2. Prefix match (longest first)
    const len = name.length;
    for (let i = Math.min(maxPrefixLen, len); i >= 0; --i) {
      const prefix = name.substring(0, i);
      if (prefixMapInfo[i][prefix]) {
        if (matchOtherPrefix(name, prefix)) {
          // Special case for E/CF
          if (i === 1 && prefix === 'E' && !name.includes('_'))
            return 'malterlib-enum'; // Enum
          if (i === 2 && prefix === 'CF' && name.endsWith('Ref'))
            return 'malterlib-type'; // CoreFoundation type
          return prefixMapInfo[i][prefix];
        }
      }
      if (prefixMapInfoVar[i][prefix]) {
        if (matchVariablePrefix(name, prefix))
          return prefixMapInfoVar[i][prefix];
      }
    }
    return undefined;
  }

  const scopeToIndex = new Map<string, number>();
  scopeArray.forEach((scope, idx) => scopeToIndex.set(scope, idx));

  const legend = new vscode.SemanticTokensLegend(scopeArray, []);

  class MalterlibProvider implements vscode.DocumentSemanticTokensProvider {
    provideDocumentSemanticTokens(doc: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
      const builder = new vscode.SemanticTokensBuilder(legend);

      // Improved identifier regex: matches [[, ]], standard identifiers, and preprocessor directives like #include
      const identRe = /(\[\[|\]\]|#[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)/g;

      let inBlockComment = false; // Track block comment state across lines

      for (let line = 0; line < doc.lineCount; ++line) {
        const text = doc.lineAt(line).text;

        // --- Track comment/string/include state ---
        // States: inBlockComment, inString, inChar, inAngleInclude
        let inAngleInclude = false;
        const includeStart = text.match(/^\s*#\s*include\s*/);
        let angleStart = -1;
        if (includeStart) {
          // Find first < after #include
          angleStart = text.indexOf('<', includeStart[0].length);
          if (angleStart !== -1) {
            // Find closing >
            const angleEnd = text.indexOf('>', angleStart + 1);
            if (angleEnd !== -1)
              inAngleInclude = true;
          }
        }

        // Precompute comment/string/angle regions for this line
        const regions: Array<{ start: number; end: number }> = [];

        let searchIdx = 0;
        while (searchIdx < text.length) {
          if (inBlockComment) {
            const end = text.indexOf('*/', searchIdx);
            if (end !== -1) {
              regions.push({ start: searchIdx, end: end + 2 });
              searchIdx = end + 2;
              inBlockComment = false;
            } else {
              regions.push({ start: searchIdx, end: text.length });
              break;
            }
          } else {
            const start = text.indexOf('/*', searchIdx);
            const lineCommentStart = text.indexOf('//', searchIdx);
            if (start !== -1 && (lineCommentStart === -1 || start < lineCommentStart)) {
              const end = text.indexOf('*/', start + 2);
              if (end !== -1) {
                regions.push({ start, end: end + 2 });
                searchIdx = end + 2;
              } else {
                regions.push({ start, end: text.length });
                inBlockComment = true;
                break;
              }
            } else if (lineCommentStart !== -1) {
              regions.push({ start: lineCommentStart, end: text.length });
              break;
            } else
              break;
          }
        }

        // Strings and char literals
        const strRe = /("([^\\"]|\\.)*")|('([^\\']|\\.)*')/g;
        let mstr: RegExpExecArray | null;
        while ((mstr = strRe.exec(text)))
          regions.push({ start: mstr.index, end: mstr.index + mstr[0].length });

        // Angle include
        if (inAngleInclude && angleStart !== -1) {
          const angleEnd = text.indexOf('>', angleStart + 1);
          if (angleEnd !== -1)
            regions.push({ start: angleStart, end: angleEnd + 1 });
        }
        // Sort regions for efficient lookup
        regions.sort((a, b) => a.start - b.start);

        // Helper: is a given range inside any region?
        function isInRegion(start: number, end: number) {
          for (const r of regions) {
            if (start < r.end && end > r.start)
              return true;
          }
          return false;
        }

        let m: RegExpExecArray | null;
        while ((m = identRe.exec(text))) {
          const ident = m[0];
          const start = m.index;
          const end = m.index + ident.length;
          if (isInRegion(start, end))
            continue; // skip if inside comment/string/include
          const scope = classifyIdentifier(ident);
          if (scope) {
            const tokenType = scopeToIndex.get(scope);
            if (tokenType !== undefined)
              builder.push(line, m.index, ident.length, tokenType, 0);
          }
        }
      }
      return builder.build();
    }
  }

  const provider = new MalterlibProvider();
  const langs = [{ scheme: '*', language: 'c' }, { scheme: '*', language: 'cpp' }];
  const codeFragmentLangs = ['c', 'cpp', 'objective-c', 'objective-cpp'].map(language => ({ scheme: '*', language }));

  // Register providers
  const disposables: vscode.Disposable[] = [];

  // Unbroken Code merges the tokens with clangd's, which refine them once clangd has parsed the file, and turns the
  // setting on by default. Other editors only show the tokens of one provider, the one registered last, so there they
  // replace clangd's.
  const bMerge = vscode.languages.registerMergedDocumentSemanticTokensProvider !== undefined;

  function registerProviders() {
    // Dispose existing providers
    disposables.forEach(d => d.dispose());
    disposables.length = 0;

    // Check if semantic coloring is enabled
    const config = vscode.workspace.getConfiguration('malterlib');
    const enableSemanticColoring = config.get<boolean>('enableSemanticColoring', bMerge);

    if (enableSemanticColoring) {
      // Register new providers only when enabled
      for (const sel of langs) {
        const disposable = vscode.languages.registerMergedDocumentSemanticTokensProvider
          ? vscode.languages.registerMergedDocumentSemanticTokensProvider(sel, provider, legend)
          : vscode.languages.registerDocumentSemanticTokensProvider(sel, provider, legend);
        disposables.push(disposable);
      }
      // Unbroken Code colors the code fragments shown outside editors, such as the types in compiler messages and the
      // debugger's variables, with the rules of the documents they come from
      if (vscode.languages.registerCodeFragmentTokenRules) {
        const { Name, Type, Value, Quoted, StackFrame } = vscode.CodeFragmentKind;
        const rules = buildCodeFragmentTokenRules(keywords, prefixInfo, { butValues: [Name, Type, Quoted, StackFrame], values: Value });
        disposables.push(vscode.languages.registerCodeFragmentTokenRules(codeFragmentLangs, rules));
      }
    }
  }

  // Initial registration
  registerProviders();

  // Listen for configuration changes
  const cfgDisposable = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('malterlib.enableSemanticColoring')) {
      output.appendLine('Semantic coloring setting changed. Re-registering providers...');
      registerProviders();
      // The semantic tokens will update automatically when the provider is re-registered
    }
  });

  // Register again after a brief delay, after clangd's provider, so the tokens replace clangd's in editors that don't
  // merge them
  const timer = bMerge ? undefined : setTimeout(() => {
    registerProviders();
  }, 1000);

  return vscode.Disposable.from(
    cfgDisposable,
    { dispose: () => clearTimeout(timer) },
    { dispose: () => disposables.forEach(d => d.dispose()) }
  );
}


