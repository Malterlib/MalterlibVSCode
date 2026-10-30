import * as vscode from 'vscode';
import { StatusBar } from './statusBar';
import { BuildSystemScanner, GeneratorInfo, WorkspaceInfo } from './buildSystemScanner';
import { MalterlibProjectDetector } from './malterlibProject';
import { CompileCommandsGenerator, CompileCommandsInput } from './compileCommandsGenerator';

export interface SelectionChangeEvent {
  generator: string | null;
  workspace: string | null;
  configuration: string | null;
  target: string | null;
  debugTargets: string[];
}

interface CompileCommandsSelection {
  workspaceFolder: vscode.WorkspaceFolder;
  generator: GeneratorInfo;
  workspace: WorkspaceInfo;
  configuration: string;
  target: string | undefined;
}

export class StatusBarController implements vscode.Disposable {
  private readonly statusBar: StatusBar;
  private readonly output: vscode.OutputChannel;
  private readonly workspaceState: vscode.Memento;
  private readonly disposables: vscode.Disposable[] = [];

  // Current selections
  private currentGenerator: string | null = null;
  private currentWorkspace: string | null = null;
  private currentConfiguration: string | null = null;
  private currentTarget: string | null = null;
  private currentDebugTargets: string[] = [];
  private selectedWorkspaceFolder: vscode.WorkspaceFolder | null = null;
  private compileCommandsWatcher: vscode.Disposable | null = null;
  private compileCommandsWatcherPath: string | null = null;
  // Watchers of merged compile_commands.json files outside the ConfigStore layout, by input key
  private compileCommandsInputWatchers = new Map<string, { bases: string; watcher: vscode.Disposable }>();
  private compileCommandsTimer: NodeJS.Timeout | null = null;
  // The keys of the compile_commands.json files that changed since the last check, see onCompileCommandsFileChanged
  private changedCompileCommandsKeys = new Set<string>();
  private changedCompileCommandsTimer: NodeJS.Timeout | null = null;
  // Selection and per-target inputs of the last requested compile_commands.json merge
  private compileCommandsSignature: string | null = null;
  private compileCommandsInputKeys = new Set<string>();
  // The key of each input of the last merge, by its workspace, target and configuration, see getCompileCommandsInputKeyMap
  private compileCommandsInputKeyMap = new Map<string, string>();
  private cascadeAutoSelectionTimer: NodeJS.Timeout | null = null;
  private lastLoggedMessage: string | null = null;

  // Event emitter for selection changes
  private onSelectionChangedEmitter = new vscode.EventEmitter<SelectionChangeEvent>();
  readonly onSelectionChanged = this.onSelectionChangedEmitter.event;

  private static readonly WORKSPACE_FOLDER_KEY = 'malterlib.selectedWorkspaceFolder';
  private static readonly GENERATOR_KEY = 'malterlib.selectedGenerator';
  private static readonly WORKSPACE_KEY = 'malterlib.selectedWorkspace';
  private static readonly CONFIGURATION_KEY = 'malterlib.selectedConfiguration';
  private static readonly TARGET_KEY = 'malterlib.selectedTarget';
  private static readonly DEBUG_TARGETS_KEY = 'malterlib.selectedDebugTargets';

  constructor(statusBar: StatusBar, output: vscode.OutputChannel, workspaceState: vscode.Memento) {
    this.statusBar = statusBar;
    this.output = output;
    this.workspaceState = workspaceState;
    CompileCommandsGenerator.setOutputChannel(output);

    // Update status bar and validate selections on scanning changes
    this.disposables.push(
      BuildSystemScanner.onDidChangeScanningAsync(async () => {
        this.statusBar.update();
        this.restoreSelections();

        // Debounce cascadeAutoSelection to allow old selections to be restored first
        if (this.cascadeAutoSelectionTimer)
          clearTimeout(this.cascadeAutoSelectionTimer);

        this.cascadeAutoSelectionTimer = setTimeout(() => {
          this.cascadeAutoSelection();
          this.cascadeAutoSelectionTimer = null;

          // A rescan may add, remove or retarget the per-target files that make up compile_commands.json
          this.generateCompileCommandsIfInputsChanged();
        }, 500); // 500ms delay
      })
    );

    // Register commands
    this.registerCommands();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.compileCommandsWatcher?.dispose();
    this.compileCommandsWatcher = null;
    this.setCompileCommandsInputWatchers([]);
    if (this.compileCommandsTimer) {
      clearTimeout(this.compileCommandsTimer);
      this.compileCommandsTimer = null;
    }
    this.clearChangedCompileCommands();
    if (this.cascadeAutoSelectionTimer) {
      clearTimeout(this.cascadeAutoSelectionTimer);
      this.cascadeAutoSelectionTimer = null;
    }
    this.onSelectionChangedEmitter.dispose();
  }

  // Setter functions that trigger events
  private setGenerator(value: string | null): void {
    if (this.currentGenerator !== value) {
      this.currentGenerator = value;
      this.fireSelectionChange();
    }
  }

  private setWorkspace(value: string | null): void {
    if (this.currentWorkspace !== value) {
      this.currentWorkspace = value;
      this.fireSelectionChange();
    }
  }

  private setConfiguration(value: string | null): void {
    if (this.currentConfiguration !== value) {
      this.currentConfiguration = value;
      this.fireSelectionChange();
    }
  }

  private setTarget(value: string | null): void {
    if (this.currentTarget !== value) {
      this.currentTarget = value;
      this.fireSelectionChange();
    }
  }

  private setDebugTargets(value: string[]): void {
    const changed = JSON.stringify(this.currentDebugTargets) !== JSON.stringify(value);
    if (changed) {
      this.currentDebugTargets = value;
      this.fireSelectionChange();
    }
  }

  private fireSelectionChange(): void {
    this.onSelectionChangedEmitter.fire({
      generator: this.currentGenerator,
      workspace: this.currentWorkspace,
      configuration: this.currentConfiguration,
      target: this.currentTarget,
      debugTargets: [...this.currentDebugTargets]
    });
  }

  public initializeAutoSelection(): void {
    // Try to restore previous selections first
    this.restoreSelections();
    this.cascadeAutoSelection();
  }

  private logOnce(message: string): void {
    if (message !== this.lastLoggedMessage) {
      this.lastLoggedMessage = message;
      this.output.appendLine(message);
    }
  }

  private restoreSelections(): void {
    // Restore saved workspace folder path
    const savedWorkspacePath = this.workspaceState.get<string>(StatusBarController.WORKSPACE_FOLDER_KEY);
    if (savedWorkspacePath && vscode.workspace.workspaceFolders) {
      const foundWorkspace = vscode.workspace.workspaceFolders.find(ws => ws.uri.fsPath === savedWorkspacePath);
      if (foundWorkspace && MalterlibProjectDetector.isMalterlibProject(foundWorkspace))
        this.selectedWorkspaceFolder = foundWorkspace;
      else {
        this.selectedWorkspaceFolder = null;
        if (savedWorkspacePath)
          this.logOnce(`Saved workspace folder no longer valid: ${savedWorkspacePath}`);
      }
    }

    // Restore other selections with validation
    const savedGenerator = this.workspaceState.get<string>(StatusBarController.GENERATOR_KEY) || null;
    const savedWorkspace = this.workspaceState.get<string>(StatusBarController.WORKSPACE_KEY) || null;
    const savedConfiguration = this.workspaceState.get<string>(StatusBarController.CONFIGURATION_KEY) || null;
    const savedTarget = this.workspaceState.get<string>(StatusBarController.TARGET_KEY) || null;
    const savedDebugTargets = this.workspaceState.get<string[]>(StatusBarController.DEBUG_TARGETS_KEY) || [];

    // Validate generator exists
    if (savedGenerator && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      if (generators.some(g => g.name === savedGenerator))
        this.setGenerator(savedGenerator);
      else {
        this.logOnce(`Saved generator '${savedGenerator}' no longer exists`);
        this.setGenerator(null);
      }
    } else
      this.setGenerator(null);

    // Validate workspace exists
    if (this.currentGenerator && savedWorkspace && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
      if (selectedGenerator) {
        const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
        if (workspaces.some(w => w.name === savedWorkspace))
          this.setWorkspace(savedWorkspace);
        else {
          this.logOnce(`Saved workspace '${savedWorkspace}' no longer exists`);
          this.setWorkspace(null);
        }
      }
    } else
      this.setWorkspace(null);

    // Validate configuration exists
    if (this.currentGenerator && this.currentWorkspace && savedConfiguration && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
      if (selectedGenerator) {
        const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
        const selectedWorkspace = workspaces.find(w => w.name === this.currentWorkspace);
        if (selectedWorkspace) {
          const configurations = BuildSystemScanner.getWorkspaceConfigurations(selectedWorkspace.path);
          if (configurations.some(c => c.name === savedConfiguration))
            this.setConfiguration(savedConfiguration);
          else {
            this.logOnce(`Saved configuration '${savedConfiguration}' no longer exists`);
            this.setConfiguration(null);
          }
        }
      }
    } else
      this.setConfiguration(null);

    // Validate target exists and is buildable for the current configuration
    if (this.currentGenerator && this.currentWorkspace && savedTarget && this.selectedWorkspaceFolder) {
      if (savedTarget === 'All Targets')
        this.setTarget(savedTarget);
      else {
        const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
        const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
        if (selectedGenerator) {
          const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
          const selectedWorkspace = workspaces.find(w => w.name === this.currentWorkspace);
          if (selectedWorkspace) {
            const targets = BuildSystemScanner.getTargets(selectedWorkspace.path);
            const t = targets.find(x => x.name === savedTarget);
            const cfg = this.currentConfiguration ? t?.configurations?.get(this.currentConfiguration) : undefined;
            const buildable = cfg ? (cfg.generateScheme !== false) : true;
            if (t && buildable)
              this.setTarget(savedTarget);
            else {
              this.logOnce(`Saved target '${savedTarget}' no longer exists or is not buildable for the current configuration`);
              this.setTarget(null);
            }
          }
        }
      }
    } else
      this.setTarget(null);

    // Validate debug targets exist and have a local debugger for the current configuration
    if (this.currentGenerator && this.currentWorkspace && savedDebugTargets.length > 0 && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
      if (selectedGenerator) {
        const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
        const selectedWorkspace = workspaces.find(w => w.name === this.currentWorkspace);
        if (selectedWorkspace) {
          const targets = BuildSystemScanner.getTargets(selectedWorkspace.path);
          const targetNames = new Set(targets.map(t => t.name));
          const cfgName = this.currentConfiguration;
          const debuggable = new Set(
            cfgName ? targets.filter(t => !!t.configurations?.get(cfgName)?.localDebuggerCommand).map(t => t.name) : targets.map(t => t.name)
          );
          const validDebugTargets = savedDebugTargets.filter(t => targetNames.has(t) && debuggable.has(t));
          if (validDebugTargets.length > 0) {
            this.setDebugTargets(validDebugTargets);
            if (validDebugTargets.length < savedDebugTargets.length) {
              const invalidTargets = savedDebugTargets.filter(t => !targetNames.has(t) || !debuggable.has(t));
              this.logOnce(`Some saved debug targets no longer exist or lack a local debugger: ${invalidTargets.join(', ')}`);
            }
          } else {
            this.logOnce(`None of the saved debug targets exist or have a local debugger anymore`);
            this.setDebugTargets([]);
          }
        } else
          this.setDebugTargets([]);
      } else
        this.setDebugTargets([]);
    } else
      this.setDebugTargets([]);

    if (this.currentGenerator) {
      // Update status bar with restored values
      const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
      const generatorLabel = this.getGeneratorLabel(this.currentGenerator);
      const generatorText = hasMultipleWorkspaces && this.selectedWorkspaceFolder
        ? `${this.selectedWorkspaceFolder.name} / ${generatorLabel}`
        : generatorLabel;

      this.statusBar.setGeneratorText(generatorText);
      this.statusBar.setGeneratorTooltip(this.selectedWorkspaceFolder
        ? `Current generator: ${generatorLabel} (${this.selectedWorkspaceFolder.name})`
        : `Current generator: ${generatorLabel}`);

      if (this.currentWorkspace) {
        this.statusBar.setWorkspaceText(this.currentWorkspace);
        this.statusBar.setWorkspaceTooltip(this.selectedWorkspaceFolder
          ? `Current workspace: ${this.currentWorkspace} (${this.selectedWorkspaceFolder.name})`
          : `Current workspace: ${this.currentWorkspace}`);
      } else
        this.statusBar.setWorkspaceText('No Workspace');

      if (this.currentConfiguration) {
        // Look up the configuration display name
        let displayName = this.currentConfiguration;
        if (this.selectedWorkspaceFolder && this.currentGenerator && this.currentWorkspace) {
          const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
          const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
          if (selectedGenerator) {
            const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
            const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
            if (selectedWorkspaceInfo) {
              const configurations = BuildSystemScanner.getWorkspaceConfigurations(selectedWorkspaceInfo.path);
              const config = configurations.find(c => c.name === this.currentConfiguration);
              if (config)
                displayName = `${config.platform} ${config.architecture} ${config.configuration}`;
            }
          }
        }
        this.statusBar.setConfigurationText(displayName);
        this.statusBar.setConfigurationTooltip(this.selectedWorkspaceFolder
          ? `Current configuration: ${displayName} (${this.selectedWorkspaceFolder.name})`
          : `Current configuration: ${displayName}`);
      } else
        this.statusBar.setConfigurationText('No Configuration');

      if (this.currentTarget) {
        this.statusBar.setTargetText(this.currentTarget);
        this.statusBar.setTargetTooltip(this.selectedWorkspaceFolder
          ? `Current target: ${this.currentTarget} (${this.selectedWorkspaceFolder.name})`
          : `Current target: ${this.currentTarget}`);
      } else
        this.statusBar.setTargetText('All Targets');

      if (this.currentDebugTargets.length > 0) {
        const text = this.currentDebugTargets.length === 1 ? this.currentDebugTargets[0] : `${this.currentDebugTargets.length} targets`;
        this.statusBar.setDebugTargetsText(text);
        this.statusBar.setDebugTargetsTooltip(this.selectedWorkspaceFolder
          ? `Debug targets: ${this.currentDebugTargets.join(', ')} (${this.selectedWorkspaceFolder.name})`
          : `Debug targets: ${this.currentDebugTargets.join(', ')}`);
      } else
        this.statusBar.setDebugTargetsText('No Debug Targets');
    }
  }

  private async saveSelections(): Promise<void> {
    // Save workspace folder path
    if (this.selectedWorkspaceFolder)
      await this.workspaceState.update(StatusBarController.WORKSPACE_FOLDER_KEY, this.selectedWorkspaceFolder.uri.fsPath);
    else
      await this.workspaceState.update(StatusBarController.WORKSPACE_FOLDER_KEY, undefined);

    // Save other selections
    await this.workspaceState.update(StatusBarController.GENERATOR_KEY, this.currentGenerator);
    await this.workspaceState.update(StatusBarController.WORKSPACE_KEY, this.currentWorkspace);
    await this.workspaceState.update(StatusBarController.CONFIGURATION_KEY, this.currentConfiguration);
    await this.workspaceState.update(StatusBarController.TARGET_KEY, this.currentTarget);
    await this.workspaceState.update(StatusBarController.DEBUG_TARGETS_KEY, this.currentDebugTargets);

    // Clear logged messages since we have new valid selections
    this.lastLoggedMessage = null;
  }

  public getSelectionSnapshot(): { generator: string | null; workspace: string | null; configuration: string | null; target: string | null } {
    return {
      generator: this.currentGenerator,
      workspace: this.currentWorkspace,
      configuration: this.currentConfiguration,
      target: this.currentTarget
    };
  }

  public getDebugTargetsSnapshot(): string[] {
    return [...this.currentDebugTargets];
  }

  public getSelectedWorkspaceFolder(): vscode.WorkspaceFolder | null {
    return this.selectedWorkspaceFolder;
  }

  public cascadeAutoSelection(fallbacks?: {
    generator?: string;
    workspace?: string;
    configuration?: string;
    target?: string;
    debugTargets?: string[];
  }): void {
    // Use the selected workspace folder if available, otherwise fall back to active
    const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
    if (!workspace) return;

    // 1. Generator auto-selection
    if (!this.currentGenerator) {
      const generators = BuildSystemScanner.getGenerators(workspace);
      if (generators.length === 0) {
        this.output.appendLine('No generators found - stopping auto-selection');
        return;
      }

      const defaultGenerator = BuildSystemScanner.getDefaultGenerator(workspace, fallbacks?.generator);
      if (defaultGenerator) {
        this.setGenerator(defaultGenerator.name);
        this.selectedWorkspaceFolder = workspace;

        // Only show workspace name if there are multiple workspace folders
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
        const generatorText = hasMultipleWorkspaces
          ? `${workspace.name} / ${defaultGenerator.label}`
          : defaultGenerator.label;

        this.statusBar.setGeneratorText(generatorText);
        this.statusBar.setGeneratorTooltip(`Auto-selected generator: ${defaultGenerator.label} (${workspace.name})`);
        this.output.appendLine(`Auto-selected generator: ${defaultGenerator.label} in ${workspace.name}`);
      } else {
        this.output.appendLine('Multiple generators available - manual selection required');
        return;
      }
    }

    // 2. Workspace auto-selection
    if (!this.currentWorkspace) {
      if (!this.currentGenerator) {
        this.output.appendLine('No generator selected - cannot auto-select workspace');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) {
        this.output.appendLine('Selected generator not found - stopping auto-selection');
        return;
      }

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      if (workspaces.length === 0) {
        this.output.appendLine('No workspaces found - stopping auto-selection');
        return;
      }

      const defaultWorkspace = BuildSystemScanner.getDefaultWorkspace(selectedGenerator.path, fallbacks?.workspace);
      if (defaultWorkspace) {
        this.setWorkspace(defaultWorkspace.name);
        this.statusBar.setWorkspaceText(defaultWorkspace.name);
        this.statusBar.setWorkspaceTooltip(`Auto-selected workspace: ${defaultWorkspace.name} (${workspace.name})`);
        this.output.appendLine(`Auto-selected workspace: ${defaultWorkspace.name}`);
      } else {
        this.output.appendLine('Multiple workspaces available - manual selection required');
        return;
      }
    }

    // 3. Configuration auto-selection
    if (!this.currentConfiguration) {
      if (!this.currentGenerator || !this.currentWorkspace) {
        this.output.appendLine('Generator or workspace not selected - cannot auto-select configuration');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;

      const configurations = BuildSystemScanner.getWorkspaceConfigurations(selectedWorkspaceInfo.path);
      if (configurations.length === 0) {
        this.output.appendLine('No configurations found - stopping auto-selection');
        return;
      }

      const defaultConfiguration = BuildSystemScanner.getDefaultConfiguration(selectedWorkspaceInfo.path, fallbacks?.configuration);
      if (defaultConfiguration) {
        this.setConfiguration(defaultConfiguration.name);
        const displayName = `${defaultConfiguration.platform} ${defaultConfiguration.architecture} ${defaultConfiguration.configuration}`;
        this.statusBar.setConfigurationText(displayName);
        this.statusBar.setConfigurationTooltip(`Auto-selected configuration: ${displayName} (${workspace.name})`);
        this.output.appendLine(`Auto-selected configuration: ${displayName}`);
      } else {
        this.output.appendLine('Multiple configurations available - manual selection required');
        return;
      }
    }

    // 4. Target auto-selection
    if (!this.currentTarget) {
      if (!this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
        this.output.appendLine('Prerequisites not met - cannot auto-select target');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;

      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const defaultBuildTarget = BuildSystemScanner.getDefaultBuildTarget(selectedWorkspaceInfo.path, this.currentConfiguration);
      const targetNames = targets.map(t => t.name);

      if (fallbacks?.target && (fallbacks.target === 'All Targets' || (targetNames.includes(fallbacks.target) && (() => { const t = targets.find(x => x.name === fallbacks.target); const cfg = t?.configurations?.get(this.currentConfiguration!); return cfg?.generateScheme !== false; })()))) {
        this.setTarget(fallbacks.target);
        this.statusBar.setTargetText(fallbacks.target);
        this.statusBar.setTargetTooltip(`Preserved target: ${fallbacks.target} (${workspace.name})`);
        this.output.appendLine(`Preserved target: ${fallbacks.target} (from previous selection)`);
      } else if (targets.length === 0) {
        this.setTarget('All Targets');
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setTargetTooltip(`Auto-selected target: All Targets (${workspace.name})`);
        this.output.appendLine('Auto-selected target: All Targets (no specific targets)');
      } else if (defaultBuildTarget && targets.some(t => t.name === defaultBuildTarget) && (() => { const t = targets.find(x => x.name === defaultBuildTarget); const cfg = t?.configurations?.get(this.currentConfiguration!); return cfg?.generateScheme !== false; })()) {
        this.setTarget(defaultBuildTarget);
        this.statusBar.setTargetText(defaultBuildTarget);
        this.statusBar.setTargetTooltip(`Auto-selected target: ${defaultBuildTarget} (${workspace.name})`);
        this.output.appendLine(`Auto-selected target: ${defaultBuildTarget} (default build target)`);
      } else {
        this.setTarget('All Targets');
        this.output.appendLine('Auto-selected target: All Targets (no specific targets)');
      }
    }

    // 5. Debug target auto-selection
    if (this.currentDebugTargets.length === 0) {
      if (!this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
        this.output.appendLine('Prerequisites not met - cannot auto-select debug targets');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;

      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const targetNames = targets.map(t => t.name);

      if (fallbacks?.debugTargets && fallbacks.debugTargets.length > 0) {
        const cfgName = this.currentConfiguration!;
        const validFallbacks = fallbacks.debugTargets.filter(name => {
          const t = targets.find(x => x.name === name);
          return !!t && !!t.configurations?.get(cfgName)?.localDebuggerCommand;
        });
        if (validFallbacks.length > 0) {
          this.setDebugTargets([...validFallbacks]);
          const text = validFallbacks.length === 1 ? validFallbacks[0] : `${validFallbacks.length} targets`;
          this.statusBar.setDebugTargetsText(text);
          this.statusBar.setDebugTargetsTooltip(`Debug targets: ${validFallbacks.join(', ')} (${workspace.name})`);
          this.output.appendLine(`Preserved debug targets: ${validFallbacks.join(', ')} (from previous selection)`);
          return;
        }
      }

      const debuggableSet = new Set<string>(
        targets
          .filter(t => !!t.configurations?.get(this.currentConfiguration!)?.localDebuggerCommand)
          .map(t => t.name)
      );
      const defaultDebugTargets = BuildSystemScanner
        .getDefaultDebugTargets(selectedWorkspaceInfo.path, this.currentConfiguration)
        .filter(name => debuggableSet.has(name));
      const workspaceConfig = BuildSystemScanner.getWorkspaceConfiguration(selectedWorkspaceInfo.path, this.currentConfiguration);
      const explicitTargets = workspaceConfig?.defaultDebugTargets || [];

      if (defaultDebugTargets.length > 0) {
        this.setDebugTargets([...defaultDebugTargets]);
        const text = defaultDebugTargets.length === 1 ? defaultDebugTargets[0] : `${defaultDebugTargets.length} targets`;
        this.statusBar.setDebugTargetsText(text);
        this.statusBar.setDebugTargetsTooltip(`Debug targets: ${defaultDebugTargets.join(', ')} (${workspace.name})`);

        if (explicitTargets.length > 0)
          this.output.appendLine(`Auto-selected explicit default debug targets: ${defaultDebugTargets.join(', ')}`);
        else
          this.output.appendLine(`Auto-selected debug targets via priority: ${defaultDebugTargets.join(', ')}`);
      } else {
        const debuggableTargets = targets.filter(t => !!t.configurations?.get(this.currentConfiguration!)?.localDebuggerCommand);
        if (debuggableTargets.length === 1) {
          this.setDebugTargets([debuggableTargets[0].name]);
          this.statusBar.setDebugTargetsText(debuggableTargets[0].name);
          this.statusBar.setDebugTargetsTooltip(`Auto-selected debug target: ${debuggableTargets[0].name} (${workspace.name})`);
          this.output.appendLine(`Auto-selected debug target: ${debuggableTargets[0].name} (only option with local debugger)`);
        } else
          this.output.appendLine('No debug targets configured or available for auto-selection');
      }
    }
    // Don't save auto-selected values - only save when user explicitly makes selections
  }

  private registerCommands(): void {
    // Select Generator
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectGenerator', async () => {
      // Get all workspace folders that are Malterlib projects
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const malterlibWorkspaces = workspaceFolders.filter(folder =>
        MalterlibProjectDetector.isMalterlibProject(folder)
      );

      if (malterlibWorkspaces.length === 0) {
        vscode.window.showWarningMessage('No Malterlib projects found in any workspace folders.');
        return;
      }

      // Collect all workspace/generator combinations
      interface GeneratorChoice {
        label: string;
        workspaceFolder: vscode.WorkspaceFolder;
        generator: GeneratorInfo;
      }

      const allChoices: GeneratorChoice[] = [];
      for (const wsFolder of malterlibWorkspaces) {
        const generators = BuildSystemScanner.getGenerators(wsFolder);
        for (const gen of generators) {
          allChoices.push({
            label: `${wsFolder.name} / ${gen.label}`,
            workspaceFolder: wsFolder,
            generator: gen
          });
        }
      }

      if (allChoices.length === 0) {
        vscode.window.showWarningMessage('No generators found in any BuildSystem directories.');
        return;
      }

      let selectedChoice: GeneratorChoice | undefined;

      // Sort choices for display, the host tools after the others
      const sortedChoices = allChoices.sort((a, b) => Number(!!a.generator.hostTools) - Number(!!b.generator.hostTools) || a.label.localeCompare(b.label));
      const items = sortedChoices.map(choice => ({
        label: choice.label,
        description: choice.generator.hostTools ? 'Host tools, which builds of the other build systems build' : undefined,
        detail: choice.generator.path,
        choice: choice
      }));

      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = 'Select a workspace and generator combination';

      // Try to find current selection if it exists
      if (this.currentGenerator && this.currentWorkspace) {
        const currentItem = items.find(item => {
          const choice = (item as any).choice as GeneratorChoice;
          return choice.generator.name === this.currentGenerator;
        });
        if (currentItem)
          quickPick.activeItems = [currentItem];
      }

      selectedChoice = await new Promise<GeneratorChoice | undefined>((resolve) => {
        let resolved = false;
        quickPick.onDidAccept(() => {
          if (resolved) return;
          resolved = true;
          const selectedItem = quickPick.activeItems[0];
          quickPick.dispose();
          resolve(selectedItem ? (selectedItem as any).choice : undefined);
        });
        quickPick.onDidHide(() => {
          if (resolved) return;
          resolved = true;
          quickPick.dispose();
          resolve(undefined);
        });
        quickPick.show();
      });

      if (selectedChoice) {
        const fallbacks = {
          workspace: this.currentWorkspace ?? undefined,
          configuration: this.currentConfiguration ?? undefined,
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.setGenerator(selectedChoice.generator.name);
        this.setWorkspace(null);
        this.setConfiguration(null);
        this.setTarget(null);
        this.setDebugTargets([]);

        // Only show workspace name if there are multiple workspace folders
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
        const generatorText = hasMultipleWorkspaces
          ? `${selectedChoice.workspaceFolder.name} / ${selectedChoice.generator.label}`
          : selectedChoice.generator.label;

        this.statusBar.setGeneratorText(generatorText);
        this.statusBar.setGeneratorTooltip(`Current generator: ${selectedChoice.generator.label} (${selectedChoice.workspaceFolder.name})`);
        this.statusBar.setWorkspaceText('No Workspace');
        this.statusBar.setConfigurationText('No Configuration');
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setDebugTargetsText('No Debug Targets');

        this.output.appendLine(`Generator selected: ${selectedChoice.generator.label} for workspace: ${selectedChoice.workspaceFolder.name}`);

        // Store the selected workspace folder and trigger cascade
        this.selectedWorkspaceFolder = selectedChoice.workspaceFolder;
        this.cascadeAutoSelection(fallbacks);

        // The generator decides which ConfigStore the merged compile_commands.json comes from
        void this.generateCompileCommands();

        // Save selections to workspace state
        void this.saveSelections();
      }
    }));

    // Select Workspace
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectWorkspace', async () => {
      const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
      if (!workspace) {
        vscode.window.showWarningMessage('No Malterlib project selected. Please select a generator first.');
        return;
      }
      if (!this.currentGenerator) {
        vscode.window.showWarningMessage('Please select a generator first.');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) {
        vscode.window.showWarningMessage('Selected generator no longer exists.');
        return;
      }

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No workspaces found in selected generator.');
        return;
      }

      let selected: string | undefined;
      const sortedNames = workspaces.map(ws => ws.name).sort();
      const items = sortedNames.map(name => ({ label: name }));
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = `Select a workspace for ${workspace.name}`;
      if (this.currentWorkspace) {
        const currentItem = items.find(item => item.label === this.currentWorkspace);
        if (currentItem)
          quickPick.activeItems = [currentItem];
      }
      selected = await new Promise<string | undefined>((resolve) => {
        let resolved = false;
        quickPick.onDidAccept(() => {
          if (resolved) return;
          resolved = true;
          const selectedItem = quickPick.activeItems[0];
          quickPick.dispose();
          resolve(selectedItem?.label);
        });
        quickPick.onDidHide(() => {
          if (resolved) return;
          resolved = true;
          quickPick.dispose();
          resolve(undefined);
        });
        quickPick.show();
      });

      if (selected && this.currentWorkspace !== selected) {
        const fallbacks = {
          configuration: this.currentConfiguration ?? undefined,
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.setWorkspace(selected);
        this.setConfiguration(null);
        this.setTarget(null);
        this.setDebugTargets([]);

        this.statusBar.setWorkspaceText(selected);
        this.statusBar.setWorkspaceTooltip(`Current workspace: ${selected} (${workspace.name})`);
        this.statusBar.setConfigurationText('No Configuration');
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setDebugTargetsText('No Debug Targets');
        this.statusBar.setDebugTargetsTooltip(`No debug targets selected (${workspace.name})`);

        this.output.appendLine(`Workspace selected: ${selected} for workspace: ${workspace.name}`);
        this.cascadeAutoSelection(fallbacks);

        void this.generateCompileCommands();

        // Save selections to workspace state
        void this.saveSelections();
      }
    }));

    // Select Configuration
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectConfiguration', async () => {
      const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
      if (!workspace) {
        vscode.window.showWarningMessage('No Malterlib project selected. Please select a generator first.');
        return;
      }
      if (!this.currentGenerator || !this.currentWorkspace) {
        vscode.window.showWarningMessage('Please select a generator and workspace first.');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) {
        vscode.window.showWarningMessage('Selected generator no longer exists.');
        return;
      }
      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) {
        vscode.window.showWarningMessage('Selected workspace no longer exists.');
        return;
      }

      const configurations = BuildSystemScanner.getWorkspaceConfigurations(selectedWorkspaceInfo.path);
      if (configurations.length === 0) {
        vscode.window.showWarningMessage('No configurations found in selected workspace.');
        return;
      }

      let selected: string | undefined;
      // Create a map from configuration display to name
      const configMap = new Map<string, string>();
      configurations.forEach(config => {
        configMap.set(config.configuration, config.name);
      });

      const sortedConfigs = configurations.sort((a, b) => a.configuration.localeCompare(b.configuration));
      const items = sortedConfigs.map(config => ({ label: `${config.platform} ${config.architecture} ${config.configuration}`, id: config.name }));
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = `Select a configuration for ${workspace.name}`;
      if (this.currentConfiguration) {
        const currentConfig = configurations.find(c => c.name === this.currentConfiguration);
        if (currentConfig) {
          const currentItem = items.find(item => item.id === currentConfig.name);
          if (currentItem)
            quickPick.activeItems = [currentItem];
        }
      }
      selected = await new Promise<string | undefined>((resolve) => {
        let resolved = false;
        quickPick.onDidAccept(() => {
          if (resolved) return;
          resolved = true;
          const selectedItem = quickPick.activeItems[0];
          quickPick.dispose();
          // Map the display label back to the name
          const name = selectedItem && (selectedItem as any).id;
          resolve(name);
        });
        quickPick.onDidHide(() => {
          if (resolved) return;
          resolved = true;
          quickPick.dispose();
          resolve(undefined);
        });
        quickPick.show();
      });

      if (selected && this.currentConfiguration !== selected) {
        const fallbacks = {
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.setConfiguration(selected);
        this.setTarget(null);
        this.setDebugTargets([]);

        // Find the configuration object to get the display name
        const selectedConfig = configurations.find(c => c.name === selected);
        const displayName = selectedConfig
          ? `${selectedConfig.platform} ${selectedConfig.architecture} ${selectedConfig.configuration}`
          : selected;
        this.statusBar.setConfigurationText(displayName);
        this.statusBar.setConfigurationTooltip(`Current configuration: ${displayName} (${workspace.name})`);
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setDebugTargetsText('No Debug Targets');

        this.output.appendLine(`Configuration selected: ${displayName} for workspace: ${workspace.name}`);
        this.cascadeAutoSelection(fallbacks);

        // Generate compile_commands.json for the new configuration
        void this.generateCompileCommands();

        // Save selections to workspace state
        void this.saveSelections();
      }
    }));

    // Select Target
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectTarget', async () => {
      const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
      if (!workspace || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
        vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
        return;
      }

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;

      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;

      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const cfgName = this.currentConfiguration!;
      const sortedTargetNames = targets
        .filter(t => {
          const cfg = t.configurations?.get(cfgName);
          return cfg?.generateScheme !== false; // default true when undefined
        })
        .map(target => target.name)
        .sort();
      const itemNames = ['All Targets', ...sortedTargetNames];

      let selected: string | undefined;
      const defaultBuildTarget = this.currentConfiguration ? BuildSystemScanner.getDefaultBuildTarget(selectedWorkspaceInfo.path, this.currentConfiguration) : null;
      const items = itemNames.map(name => ({ label: name, description: (defaultBuildTarget === name) ? '(default)' : undefined }));
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = `Select a target for ${workspace.name}`;
      if (this.currentTarget) {
        const currentItem = items.find(item => item.label === this.currentTarget);
        if (currentItem)
          quickPick.activeItems = [currentItem];
      }
      selected = await new Promise<string | undefined>((resolve) => {
        let resolved = false;
        quickPick.onDidAccept(() => {
          if (resolved) return;
          resolved = true;
          const selectedItem = quickPick.activeItems[0];
          quickPick.dispose();
          resolve(selectedItem?.label);
        });
        quickPick.onDidHide(() => {
          if (resolved) return;
          resolved = true;
          quickPick.dispose();
          resolve(undefined);
        });
        quickPick.show();
      });

      if (selected && this.currentTarget !== selected) {
        this.setTarget(selected);
        this.statusBar.setTargetText(selected);
        this.statusBar.setTargetTooltip(`Current target: ${selected} (${workspace.name})`);
        this.output.appendLine(`Target selected: ${selected} for workspace: ${workspace.name}`);

        // Regenerate compile_commands.json with new target selection
        void this.generateCompileCommands();

        // Save selections to workspace state
        void this.saveSelections();
      }
    }));

    // Select Debug Targets (multi)
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectDebugTargets', async () => {
      const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
      if (!workspace || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
        vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
        return;
      }
      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;
      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;
      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const cfgName = this.currentConfiguration!;
      const itemNames = targets
        .filter(t => (t.configurations?.get(cfgName)?.localDebuggerCommand))
        .map(target => target.name)
        .sort();
      if (itemNames.length === 0) {
        vscode.window.showWarningMessage('No debug targets available with a local debugger.');
        return;
      }
      let selected: string[] | undefined;

      const items = itemNames.map(name => ({ label: name, picked: this.currentDebugTargets.includes(name) }));
      const selectedItems = await vscode.window.showQuickPick(items, { placeHolder: `Select debug targets for ${workspace.name}`, canPickMany: true });
      selected = selectedItems?.map(item => item.label);

      if (selected && selected.length > 0 && (selected.length !== this.currentDebugTargets.length || !selected.every(val => this.currentDebugTargets.includes(val)))) {
        this.setDebugTargets(selected);
        const text = selected.length === 1 ? selected[0] : `${selected.length} targets`;
        this.statusBar.setDebugTargetsText(text);
        this.statusBar.setDebugTargetsTooltip(`Debug targets: ${selected.join(', ')} (${workspace.name})`);
        this.output.appendLine(`Debug targets selected: ${selected.join(', ')} for workspace: ${workspace.name}`);

        // Save selections to workspace state
        void this.saveSelections();
      }
    }));

    // Select Single Debug Target
    this.disposables.push(vscode.commands.registerCommand('malterlib.selectSingleDebugTarget', async () => {
      this.output.appendLine('Single debug target command started');
      const workspace = this.selectedWorkspaceFolder || MalterlibProjectDetector.getActiveMalterlibWorkspace();
      if (!workspace || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
        this.output.appendLine('Missing prerequisites: workspace, generator, or workspace not selected');
        vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
        return;
      }
      this.output.appendLine(`Prerequisites OK: workspace=${workspace.name}, generator=${this.currentGenerator}, currentWorkspace=${this.currentWorkspace}`);

      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;
      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) {
        this.output.appendLine('Selected workspace info not found');
        return;
      }
      this.output.appendLine(`Found workspace info: ${selectedWorkspaceInfo.name}`);

      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const cfgName2 = this.currentConfiguration!;
      const itemNames = targets
        .filter(t => (t.configurations?.get(cfgName2)?.localDebuggerCommand))
        .map(target => target.name)
        .sort();
      this.output.appendLine(`Found ${itemNames.length} targets: ${itemNames.join(', ')}`);
      this.output.appendLine(`Current debug targets: ${this.currentDebugTargets.join(', ')}`);

      if (itemNames.length === 0) {
        this.output.appendLine('No targets with local debugger found for debugging');
        vscode.window.showWarningMessage('No debug targets available with a local debugger.');
        return;
      }

      let selected: string | undefined;
      this.output.appendLine('Creating QuickPick for multiple targets');
      const currentSingle = this.currentDebugTargets.length === 1 ? this.currentDebugTargets[0] : undefined;
      const items = itemNames.map(name => ({ label: name, description: (currentSingle === name) ? '(current)' : undefined }));
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = `Select a single debug target for ${workspace.name}`;
      this.output.appendLine(`Created QuickPick with ${items.length} items`);
      if (currentSingle) {
        const currentItem = items.find(item => item.label === currentSingle);
        if (currentItem) {
          quickPick.activeItems = [currentItem];
          this.output.appendLine(`Set active item to: ${currentItem.label}`);
        } else
          this.output.appendLine(`Could not find current item: ${currentSingle}`);
      } else
        this.output.appendLine('No current single debug target to set as active');
      this.output.appendLine('Showing QuickPick for single debug target');
      selected = await new Promise<string | undefined>((resolve) => {
        let resolved = false;
        quickPick.onDidAccept(() => {
          if (resolved) return;
          resolved = true;
          this.output.appendLine('Single debug target QuickPick accepted');
          const selectedItem = quickPick.activeItems[0];
          this.output.appendLine(`Selected item: ${selectedItem?.label || 'undefined'}`);
          quickPick.dispose();
          resolve(selectedItem?.label);
        });
        quickPick.onDidHide(() => {
          if (resolved) return;
          resolved = true;
          this.output.appendLine('Single debug target QuickPick hidden/cancelled');
          quickPick.dispose();
          resolve(undefined);
        });
        quickPick.show();
      });

      this.output.appendLine(`Final selected value: ${selected || 'undefined'}`);
      if (selected && (this.currentDebugTargets.length !== 1 || this.currentDebugTargets[0] !== selected)) {
        this.output.appendLine('Updating debug targets and status bar');
        this.setDebugTargets([selected]);
        this.statusBar.setDebugTargetsText(selected);
        this.statusBar.setDebugTargetsTooltip(`Debug target: ${selected} (${workspace.name})`);
        this.output.appendLine(`Single debug target selected: ${selected} for workspace: ${workspace.name}`);
        this.output.appendLine(`Updated currentDebugTargets to: ${this.currentDebugTargets.join(', ')}`);

        // Save selections to workspace state
        void this.saveSelections();
      } else
        this.output.appendLine('No target was selected (cancelled or undefined)');
    }));

    // Generate compile_commands.json command
    this.disposables.push(vscode.commands.registerCommand('malterlib.generateCompileCommands', async () => {
      await this.generateCompileCommands(true);
    }));
  }

  /**
   * Generate compile_commands.json for the current workspace and configuration
   */
  public async generateCompileCommands(showNotification: boolean = false): Promise<void> {
    if (!this.selectedWorkspaceFolder || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
      this.stopCompileCommandsTracking();
      if (showNotification)
        vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
      return;
    }

    const selection = this.getCompileCommandsSelection();
    if (!selection) {
      this.stopCompileCommandsTracking();
      return;
    }

    // Watch before merging so that per-target files written while the merge runs are not missed
    this.setCompileCommandsWatcher(selection.generator.configStorePath);
    const inputs = this.getCompileCommandsInputs(selection);
    this.setCompileCommandsInputWatchers(inputs, selection.workspaceFolder);
    this.compileCommandsSignature = this.getCompileCommandsSignature(selection, inputs);
    this.compileCommandsInputKeys = this.getCompileCommandsInputKeys(inputs);
    this.compileCommandsInputKeyMap = this.getCompileCommandsInputKeyMap(inputs);

    try {
      this.output.appendLine('Generating compile_commands.json...');

      const outputPath = await CompileCommandsGenerator.generateForWorkspace(
        selection.workspaceFolder,
        selection.workspace.path,
        selection.configuration,
        selection.target,
        selection.generator.path
      );

      if (outputPath) {
        this.output.appendLine(`Generated compile_commands.json at: ${outputPath}`);
        if (showNotification)
          vscode.window.showInformationMessage(`Generated compile_commands.json for ${selection.configuration}`);
      }
    } catch (error) {
      this.output.appendLine(`Error generating compile_commands.json: ${error}`);
      if (showNotification)
        vscode.window.showErrorMessage(`Failed to generate compile_commands.json: ${error}`);
    }
  }

  /**
   * Regenerate compile_commands.json if the selection or the set of per-target files it is merged from changed
   * since the last merge, e.g. after a ConfigStore rescan found new targets or configurations
   */
  private generateCompileCommandsIfInputsChanged(): void {
    const selection = this.getCompileCommandsSelection();
    if (!selection) {
      this.stopCompileCommandsTracking();
      return;
    }

    const inputs = this.getCompileCommandsInputs(selection);

    // While the ConfigStore is being regenerated the scanner can briefly see no targets. Merging would only warn
    // and leave the file as is, and the scan that sees the targets again compares against the last real merge
    if (inputs.length === 0)
      return;

    if (this.getCompileCommandsSignature(selection, inputs) !== this.compileCommandsSignature)
      void this.generateCompileCommands();
  }

  /**
   * Regenerate compile_commands.json once a burst of per-target compile_commands.json writes has settled
   */
  private scheduleCompileCommandsGeneration(): void {
    if (this.compileCommandsTimer)
      clearTimeout(this.compileCommandsTimer);

    this.compileCommandsTimer = setTimeout(() => {
      this.compileCommandsTimer = null;
      void this.generateCompileCommands();
    }, 1000);
  }

  /**
   * Called for every per-target compile_commands.json in the selected generator's ConfigStore, and for the merged files
   * outside it. The changes are checked together shortly after, as a build system can write hundreds of them at once,
   * and finding the keys of the current inputs can access the file system.
   */
  private onCompileCommandsFileChanged(inputKey: string): void {
    this.changedCompileCommandsKeys.add(inputKey);
    if (!this.changedCompileCommandsTimer)
      this.changedCompileCommandsTimer = setTimeout(() => this.checkChangedCompileCommands(), 100);
  }

  /**
   * Only files that are merged for the current selection matter: a file for a target or configuration the scanner
   * doesn't know yet is picked up by the merge that follows the rescan that finds it.
   */
  private checkChangedCompileCommands(): void {
    const changedKeys = [...this.changedCompileCommandsKeys];
    this.clearChangedCompileCommands();

    const selection = this.getCompileCommandsSelection();
    if (!selection) {
      // The selection is being restored after a rescan. Make the merge check that follows the rescan regenerate,
      // as these changes can't be attributed now
      this.compileCommandsSignature = null;
      return;
    }

    const inputs = this.getCompileCommandsInputs(selection);
    const inputKeys = this.getCompileCommandsInputKeys(inputs);
    // A symbolic link that's retargeted, into or out of the ConfigStore layout, changes the key of its input, which the
    // events of its watchers report by its old key
    const keyMap = this.getCompileCommandsInputKeyMap(inputs);
    const bKeyChanged = [...keyMap].some(([input, key]) => {
      const previous = this.compileCommandsInputKeyMap.get(input);
      return previous !== undefined && previous !== key && changedKeys.includes(previous);
    });
    if (bKeyChanged || changedKeys.some(key => inputKeys.has(key)))
      this.scheduleCompileCommandsGeneration();
    if (changedKeys.some(key => !inputKeys.has(key) && this.compileCommandsInputKeys.has(key))) {
      // A file of the last merge whose target the scanner has dropped, possibly only while the ConfigStore is being
      // regenerated. If the rescan that finds it again restores the same inputs, the signature alone would not show
      // that its content changed, so make that check regenerate
      this.compileCommandsSignature = null;
    }
  }

  private clearChangedCompileCommands(): void {
    this.changedCompileCommandsKeys.clear();
    if (this.changedCompileCommandsTimer) {
      clearTimeout(this.changedCompileCommandsTimer);
      this.changedCompileCommandsTimer = null;
    }
  }

  /**
   * Stop watching per-target files and forget the last merge, so the next merge check regenerates. Changes made
   * while nothing was watching can only be picked up by merging again.
   */
  private stopCompileCommandsTracking(): void {
    this.setCompileCommandsWatcher(null);
    this.setCompileCommandsInputWatchers([]);
    this.compileCommandsSignature = null;
    this.compileCommandsInputKeys.clear();
    this.compileCommandsInputKeyMap.clear();
    if (this.compileCommandsTimer) {
      clearTimeout(this.compileCommandsTimer);
      this.compileCommandsTimer = null;
    }
    this.clearChangedCompileCommands();
  }

  /**
   * Watch the per-target compile_commands.json files of a generator's ConfigStore, or stop watching with null.
   * The watcher reads the current selection when files change, so it only needs replacing when the generator changes.
   */
  private setCompileCommandsWatcher(configStorePath: string | null): void {
    if (configStorePath === this.compileCommandsWatcherPath)
      return;

    // Create the new watcher before disposing the old one so there is no window without a watcher
    const previousWatcher = this.compileCommandsWatcher;
    this.compileCommandsWatcher = configStorePath
      ? CompileCommandsGenerator.createWatcher(configStorePath, uri => this.onCompileCommandsFileChanged(CompileCommandsGenerator.getConfigStoreKey(uri.fsPath)))
      : null;
    this.compileCommandsWatcherPath = configStorePath;
    previousWatcher?.dispose();
  }

  /**
   * Watch the merged compile_commands.json files that are outside the ConfigStore layout, which another build system
   * can name in its target configurations, and the files that symbolic links among them point to, also in the layout.
   * A watcher of a file whose directory didn't exist is replaced once the directory exists, as merging again follows
   * the file's creation, and so is the watcher of a link's target when the link changes, and a watcher of a directory
   * that was replaced by another one. The merged output isn't
   * watched, also when an input names it, as each merge writes it.
   */
  private setCompileCommandsInputWatchers(inputs: CompileCommandsInput[], workspaceFolder?: vscode.WorkspaceFolder): void {
    const wanted = new Map<string, { path: string; base: string; identity?: string }[]>();
    for (const input of inputs) {
      const key = CompileCommandsGenerator.getInputKey(input);
      if (!key || !input.compileCommandsPath || wanted.has(key) ||
        (workspaceFolder && CompileCommandsGenerator.isOutput(input, workspaceFolder)))
        continue;
      // The ConfigStore's watcher watches the files in its layout, but reports a link's target by the target's key
      const watchBases = CompileCommandsGenerator.getInputWatchBases(input.compileCommandsPath, !CompileCommandsGenerator.isInConfigStoreLayout(input));
      if (watchBases.length)
        wanted.set(key, watchBases);
    }

    // Create the new watchers before disposing the old ones so there is no window without a watcher
    const previousWatchers: vscode.Disposable[] = [];
    for (const [key, watchBases] of wanted) {
      const bases = JSON.stringify(watchBases);
      const existing = this.compileCommandsInputWatchers.get(key);
      if (existing?.bases === bases)
        continue;
      if (existing)
        previousWatchers.push(existing.watcher);
      const watcher = vscode.Disposable.from(...watchBases.map(({ path: compileCommandsPath, base }) =>
        CompileCommandsGenerator.createInputWatcher(compileCommandsPath, base, () => this.onCompileCommandsFileChanged(key))));
      this.compileCommandsInputWatchers.set(key, { bases, watcher });
    }
    for (const [key, { watcher }] of this.compileCommandsInputWatchers) {
      if (!wanted.has(key)) {
        previousWatchers.push(watcher);
        this.compileCommandsInputWatchers.delete(key);
      }
    }
    previousWatchers.forEach(watcher => watcher.dispose());
  }

  /**
   * The label of a build system of the selected workspace folder, its output directory, or its name when it's not found
   */
  private getGeneratorLabel(generatorName: string): string {
    const generators = this.selectedWorkspaceFolder ? BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder) : [];
    return generators.find(generator => generator.name === generatorName)?.label ?? generatorName;
  }

  private getCompileCommandsSelection(): CompileCommandsSelection | null {
    if (!this.selectedWorkspaceFolder || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration)
      return null;

    const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
    const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
    if (!selectedGenerator)
      return null;

    const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
    const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
    if (!selectedWorkspaceInfo)
      return null;

    return {
      workspaceFolder: this.selectedWorkspaceFolder,
      generator: selectedGenerator,
      workspace: selectedWorkspaceInfo,
      configuration: this.currentConfiguration,
      target: this.currentTarget || undefined
    };
  }

  private getCompileCommandsInputs(selection: CompileCommandsSelection): CompileCommandsInput[] {
    return CompileCommandsGenerator.getInputs(selection.workspace.path, selection.configuration, selection.generator.path);
  }

  /**
   * The keys of the inputs by their workspace, target and configuration
   */
  private getCompileCommandsInputKeyMap(inputs: CompileCommandsInput[]): Map<string, string> {
    const keys = new Map<string, string>();
    for (const input of inputs) {
      const key = CompileCommandsGenerator.getInputKey(input);
      if (key)
        keys.set(JSON.stringify([input.workspaceName, input.targetName, input.configurationName]), key);
    }
    return keys;
  }

  private getCompileCommandsInputKeys(inputs: CompileCommandsInput[]): Set<string> {
    const keys = new Set<string>();
    for (const input of inputs) {
      const key = CompileCommandsGenerator.getInputKey(input);
      if (key)
        keys.add(key);
    }
    return keys;
  }

  private getCompileCommandsSignature(selection: CompileCommandsSelection, inputs: CompileCommandsInput[]): string {
    return JSON.stringify({
      workspaceFolder: selection.workspaceFolder.uri.fsPath,
      generator: selection.generator.path,
      workspace: selection.workspace.path,
      configuration: selection.configuration,
      target: selection.target ?? null,
      inputs: inputs.map(input => [input.workspaceName, input.targetName, input.configurationName, input.compileCommandsPath ?? null])
    });
  }
}
