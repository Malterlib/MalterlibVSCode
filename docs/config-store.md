# ConfigStore

## Overview
The ConfigStore is a directory of JSON files and scripts that tells the extension what can be built, how to build it,
and how to launch what was built. `mib generate` writes one for every generator it runs. The extension reads only
the ConfigStore: it doesn't parse `.MBuildSystem`, `.MWorkspace` or `.MTarget` files, and it runs `mib` only for the
generate tasks.

This means another build system, such as CMake, Meson, Make or a custom script, can use the status bar, the build and
tidy tasks, the debug configurations and the merged `compile_commands.json`. It does this by writing a ConfigStore of
its own. A project that writes a ConfigStore doesn't need a `.MBuildSystem` file.

## Location and Detection
A ConfigStore is at `BuildSystem/<Generator>/ConfigStore` in the root of a workspace folder. `<Generator>` is the
name shown in the generator picker. A workspace folder can have any number of them, for example one per generator or
build directory.

The extension treats a workspace folder as a Malterlib project when its root has a `*.MBuildSystem` file or a
`BuildSystem/*/ConfigStore/Generator.json` file. Either one also activates the extension. The build system
integration only runs in a trusted workspace.

## Layout
```
BuildSystem/<Generator>/
├── PostCopy.MConfig                            Optional, see PostCopy
└── ConfigStore/
    ├── Generator.json                          Required
    ├── BuildWorkspace.sh                       Optional, the Build Workspace task
    ├── BuildTarget.sh                          Optional, the Build Target task
    ├── TidyWorkspace.sh                        Optional, the Tidy Workspace task
    ├── TidyTarget.sh                           Optional, the Tidy Target task
    ├── Format.sh                               Optional, the Format task
    ├── FormatCheck.sh                          Optional, the Check Format task
    ├── FormatFile.sh                           Optional, formatting documents and selections in the editor
    └── <Workspace>/
        ├── Workspace.json                      Required for the workspace to be listed
        ├── Configs/
        │   └── <Configuration>.json            One per configuration of the workspace
        └── Targets/
            ├── <Target>.json                   Required for the target to be listed
            └── <Target>/
                ├── Configs/
                │   └── <Configuration>.json    One per configuration the target is built in
                └── <Configuration>/
                    └── compile_commands.json   Optional, the target's compile commands
```

Directory and file names are identifiers:
- `<Workspace>` is the workspace name in the workspace picker and the first argument of every script.
- `<Target>` is the target name in the target and debug target pickers.
- `<Configuration>` is the configuration name in the configuration picker, without `.json`. Malterlib uses
  `<Platform> <Architecture> <Configuration>`, for example `macOS arm64 Debug`. A workspace configuration and the
  target configurations it builds must use the same name.

All JSON files are UTF-8. Unknown fields are ignored. Paths should be absolute.

## Generator.json
Describes the generator. For another build system, `{}` is enough.

| Field | Type | Used for |
|-------|------|----------|
| `priority` | number | Choosing the default generator when there are several. The highest wins. Malterlib uses `MalterlibGeneratorIDEPriority`. |
| `buildSystemBasePath` | string | The working directory of the scripts and the default working directory of launched programs. It's also the value of `MalterlibWorkspaceRoot` (see Scripts). Defaults to the workspace folder. |
| `outputDir` | string | The `BuildSystemDir` argument of the scripts. Defaults to the absolute path of `BuildSystem/<Generator>`. |
| `buildSystemFile` | string | mib only: the `.MBuildSystem` file passed to `mib generate --build-system`. |
| `generator` | string | mib only: the generator passed to `mib generate --generator`, for example `Ninja`. |
| `generatorFamily` | string | Informational: `Ninja`, `Xcode` or `VisualStudio` for mib. |

The **Generate Workspace** and **Generate All** tasks run `./mib generate` in the workspace folder. They are only
offered when `buildSystemFile`, `generator` and `outputDir` are all set, which in practice means mib wrote the
ConfigStore.

## Workspace.json
The presence of this file is what makes `<Workspace>` a workspace.

| Field | Type | Used for |
|-------|------|----------|
| `priority` | number | Choosing the default workspace. The highest wins. Malterlib uses `Workspace.IDEPriority`. |
| `name` | string | Informational: the workspace's identity in the build system. |

## Workspace Configurations: `<Workspace>/Configs/<Configuration>.json`
Describes one configuration of the workspace. The Build Workspace and Tidy Workspace tasks need it.

| Field | Type | Used for |
|-------|------|----------|
| `platform` | string | The `Platform` argument of the scripts, for example `macOS`. |
| `architecture` | string | The `Architecture` argument of the scripts, for example `arm64`. |
| `configuration` | string | The `Configuration` argument of the scripts, for example `Release Testing`. |
| `configurationPriority` | number | Choosing the default configuration. The highest wins. |
| `defaultBuildTarget` | string | The target that is selected by default. Without it, **All Targets** is selected. |
| `defaultDebugTargets` | string[] | The targets that are launched by default. When empty, the single target with the highest `debugPriority` in this configuration is used. |
| `ninjaFile` | string | The absolute path of the `build.ninja` that builds the configuration. It enables **Malterlib: Build Current File**, see Building a Single File. mib writes it for the Ninja generator. |

The configuration picker lists the configurations that at least one target has. A configuration that only exists at
the workspace level isn't listed.

## Targets: `<Workspace>/Targets/<Target>.json`
The presence of this file is what makes `<Target>` a target of the workspace.

| Field | Type | Used for |
|-------|------|----------|
| `priority` | number | The order of the targets in the pickers, highest first, and so which target's entry comes first when several targets compile the same file. |
| `name` | string | Informational: the target's identity in the build system. |

## Target Configurations: `<Workspace>/Targets/<Target>/Configs/<Configuration>.json`
Describes the target in one configuration: how to build it, how to launch it and where its compile commands are.

| Field | Type | Used for |
|-------|------|----------|
| `platform` | string | The `Platform` argument of the target scripts. Falls back to the workspace configuration's value. |
| `architecture` | string | The `Architecture` argument of the target scripts. Falls back to the workspace configuration's value. |
| `configuration` | string | The `Configuration` argument of the target scripts. Falls back to the workspace configuration's value. |
| `targetName` | string | The `Target` argument of `BuildTarget.sh`, when the build tool knows the target by another name. Defaults to `<Target>`. The tidy scripts always get `<Target>`. |
| `generateScheme` | boolean | `false` hides the target from the build target picker, for targets that can't be built on their own. Defaults to `true`. |
| `debugPriority` | number | Choosing the default debug target, see `defaultDebugTargets`. |
| `localDebuggerCommand` | string | The program to launch. A target without one isn't listed in the debug target pickers. |
| `localDebuggerWorkingDirectory` | string | The working directory of the program. Defaults to `buildSystemBasePath`. |
| `debuggerCommandArguments` | string[] | The program's arguments. |
| `remoteDebuggerCommand` | string | The program to launch when there's no `localDebuggerCommand`, for example a copy on a remote machine. Such a target can only be launched as a default debug target. |
| `remoteDebuggerWorkingDirectory` | string | The working directory for `remoteDebuggerCommand`. |
| `compileCommands` | string | The absolute path of the target's `compile_commands.json`, see Compile Commands. |
| `postCopyProject`, `postCopyProject2`, `postCopyDestination` | string | Where the target is deployed, see PostCopy. |

mib also writes `postCopySource` and `postCopyConfig`, which the extension doesn't read.

The selected debug targets are launched with CodeLLDB (debug type `lldb`). Run and Debug offers them as dynamic
configurations, and `.vscode/malterlib.json` can add launches with other programs, arguments or environments. See
[Debug Configuration](debug-configuration.md).

## Scripts
The scripts in the ConfigStore root are run by the tasks of the same name. A task is only offered when its script
exists. Each script must be executable and is run by the task shell as `<script> <arguments>`. On Windows the script path is converted to a Git Bash path (`/c/...`), so the task shell
should be Git Bash.

| Script | Arguments |
|--------|-----------|
| `BuildWorkspace.sh` | `Workspace Platform Architecture Configuration BuildSystemDir` |
| `BuildTarget.sh` | `Workspace Target Platform Architecture Configuration BuildSystemDir` |
| `TidyWorkspace.sh` | `Workspace Platform Architecture Configuration BuildSystemDir` |
| `TidyTarget.sh` | `Workspace Target Platform Architecture Configuration BuildSystemDir` |
| `Format.sh` | `Workspace Platform Architecture Configuration BuildSystemDir` |
| `FormatCheck.sh` | `Workspace Platform Architecture Configuration BuildSystemDir` |

- `Workspace` is `<Workspace>`.
- `Target` is the target configuration's `targetName` for `BuildTarget.sh`, and `<Target>` for `TidyTarget.sh`.
- `Platform`, `Architecture` and `Configuration` come from the target configuration for the target scripts, and from
  the workspace configuration for the workspace scripts.
- `BuildSystemDir` is `outputDir` from `Generator.json`, or its default.

The working directory is `buildSystemBasePath`. The environment has `MalterlibWorkspaceRoot` set to
`buildSystemBasePath`.

The build tasks parse these formats into the Problems panel, with absolute paths:
- clang and gcc style: `/path/file.cpp:12:5: error: message`
- MSVC and clang-cl style: `C:\path\file.cpp(12,5): error C1234: message`
- Linker errors from `ld`, `ld64.lld`, `lld-link` and `clang++`, with `>>> referenced by` locations

The tidy tasks parse the clang style. The format tasks parse `/path/file.cpp:12:5: rule: explanation` and
`/path/file.cpp:12: line length 130 exceeds max_line_length = 120`, which are what a format run can't fix, as well as the
clang style for the build system's own errors. The scripts generated by mib run `mib generate` first, so the build
system is up to date, and then build with Ninja, Xcode or MSBuild, or run `mib tidy`. `Format.sh` runs `mib format` and
`FormatCheck.sh` runs `mib format --check`, which format, or check, every repository that sets `Repository.Format`.

## Building a Single File
**Malterlib: Build Current File** builds the object file of the active document in the selected workspace and
configuration, when the workspace configuration names its `ninjaFile`. It runs the Build File task, which is
`BuildTarget.sh` with the object file as the `Target` argument. The object file comes from the `output` of the
document's entry in the compile commands of the workspace's targets. It's passed as Ninja names it: an absolute `output`
as is, and a relative one relative to the directory of the `ninjaFile`. `BuildTarget.sh` has to build any output of the
`ninjaFile` it's given as a target, which a Ninja `BuildTarget.sh` does by passing it on to Ninja.

A header, or a file the configuration doesn't compile, builds the object of a source file that includes it. The objects
that include it are found in Ninja's deps log, `.ninja_deps` in the `builddir` of the `ninjaFile`, or of the files it
includes, or in its directory without one. The relative paths in it, and a relative `builddir`, are relative to the directory of the `ninjaFile`, where
Ninja runs when the build runs it with `ninja -C`, as mib and CMake builds do. So a header is only built once one of its
includers has been. Of the source files that include it, the one
whose editor was active most recently is built, then one open in the editor, then one of the selected target.

## Formatting in the Editor
**Format Document** and **Format Selection** run `FormatFile.sh` for C, C++, Objective-C and Malterlib build files in
the project. Formatting on save, paste and type uses it too when the Malterlib extension is the default formatter
(`editor.defaultFormatter` is `Malterlib.malterlib`). The selected generator's script is used, or the one of the
generator with the highest priority that has one.

```
FormatFile.sh File [Offset Length]
```

- The document is written to stdin, and may have unsaved changes. `File` is its absolute path, which the formatting
  settings are resolved from as if the document were saved there.
- `Offset` and `Length` select the range to format, in UTF-8 bytes of stdin. Without them the whole document is
  formatted.
- The script writes the whole formatted document to stdout, and leaves the file alone.
- The exit code is 0 when it wrote the document. It's 1 when it wrote the document but violations without an automatic
  fix remain, which it describes on stderr and the extension logs in the Malterlib output. It's 3 when the file doesn't
  opt in to formatting, and anything else is an error, described on stderr.

The working directory and environment are the same as for the other scripts. mib's script runs
`MTool Format --stdin`, which formats the files that opt in with `malterlib_format` in `.editorconfig`.

## Compile Commands
The extension merges the `compile_commands.json` files of the selected workspace and configuration. The result is
written to `compile_commands.json` in the root of the workspace folder for clangd. When several targets compile the
same file, the selected target's entry comes first. The targets of the generator's other workspaces only add files
that the selected workspace doesn't compile. They use the same configuration when they have it, and otherwise
another one.

The files are found through the `compileCommands` field of the target configurations, and can be anywhere. The
extension merges again when one of them is created, changed or deleted. mib writes them to
`ConfigStore/<Workspace>/Targets/<Target>/<Configuration>/compile_commands.json`, which one watcher covers for the
whole ConfigStore. Every file elsewhere gets a watcher of its own. While its directory doesn't exist, for example
before the first build, the closest existing parent directory is watched instead.

When a target's `compileCommands` is the `compile_commands.json` in the root of the workspace folder itself, such as
that of an in-source CMake build, the build system writes it, and the extension leaves it alone instead of merging.

## PostCopy
`BuildSystem/<Generator>/PostCopy.MConfig` lists where deployable projects are copied after the build. The debug
configuration editor uses it to offer launch configurations for the deployed copies. The format is Malterlib's
registry format:

```
Projects
{
	MyApp
	{
		Destination "/opt/Deploy/MyApp"
		Destination "/Volumes/Remote/MyApp"
	}
}
```

A target configuration with `postCopyProject` `MyApp` and `postCopyDestination` `bin` gets
`/opt/Deploy/MyApp/bin` and `/Volumes/Remote/MyApp/bin`. Other build systems can leave the file out.

## Change Detection
The extension watches the ConfigStore and rescans the part that changed. Every JSON file and directory of the
layout is watched, as is `PostCopy.MConfig`, including files that are rewritten in place. Changes are coalesced, so a
build system can write or rewrite the whole ConfigStore at once. The scripts aren't watched; they are looked up when
the tasks are listed.

## Example: a CMake Project
This ConfigStore exposes a CMake project with one workspace, `App`, and two configurations, `Debug` and `Release`. It
has one launchable target, `MyApp`, and one library, `MyLib`. Each configuration is configured into `build/<Config>`
with `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`.

```
BuildSystem/CMake/ConfigStore/
├── Generator.json
├── BuildWorkspace.sh
├── BuildTarget.sh
└── App/
    ├── Workspace.json
    ├── Configs/
    │   ├── macOS arm64 Debug.json
    │   └── macOS arm64 Release.json
    └── Targets/
        ├── MyApp.json
        ├── MyApp/Configs/macOS arm64 Debug.json
        ├── MyApp/Configs/macOS arm64 Release.json
        ├── MyLib.json
        ├── MyLib/Configs/macOS arm64 Debug.json
        └── MyLib/Configs/macOS arm64 Release.json
```

`Generator.json`:
```json
{
	"buildSystemBasePath": "/path/to/project"
}
```

`App/Workspace.json` is `{}`.

`App/Configs/macOS arm64 Debug.json`:
```json
{
	"platform": "macOS",
	"architecture": "arm64",
	"configuration": "Debug",
	"configurationPriority": 100,
	"defaultBuildTarget": "MyApp",
	"defaultDebugTargets": ["MyApp"]
}
```

`App/Targets/MyApp.json` and `App/Targets/MyLib.json` are `{}`.

`App/Targets/MyApp/Configs/macOS arm64 Debug.json`:
```json
{
	"platform": "macOS",
	"architecture": "arm64",
	"configuration": "Debug",
	"localDebuggerCommand": "/path/to/project/build/Debug/MyApp",
	"localDebuggerWorkingDirectory": "/path/to/project",
	"debuggerCommandArguments": ["--verbose"],
	"compileCommands": "/path/to/project/build/Debug/compile_commands.json"
}
```

`App/Targets/MyLib/Configs/macOS arm64 Debug.json` only has `platform`, `architecture` and `configuration`. CMake
writes one `compile_commands.json` for all targets, so it's enough for one target to have it. The Release files are
the same with `Release`.

`BuildWorkspace.sh`:
```bash
#!/bin/bash
# BuildWorkspace.sh Workspace Platform Architecture Configuration BuildSystemDir
set -e
cmake -G Ninja -S . -B "build/$4" -DCMAKE_BUILD_TYPE="$4" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build "build/$4"
```

`BuildTarget.sh`:
```bash
#!/bin/bash
# BuildTarget.sh Workspace Target Platform Architecture Configuration BuildSystemDir
set -e
cmake -G Ninja -S . -B "build/$5" -DCMAKE_BUILD_TYPE="$5" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build "build/$5" --target "$2"
```

Make both scripts executable with `chmod +x`. The ConfigStore is usually written by a script of the project, so it
can be regenerated when targets are added. It's also usually ignored by version control, because it holds absolute
paths.

## Related Documentation
- [Build Integration](build-integration.md) - Tasks and problem matchers
- [Status Bar Controls](status-bar.md) - Selecting the generator, workspace, configuration and targets
- [Debug Configuration](debug-configuration.md) - Launching the selected debug targets
