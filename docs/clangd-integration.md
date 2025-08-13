# clangd Integration

The Malterlib extension provides seamless integration with clangd, the official C++ language server. This integration offers superior performance, compiler-accurate semantics, and advanced language features while preserving Malterlib's specialized syntax highlighting and build system integration.

## Overview

clangd integration enhances the Malterlib extension by providing:

- **Compiler-Accurate Analysis**: Real compiler-level understanding of your code
- **Superior Performance**: Optimized for large codebases (1000+ files)
- **Advanced Language Features**: Go to definition, find references, call hierarchy
- **Real-Time Diagnostics**: Actual compiler errors and warnings
- **Intelligent Code Completion**: Context-aware suggestions with documentation

The integration maintains full compatibility with Malterlib's naming conventions and semantic highlighting while leveraging clangd's powerful analysis capabilities.

## Benefits of clangd Integration

### Feature Comparison

| Feature | Extension Only | With clangd |
|---------|---------------|-------------|
| Syntax Highlighting | ✅ Full | ✅ Full |
| Semantic Highlighting | ✅ Pattern-based | ✅ Compiler-accurate |
| Code Completion | ❌ None | ✅ Advanced |
| Go to Definition | ❌ None | ✅ Precise |
| Find References | ❌ None | ✅ Complete |
| Hover Information | ❌ None | ✅ Detailed |
| Diagnostics | ❌ None | ✅ Real-time |
| Refactoring | ❌ None | ✅ Safe |
| Call Hierarchy | ❌ None | ✅ Full |
| Type Hierarchy | ❌ None | ✅ Complete |

## Installation and Setup

The Malterlib development environment includes a customized clangd with enhanced Malterlib support. Configure VS Code to use it:

```json
// .vscode/settings.json
{
    "clangd.path": "${workspaceFolder}/Binaries/MalterlibLLVM/HostPlatformArchitecture/bin/clangd"
}
```

### Install clangd VS Code Extension

Install the official clangd extension:
1. Open VS Code Extensions (Ctrl+Shift+X)
2. Search for "clangd" 
3. Install "clangd" by LLVM Extensions
4. Disable the Microsoft C/C++ extension's IntelliSense:
   ```json
   {
       "C_Cpp.intelliSenseEngine": "disabled"
   }
   ```

## Malterlib clangd Configuration

Use the generated `.clangd` configuration found in the main readme: [`README.md`](../README.md#configuration-of-clangd).

### Extension Settings

Configure the Malterlib extension to work with clangd:

```json
{
    // Disable extension semantic coloring (clangd provides it)
    "malterlib.enableSemanticColoring": false,
    
    // Optional: Configure clangd behavior
    "clangd.arguments": [
        "--background-index=true",
        "--completion-style=detailed", 
        "--header-insertion=iwyu",
        "--pch-storage=memory"
    ]
}
```
