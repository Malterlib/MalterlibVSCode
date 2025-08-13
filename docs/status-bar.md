# Status Bar Controls

The Malterlib extension provides an intuitive status bar interface for quick access to build system configuration. All status bar controls update dynamically and provide immediate feedback for your current project state.

## Overview

The status bar displays five interactive buttons that control different aspects of the Malterlib build system:

- **🔧 Generator**
- **📁 Workspace**
- **⚙️ Configuration**
- **🎯 Target**
- **🐛 Debug Targets**

All controls are positioned in the left section of the status bar and automatically update when your project configuration changes.

## Status Bar Controls

### Generator Button (🔧)

**Purpose**: Selects the build system generator that converts Malterlib build files into platform-specific build systems.

**Location**: Leftmost position in status bar  
**Displayed Text**: The label is shown in brackets (for example, `[Xcode]` or `[MyWorkspace / Xcode]`).  
**Click Action**: Opens a selection list with available generator instances.

#### How Generators Work

Generators discovered by the extension are listed in the selection. To create a generator instance, run your generator as you normally would on the command line (for example `./mib generate`); generated build outputs are detected and presented by the extension.

Each listed generator includes contextual information in the selection UI so you can choose the correct instance for the workspace.

#### Generator Configuration

```json
{
  "malterlib.advanced": {
    "generator": {
      "statusBarVisibility": "visible",  // "visible", "compact", "icon", "hidden", or "inherit"
      "statusBarLength": 20
    }
  }
}
```

### Workspace Button (📁)

**Purpose**: Selects the active workspace from available Malterlib workspaces in your project.

**Location**: Second position in status bar  
**Displayed Text**: Workspace name in brackets (for example, `[MyProject]`).  
**Click Action**: Opens a workspace selection menu.

#### Workspace Information Display

The workspace button shows the workspace name and provides a tooltip for additional context. It does not automatically append a target count to the label.

#### Workspace Selection Features

- Smart filtering: only workspaces compatible with the currently selected generator are shown when applicable.  
- Auto-selection: if only one workspace is available it will be selected automatically.  
- Tooltip: the selection UI may show additional path or generator details when needed.

#### Multi-Workspace Projects

For projects with multiple workspace folders the status label may include workspace context to help disambiguate similar generator names.

#### Workspace Configuration

```json
{
  "malterlib.advanced": {
    "workspace": {
      "statusBarVisibility": "compact",
      "statusBarLength": 15
    }
  }
}
```

### Configuration Button (⚙️)

**Purpose**: Selects the build configuration that determines optimization level, debugging information, and preprocessor definitions.

**Location**: Third position in status bar  
**Displayed Text**: Configuration name in brackets (for example, `[Debug]`). Defaults to `[No Configuration]` when none is selected.  
**Click Action**: Opens a configuration picker.

#### Standard Configurations

**Debug**:
- No optimization (-O0)
- Full debugging information (-g)
- Debug assertions enabled
- Preprocessor: DEBUG, _DEBUG

**Release**:
- Full optimization (-O2/-O3)
- No debugging information
- Assertions disabled
- Preprocessor: NDEBUG, RELEASE

**RelWithDebInfo**:
- Optimized build with debug info
- Good for performance profiling
- Limited debugging capability

**MinSizeRel**:
- Optimized for binary size
- Useful for embedded or distribution builds

#### Custom Configurations

Projects can define custom configurations in their build description files. These will appear in the configuration picker.

#### Configuration Settings

```json
{
  "malterlib.advanced": {
    "configuration": {
      "statusBarVisibility": "visible",
      "statusBarLength": 10
    }
  }
}
```

### Target Button (🎯)

**Purpose**: Selects the specific target to build within the current workspace and configuration.

**Location**: Fourth position in status bar  
**Displayed Text**: Target name in brackets (for example, `[MyApp (exe)]`). Default is `[All Targets]`.  
**Click Action**: Opens a target selection menu.

#### Target Types

What appears in the Target menu is controlled by your build system's generated schemes. If you want specific targets to appear in the Target selector, enable scheme generation in your build descriptions so the extension can discover and present those targets. Example:

```malterlib-build
%Target "MyTarget"
{
  Target.GenerateScheme true
}
```

#### Target Display and Truncation

Labels are wrapped in brackets. When the status item visibility is set to `compact`, long labels are truncated to the configured `statusBarLength` and an ellipsis (`...`) is appended to indicate truncation.

#### Target Configuration

```json
{
  "malterlib.advanced": {
    "target": {
      "statusBarVisibility": "compact",
      "statusBarLength": 25
    }
  }
}
```

### Debug Targets Button (🐛)

**Purpose**: Configures which targets are available for debugging. Supports both single and multi-target debugging scenarios.

**Location**: Rightmost position in status bar  
**Displayed Text**: Shows selected debug targets in brackets — either the single target name (e.g., `[MyApp]`) or a count like `[2 targets]`. Default is `[No Debug Targets]`.  
**Click Action**: Opens a multi-select debug target menu.

#### Single Target Debugging

For simple debugging scenarios:
1. Click the debug targets button
2. Select a single executable target
3. Use standard VS Code debugging (F5)
4. The extension will launch the corresponding debug configuration(s) for the selected target

#### Multi-Target Debugging

For complex applications with multiple processes you can select multiple executable targets; the extension will launch multiple debug configurations at once to emulate a compound configuration.

#### Debug Target Selection Interface

The multi-select UI provides:
- Checkboxes to select/deselect targets
- Select all / Clear all conveniences in the UI
- A filter field to narrow large lists

#### Debug Configuration Generation

The extension will use the selected debug targets to launch the appropriate debugger configurations. When multiple targets are selected it launches multiple debug configurations concurrently to emulate a compound configuration rather than necessarily creating a single compound entry.

#### Debug Targets Configuration

```json
{
  "malterlib.advanced": {
    "debugTargets": {
      "statusBarVisibility": "icon",      // Show just the 🐛 icon
      "statusBarLength": 20
    }
  }
}
```

## Global Configuration

### Status Bar Visibility

Control visibility of all status bar items:

```json
{
  "malterlib.statusBarVisibility": "visible"  // Global setting
}
```

**Options**:
- `"visible"` - Show full text and icons
- `"compact"` - Show shortened text
- `"icon"` - Show icons only
- `"hidden"` - Hide all status bar items

### Per-Item Visibility and "inherit"

Each button supports a per-item visibility override. Per-item values may be one of the global values or the special value `"inherit"`, which causes the item to use the global `malterlib.statusBarVisibility`.

Example:

```json
{
  "malterlib.advanced": {
    "generator": { "statusBarVisibility": "inherit" },
    "workspace": { "statusBarVisibility": "compact" }
  }
}
```

### Status Bar Length

Each per-item section may set `statusBarLength` to control truncation when `compact` visibility is used.

## Behavior and Interaction

### Automatic Updates

Status bar controls update automatically when:
- Build files change (workspace or target descriptors)
- Project generation completes
- Configuration files are modified
- Workspace folders are added/removed

### Smart Defaults and Cascading

The extension implements intelligent selection behavior:
1. Auto-selection when only one option is available  
2. Cascading changes: selecting a generator updates available workspaces and so on  
3. Validation and correction of invalid selections
4. Persistence per workspace so selections survive restarts

### Selection Persistence

Selections are stored in VS Code workspace state and restored when possible.

### Tooltips and Context

- When text is truncated the status item tooltip includes a concise description to help identify the full selection.  
- The selection UI (picker) often shows extra details such as generated build paths to aid selection.

## Keyboard Integration

### Command Palette Access

All status bar functions are available via the Command Palette. Typical command names:

- `Malterlib: Select Generator`
- `Malterlib: Select Workspace`
- `Malterlib: Select Configuration`
- `Malterlib: Select Target`
- `Malterlib: Select Debug Targets`

### Custom Keyboard Shortcuts

Add keyboard shortcuts in `keybindings.json`.

## Troubleshooting

### Status Bar Items Not Visible

**Problem**: Status bar controls don't appear  
**Solutions**:
1. Ensure extension is activated (open a project file)
2. Check global visibility setting
3. Look for items in status bar overflow (">>" button)
4. Verify build system files exist

### Selections Not Persisting

**Problem**: Selections reset after restarting VS Code  
**Solutions**:
1. Ensure workspace is properly configured
2. Check VS Code workspace state permissions
3. Verify no conflicting workspace settings

## Integration with VS Code

### Task Integration

Status bar selections affect VS Code tasks: build tasks use the selected target, generate tasks use the selected generator, and debug tasks use debug target selection.

### Debug Integration

Debug configurations are generated based on selected debug targets, current configuration, and target output paths. The extension provides sensible defaults where possible.

The status bar provides a seamless, efficient way to control your Malterlib build system without leaving your coding flow.