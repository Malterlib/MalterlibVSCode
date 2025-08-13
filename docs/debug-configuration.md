# Debug Configuration

The Malterlib extension provides sophisticated debugging support with automatic LLDB configuration generation, multi-target debugging capabilities, and seamless integration with VS Code's debugging infrastructure.

## Overview

The debugging system automatically generates debug configurations based on your Malterlib build system setup, eliminating the need for manual `launch.json` configuration in most cases. The extension supports single-target debugging, multi-target compound debugging.

### Key Features

- **Automatic Configuration**: Generates debug configs from build system information
- **Multi-Target Support**: Debug multiple processes simultaneously
- **Dynamic Resolution**: Configurations update based on current selections
- **Zero Configuration**: Works without manual `launch.json` setup

## Using Malterlib-Shipped LLDB (Recommended)

For best compatibility and features, use the LLDB included with Malterlib:

```json
// .vscode/settings.json
{
    "lldb.library": "${workspaceFolder}/Binaries/MalterlibLLVM/HostPlatformArchitecture/lib/liblldb.dylib"
}
```

This path automatically resolves to the correct platform and architecture.

This ensures:
- Compatibility with Malterlib-compiled binaries
- Access to Malterlib-specific debugging features
- Consistent debugging experience across team members

To enable richer LLDB formatting and automatic expansion of Malterlib types during a debug session, create a file named `.lldbinit` in the root of your workspace containing the following line:

```sh
command script import "./Malterlib/Debug/Source/Malterlib_LLDB"
```

This imports the Malterlib LLDB Python helper and allows LLDB to present Malterlib-specific type summaries and pretty-printing while debugging.

## Debug Configuration Types

### Single Target Debugging

The most common debugging scenario involves launching a single executable target.

#### Automatic Single Target Configuration

When you press F5 or use "Run and Debug", the extension automatically:

1. Identifies the selected target from the status bar
2. Locates the built executable from the default post copy location (see your PostCopy.MConfig)
3. Generates an LLDB launch configuration

### Multi-Target Debugging

For applications that consist of multiple communicating processes, the extension supports compound debugging configurations.

#### Selecting Multiple Debug Targets

1. Click the **🐛 Debug Targets** button in the status bar
2. Check multiple executable targets in the selection menu

Each referenced configuration is automatically generated based on the target's build information.
