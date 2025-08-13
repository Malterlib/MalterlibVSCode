# Malterlib VS Code Extension Documentation

Welcome to the comprehensive documentation for the Malterlib VS Code extension. This extension enhances VS Code with specialized support for Malterlib C++ development, implementing the [official Malterlib Code Standard](https://docs.malterlib.org/p__malterlib__core__code_standard.html).

## Official Malterlib Documentation
For complete details on Malterlib standards and conventions:
- **[Malterlib Code Standard](https://docs.malterlib.org/p__malterlib__core__code_standard.html)** - Complete coding standards
- **[Naming Conventions](https://docs.malterlib.org/p__malterlib__core__code_standard__naming.html)** - Official naming prefix guide  
- **[Coloring Standard](https://docs.malterlib.org/p__malterlib__core__code_standard__coloring.html)** - Color coding rationale and design

## VS Code Extension Documentation

### Getting Started
- **[Syntax Highlighting](syntax-highlighting.md)** - TextMate grammar and language support
- **[Semantic Coloring](semantic-coloring.md)** - Intelligent identifier coloring based on Malterlib naming conventions

### Build System Integration
- **[Build Integration](build-integration.md)** - VS Code tasks, problem matchers, and automation

### User Interface
- **[Status Bar Controls](status-bar.md)** - Interactive status bar for build configuration
- **[Debug Configuration](debug-configuration.md)** - Automatic LLDB setup and multi-target debugging
- **[Color Themes](color-themes.md)** - Display P3 and sRGB optimized themes

### Advanced Topics
- **[clangd Integration](clangd-integration.md)** - Enhanced language features with clangd language server

## Quick Reference

### Essential Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Semantic Coloring** | Intelligent code coloring based on Malterlib naming conventions | [Semantic Coloring](semantic-coloring.md) |
| **Status Bar Controls** | Interactive build system configuration | [Status Bar](status-bar.md) |
| **Build Integration** | Tasks, problem matchers, and automation | [Build Integration](build-integration.md) |
| **Debug Support** | Automatic LLDB configuration and multi-target debugging | [Debug Configuration](debug-configuration.md) |
| **Color Themes** | Optimized themes for different display technologies | [Color Themes](color-themes.md) |
| **clangd Integration** | Enhanced language features and performance | [clangd Integration](clangd-integration.md) |

### File Types Supported

| Extension | Language ID | Description | Documentation |
|-----------|-------------|-------------|---------------|
| `.cpp`, `.cc`, `.cxx` | cpp | C++ implementation files | [Syntax Highlighting](syntax-highlighting.md) |
| `.h`, `.hpp`, `.hxx` | cpp | C++ header files | [Syntax Highlighting](syntax-highlighting.md) |
| `.MBuildSystem`, `.MWorkspace`, etc | malterlib-build | Malterlib build system files | [Syntax Highlighting](syntax-highlighting.md) |

### Key Commands

| Command | Description | Default Key |
|---------|-------------|-------------|
| `malterlib.selectGenerator` | Choose build generator | None |
| `malterlib.selectWorkspace` | Choose workspace | None |
| `malterlib.selectConfiguration` | Choose configuration | None |
| `malterlib.selectTarget` | Choose target | None |
| `malterlib.selectDebugTargets` | Select multiple debug targets | None |
| `malterlib.selectSingleDebugTarget` | Select single debug target | None |

## Configuration Overview

### Basic Settings

Essential extension settings for getting started:

```json
{
    // Theme selection (automatically sets appropriate color space)
    "workbench.colorTheme": "Malterlib"  // or "Malterlib (sRGB)"
}
```

To enable richer LLDB formatting and automatic expansion of Malterlib types during debugging, create a file named `.lldbinit` in the root of your workspace containing the following line:

```sh
command script import "./Malterlib/Debug/Source/Malterlib_LLDB"
```

This imports the Malterlib LLDB Python helper so LLDB can present Malterlib-specific type summaries and pretty-printing during debug sessions.
```

### clangd Integration Settings

For mixed codebases that need coloring for non-Malterlib code (uses clangd's slower semantic highlighting):

```json
{
    // Disable extension semantic coloring (this is the default)
    "malterlib.enableSemanticColoring": false,
    
    // Use Malterlib-shipped clangd
    "clangd.path": "${workspaceFolder}/Binaries/MalterlibLLVM/HostPlatformArchitecture/bin/clangd",
    
    // Use Malterlib-shipped LLDB for debugging
    "lldb.library": "${workspaceFolder}/Binaries/MalterlibLLVM/HostPlatformArchitecture/lib/liblldb.dylib",
    
    // clangd arguments (optional)
    "clangd.arguments": [
        "--background-index",
        "--completion-style=detailed",
        "--header-insertion=iwyu"
    ]
}
```

### Compatibility

**VS Code**: 1.80.0 or later
**Languages**: C, C++ (C++11 through C++23)
**Build Systems**: Malterlib build system
**Debuggers**: LLDB
