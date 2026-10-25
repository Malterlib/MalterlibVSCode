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
}
