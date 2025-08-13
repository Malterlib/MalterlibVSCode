# Syntax Highlighting

## Overview
The Malterlib extension provides advanced syntax highlighting that goes beyond standard C++ highlighting by understanding and coloring Malterlib-specific naming conventions and patterns. This feature works automatically when you open C/C++ files or Malterlib build system files.

## How It Works

The extension uses two complementary systems for syntax highlighting:

1. **TextMate Grammar Rules** - Provides basic syntax highlighting for keywords, operators, strings, and comments for malterlib build system files only
2. **Semantic Token Provider** - Analyzes identifiers in real-time to apply Malterlib-specific coloring based on naming conventions in C++ files

## Supported Languages

### C/C++ Files
The extension automatically activates for these file extensions:
- `.c`, `.cpp`, `.cc`, `.cxx` - C/C++ implementation files
- `.h`, `.hpp`, `.hxx` - Header files
- `.inl` - Inline implementation files
- `.tcc` - Template implementation files

### Malterlib Build System Files
Specialized highlighting for Malterlib build configuration files:
- `.MBuildSystem` - Base build system entry point
- `.MTarget`, `.MSettings`, `.MWorkspace`, `.MHeader` etc - Files that are part of the build system
- `.MConfig` - For example post copy files

## Technical Implementation

### Semantic Token Provider
The extension implements a custom semantic token provider that:
1. Scans each line of code using regex patterns
2. Identifies tokens that match Malterlib naming conventions
3. Classifies tokens into semantic categories
4. Maps categories to TextMate scopes for coloring. This makes the scopes compatible with text mate rules which is more flexible than coloring directly on the semantic tokens.

## Configuration

### Enable/Disable Semantic Coloring
```json
{
    "malterlib.enableSemanticColoring": true
}
```

## Related Documentation
- [Semantic Coloring](semantic-coloring.md) - Detailed naming convention guide
- [Color Themes](color-themes.md) - Theme selection and customization
- [clangd Integration](clangd-integration.md) - Alternative semantic highlighting