# Build System Integration

## Overview
The extension provides deep integration with the Malterlib build system, allowing you to generate, build, and manage projects directly from VS Code.

Everything the extension knows about the build comes from the [ConfigStore](config-store.md) that `mib generate` writes. Other build systems can write a ConfigStore of their own to use the status bar, the build and tidy tasks and the debug configurations without a `.MBuildSystem` file.

## Task System

### Predefined Tasks
The extension automatically provides these tasks through the task provider:

#### Malterlib: Generate All
Generates all workspaces in the project.

**Important**: Before using any tasks, you must first generate on the command line:
```bash
./mib generate
# or with custom output directory:
./mib generate --output-directory "$PWD/BuildSystem/MyBuildSystem"
```
This populates the generator dropdown with the generator that was used. Each generation adds that specific generator/path combination to the dropdown.

**Currently Supported Generators**:
- Ninja
- Xcode (macOS)
- Visual Studio (Windows)

The generate tasks are only available for a ConfigStore that mib wrote. For other build systems, generating is up to the build scripts of the ConfigStore.

**What it does**:
1. Uses the previously selected generator from command line generation
2. Generates project files for all workspaces
3. Updates build directory structure

#### Malterlib: Generate Workspace
Generates the currently selected workspace only.

**What it does**:
1. Uses the selected generator
2. Generates project files for the selected workspace
3. Faster than generating all workspaces

#### Malterlib: Build Workspace
Builds the entire selected workspace.

**What it does**:
1. Ensures project is generated
2. Runs the ConfigStore's `BuildWorkspace.sh`, which for mib invokes Ninja, Xcode or Visual Studio
3. Builds all targets in the workspace in dependency order
4. Reports errors through problem matcher

#### Malterlib: Build Target
Builds a specific target selected from the status bar, with the ConfigStore's `BuildTarget.sh`.

**What it does**:
1. Builds only the selected target
2. Builds dependencies if needed
3. Faster than full workspace build
4. Useful for iterative development

#### Malterlib: Format and Malterlib: Check Format
Run the ConfigStore's `Format.sh` and `FormatCheck.sh`, which for mib run `mib format` and `mib format --check` over the repositories that set `Repository.Format`. What can't be fixed is reported in the Problems panel.

Format Document and Format Selection format with the ConfigStore's `FormatFile.sh`, see [Formatting in the Editor](config-store.md#formatting-in-the-editor).

## Problem Matchers

The extension includes problem matchers that automatically parse build output and populate the VS Code Problems panel with errors and warnings from the Malterlib build system.

### Standard Problem Matching
The generate and build commands automatically detect and report:
- Compiler errors and warnings
- Linker errors
- Build system configuration issues

### Advanced Problem Matching
For enhanced problem matching capabilities, including support for more complex error patterns and multi-file references, use [Unbroken Code](https://github.com/Unbroken/UnbrokenCode.git) - a specialized VS Code build that includes extended problem matcher features not yet available in standard VS Code releases.

## Build Workflow

### 1. Project Detection

**Automatic Project Detection**:
The extension detects Malterlib projects by looking for `*.MBuildSystem` files or `BuildSystem/*/ConfigStore/Generator.json` files in the project root directory.

**Generator Detection**:
Generators are discovered by scanning `BuildSystem/*/ConfigStore` directories, which contain JSON files describing each generated build configuration. See [ConfigStore](config-store.md) for the format.

**Detection Process**:
1. On activation, scans for `*.MBuildSystem` or `BuildSystem/*/ConfigStore/Generator.json` in project root
2. Scans `BuildSystem/*/ConfigStore` for generator configurations
3. Populates dropdown with discovered generators
4. Updates when generators are added or removed

### 2. Configuration Selection

**Selection Flow**:
```
1. Choose Generator → Updates available workspaces
2. Select Workspace → Updates available configurations
3. Pick Configuration → Updates available targets
4. Select Target → Ready to build
```

### 3. Generation Phase

The generation tasks run the `./mib generate` command with the appropriate options based on your selections in the status bar.

**Generator Outputs**:
| Generator | Creates |
|-----------|----------|
| Ninja | `build.ninja` files |
| Xcode | `.xcodeproj`, `.xcworkspace` |
| Visual Studio | `.vcxproj`, `.sln` |

### 4. Build Phase

The build tasks run the build scripts of the ConfigStore with the selected workspace, target and configuration. For mib, these invoke Ninja, Xcode or Visual Studio. Build output is displayed in the terminal and errors are automatically parsed into the Problems panel.

## Keyboard Shortcuts

### Recommended Keybindings

Add to `keybindings.json`:

```json
[
    {
        "key": "shift+alt+b",
        "command": "workbench.action.tasks.runTask",
        "args": "Malterlib: Generate Workspace"
    },
    {
        "key": "alt+b",
        "command": "workbench.action.tasks.runTask",
        "args": "Malterlib: Build Workspace"
    }
]
```

## Related Documentation
- [ConfigStore](config-store.md) - The format the build integration reads, and how other build systems can write it
- [Status Bar Controls](status-bar.md) - UI for build selection
- [Debug Configuration](debug-configuration.md) - Debugging built targets