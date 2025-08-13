# Semantic Coloring

## Overview
Semantic coloring is the crown jewel of the Malterlib extension, providing intelligent, context-aware coloring based on Malterlib naming conventions. Unlike simple syntax highlighting, semantic coloring understands the meaning and role of each identifier in your code.

## Malterlib Naming Conventions

The extension implements the official Malterlib Code Standard for naming and coloring. For the complete naming convention reference, see:
- **[Official Malterlib Naming Standard](https://docs.malterlib.org/p__malterlib__core__code_standard__naming.html)**
- **[Official Malterlib Coloring Standard](https://docs.malterlib.org/p__malterlib__core__code_standard__coloring.html)**

### Quick Reference
This section provides a quick reference for the most common prefixes. For comprehensive details and rationale, refer to the [official documentation](https://docs.malterlib.org/p__malterlib__core__code_standard__naming.html).

## VS Code Extension Implementation

### How the Extension Applies Coloring
The VS Code extension implements the Malterlib coloring standard through:
1. **Semantic Token Provider** - Real-time analysis of identifiers
2. **Pattern Matching** - Prefix-based classification using the official naming conventions
3. **TextMate Scopes** - Mapping Malterlib classifications to VS Code theme colors
4. **clangd Integration** - Optional compiler-accurate semantic analysis

### Extension-Specific Features
- **Real-time coloring** without compilation
- **Partial code support** - Works with incomplete files

## Configuration Options

### Enable/Disable Semantic Coloring
```json
{
    "malterlib.enableSemanticColoring": true  // or false
}
```

## Extension vs clangd: Understanding the Trade-offs

### Important Note
**You cannot have both semantic colorings simultaneously** - enabling Malterlib semantic coloring disables clangd's semantic token highlighting only. Other clangd features (code completion, diagnostics, go-to-definition, etc.) continue to work.

### Extension Semantic Coloring + clangd Features
**Advantages:**
- ✅ **Always faster coloring than clangd** - No indexing needed for colors
- ✅ **Instant color updates** - Works immediately on file open
- ✅ **Full clangd features** - Code completion, diagnostics, refactoring still work
- ✅ **Best performance** - Fast coloring + language features

**Limitations:**
- ❌ **Only colors Malterlib naming conventions** - Non-conforming code won't be colored
- ❌ **Pattern-based coloring** - Not compiler-accurate for colors

### clangd with Malterlib Configuration
**Advantages:**
- ✅ **Works with all code styles** - Colors both Malterlib and non-Malterlib code
- ✅ **Compiler-accurate** - True semantic understanding
- ✅ **Full language features** - Code completion, diagnostics, refactoring, etc.
- ✅ **Best of both worlds** - Malterlib conventions + standard code support

**Limitations:**
- ❌ **Slower than extension** - Requires indexing and compilation
- ❌ **Higher resource usage** - More memory and CPU
- ❌ **Startup delay** - Initial indexing can take time

### Choosing the Right Option

**Use Extension Semantic Coloring when:**
- Your codebase strictly follows Malterlib naming conventions
- You prioritize coloring speed and responsiveness
- You still want clangd's other features (completion, diagnostics, etc.)
- You're working with pure Malterlib code

**Use clangd Semantic Highlighting when:**
- Your codebase mixes Malterlib and standard naming conventions
- You need colors for non-Malterlib code
- You want compiler-accurate coloring
- You don't mind slower coloring performance

### Configuration
```json
// For extension semantic coloring + clangd features
{
    "malterlib.enableSemanticColoring": true
}

// For clangd semantic highlighting (for mixed codebases)
{
    "malterlib.enableSemanticColoring": false
}
```

## Related Documentation
- [Syntax Highlighting](syntax-highlighting.md) - Basic highlighting features
- [clangd Integration](clangd-integration.md) - Alternative semantic analysis
- [Color Themes](color-themes.md) - Color customization