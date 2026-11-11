// API that Unbroken Code adds to VS Code's, which the @types/vscode the extension builds with don't have. Each is
// undefined in editors that don't have it.

declare module 'vscode' {
  /**
   * Metadata about a semantic tokens provider whose tokens are merged with the tokens of the other providers.
   */
  export interface MergedDocumentSemanticTokensProviderMetadata {
    /**
     * Where the layer of the provider's tokens goes among the layers of the other providers that merge theirs: layers
     * with a higher priority are merged on top of those with a lower one. Defaults to `0`.
     */
    readonly priority?: number;
  }

  export namespace languages {
    /**
     * Register a semantic tokens provider whose tokens are merged with the tokens of the other providers of the
     * document. They show as soon as they arrive, and the tokens of the provider chosen among the others, such as
     * clangd's, are merged on top of them. The layers of the providers that merge are ordered by priority, then by how
     * well their selectors match and how recently they were registered.
     */
    export const registerMergedDocumentSemanticTokensProvider: ((selector: DocumentSelector, provider: DocumentSemanticTokensProvider, legend: SemanticTokensLegend, metadata?: MergedDocumentSemanticTokensProviderMetadata) => Disposable) | undefined;
  }

  /**
   * A rule that colors the words of short pieces of code shown outside editors, such as the names and types of debugger
   * variables and the types compilers quote in their messages.
   */
  export interface CodeFragmentTokenRule {
    /**
     * JavaScript regular expression source. It is tried where a word starts in the fragment (and at other characters),
     * and a match counts only if it ends where a word ends, so `int` doesn't match the start of `int32`.
     */
    readonly regex: string;
    /** A semantic token type, declared in the extension's `semanticTokenTypes` contribution, that the theme colors. */
    readonly tokenType: string;
    readonly tokenModifiers?: readonly string[];
    /** The kinds of fragments the rule applies to, all when unset. */
    readonly kinds?: readonly CodeFragmentKind[];
  }

  /**
   * What a code fragment is. Editors without registerCodeFragmentTokenRules don't have it either.
   */
  export enum CodeFragmentKind {
    /** The name of a debugger variable or watch expression. */
    Name = 1,
    /** The type of a debugger variable or watch expression. */
    Type = 2,
    /** The value of a debugger variable or watch expression. */
    Value = 3,
    /** Code that a message, such as a compiler error, quotes. */
    Quoted = 4,
    /** The name of a stack frame, such as the signature of a function. */
    StackFrame = 5
  }

  export namespace languages {
    /**
     * Register rules that color the code fragments of the documents the selector matches. Rules are tried in order, the
     * first match wins; registrations are ordered by selector score, then most recent first.
     */
    export const registerCodeFragmentTokenRules: ((selector: DocumentSelector, rules: readonly CodeFragmentTokenRule[]) => Disposable) | undefined;
  }

  export interface CodeFragmentFormattingOptions {
    /** The width, in columns, the fragment should fit. */
    readonly maxColumns: number;
    readonly tabSize: number;
    readonly insertSpaces: boolean;
  }

  export interface CodeFragmentFormattingContext {
    /** The document the fragments come from, such as the file of a diagnostic or a stack frame. */
    readonly uri: Uri;
    readonly languageId: string;
  }

  /**
   * Lays out short pieces of code shown outside editors, such as the types compilers quote in their messages, over lines.
   */
  export interface CodeFragmentFormattingProvider {
    /**
     * Returns, for each fragment, its text laid out over lines, or undefined to leave it as is. Or undefined, rather than
     * an array, when they can't be laid out now, so they are asked for again.
     */
    provideCodeFragmentFormatting(context: CodeFragmentFormattingContext, fragments: readonly string[], options: CodeFragmentFormattingOptions, token: CancellationToken): ProviderResult<(string | undefined)[]>;
  }

  export namespace languages {
    /**
     * Register a provider that lays out the code fragments of the documents the selector matches.
     */
    export const registerCodeFragmentFormattingProvider: ((selector: DocumentSelector, provider: CodeFragmentFormattingProvider) => Disposable) | undefined;
  }
}
