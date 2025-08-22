import * as vscode from 'vscode';
import { StatusBar } from './statusBar';
import { BuildSystemScanner, GeneratorInfo } from './buildSystemScanner';
import { MalterlibProjectDetector } from './malterlibProject';
import { CompileCommandsGenerator } from './compileCommandsGenerator';

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

    // Update status bar and validate selections on scanning changes
    this.disposables.push(
      BuildSystemScanner.onDidChangeScanningAsync(async () => {
        this.statusBar.update();
        this.restoreSelections();
      })
    );

    // Register commands
    this.registerCommands();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.compileCommandsWatcher?.dispose();
  }

  public initializeAutoSelection(): void {
    // Try to restore previous selections first
    this.restoreSelections();
    this.cascadeAutoSelection();
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
          this.output.appendLine(`Saved workspace folder no longer valid: ${savedWorkspacePath}`);
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
        this.currentGenerator = savedGenerator;
      else {
        this.output.appendLine(`Saved generator '${savedGenerator}' no longer exists`);
        this.currentGenerator = null;
      }
    } else
      this.currentGenerator = null;

    // Validate workspace exists
    if (this.currentGenerator && savedWorkspace && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
      if (selectedGenerator) {
        const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
        if (workspaces.some(w => w.name === savedWorkspace))
          this.currentWorkspace = savedWorkspace;
        else {
          this.output.appendLine(`Saved workspace '${savedWorkspace}' no longer exists`);
          this.currentWorkspace = null;
        }
      }
    } else
      this.currentWorkspace = null;

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
            this.currentConfiguration = savedConfiguration;
          else {
            this.output.appendLine(`Saved configuration '${savedConfiguration}' no longer exists`);
            this.currentConfiguration = null;
          }
        }
      }
    } else
      this.currentConfiguration = null;
    
    // Validate target exists
    if (this.currentGenerator && this.currentWorkspace && savedTarget && this.selectedWorkspaceFolder) {
      if (savedTarget === 'All Targets')
        this.currentTarget = savedTarget;
      else {
        const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
        const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
        if (selectedGenerator) {
          const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
          const selectedWorkspace = workspaces.find(w => w.name === this.currentWorkspace);
          if (selectedWorkspace) {
            const targets = BuildSystemScanner.getTargets(selectedWorkspace.path);
            if (targets.some(t => t.name === savedTarget))
              this.currentTarget = savedTarget;
            else {
              this.output.appendLine(`Saved target '${savedTarget}' no longer exists`);
              this.currentTarget = null;
            }
          }
        }
      }
    } else
      this.currentTarget = null;

    // Validate debug targets exist
    if (this.currentGenerator && this.currentWorkspace && savedDebugTargets.length > 0 && this.selectedWorkspaceFolder) {
      const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
      const selectedGenerator = generators.find(g => g.name === this.currentGenerator);
      if (selectedGenerator) {
        const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
        const selectedWorkspace = workspaces.find(w => w.name === this.currentWorkspace);
        if (selectedWorkspace) {
          const targets = BuildSystemScanner.getTargets(selectedWorkspace.path);
          const targetNames = targets.map(t => t.name);
          const validDebugTargets = savedDebugTargets.filter(t => targetNames.includes(t));
          if (validDebugTargets.length > 0) {
            this.currentDebugTargets = validDebugTargets;
            if (validDebugTargets.length < savedDebugTargets.length) {
              const invalidTargets = savedDebugTargets.filter(t => !targetNames.includes(t));
              this.output.appendLine(`Some saved debug targets no longer exist: ${invalidTargets.join(', ')}`);
            }
          } else {
            this.output.appendLine(`None of the saved debug targets exist anymore`);
            this.currentDebugTargets = [];
          }
        } else
          this.currentDebugTargets = [];
      } else
        this.currentDebugTargets = [];
    } else
      this.currentDebugTargets = [];

    if (this.currentGenerator) {
      // Update status bar with restored values
      const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
      const generatorText = hasMultipleWorkspaces && this.selectedWorkspaceFolder
        ? `${this.selectedWorkspaceFolder.name} / ${this.currentGenerator}`
        : this.currentGenerator;
      
      this.statusBar.setGeneratorText(generatorText);
      this.statusBar.setGeneratorTooltip(this.selectedWorkspaceFolder 
        ? `Current generator: ${this.currentGenerator} (${this.selectedWorkspaceFolder.name})`
        : `Current generator: ${this.currentGenerator}`);
      
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
                displayName = config.configuration;
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

  private cascadeAutoSelection(fallbacks?: {
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
        this.currentGenerator = defaultGenerator.name;
        this.selectedWorkspaceFolder = workspace;
        
        // Only show workspace name if there are multiple workspace folders
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
        const generatorText = hasMultipleWorkspaces 
          ? `${workspace.name} / ${defaultGenerator.name}`
          : defaultGenerator.name;
        
        this.statusBar.setGeneratorText(generatorText);
        this.statusBar.setGeneratorTooltip(`Auto-selected generator: ${defaultGenerator.name} (${workspace.name})`);
        this.output.appendLine(`Auto-selected generator: ${defaultGenerator.name} in ${workspace.name}`);
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
        this.currentWorkspace = defaultWorkspace.name;
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
        this.currentConfiguration = defaultConfiguration.name;
        this.statusBar.setConfigurationText(defaultConfiguration.configuration);
        this.statusBar.setConfigurationTooltip(`Auto-selected configuration: ${defaultConfiguration.configuration} (${workspace.name})`);
        this.output.appendLine(`Auto-selected configuration: ${defaultConfiguration.configuration}`);
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

      if (fallbacks?.target && (fallbacks.target === 'All Targets' || targetNames.includes(fallbacks.target))) {
        this.currentTarget = fallbacks.target;
        this.statusBar.setTargetText(fallbacks.target);
        this.statusBar.setTargetTooltip(`Preserved target: ${fallbacks.target} (${workspace.name})`);
        this.output.appendLine(`Preserved target: ${fallbacks.target} (from previous selection)`);
      } else if (targets.length === 0) {
        this.currentTarget = 'All Targets';
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setTargetTooltip(`Auto-selected target: All Targets (${workspace.name})`);
        this.output.appendLine('Auto-selected target: All Targets (no specific targets)');
      } else if (defaultBuildTarget && targets.some(t => t.name === defaultBuildTarget)) {
        this.currentTarget = defaultBuildTarget;
        this.statusBar.setTargetText(defaultBuildTarget);
        this.statusBar.setTargetTooltip(`Auto-selected target: ${defaultBuildTarget} (${workspace.name})`);
        this.output.appendLine(`Auto-selected target: ${defaultBuildTarget} (default build target)`);
      } else
        this.output.appendLine('Target selection required - "All Targets" or specific target');
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
        const validFallbacks = fallbacks.debugTargets.filter(name => targetNames.includes(name));
        if (validFallbacks.length > 0) {
          this.currentDebugTargets = [...validFallbacks];
          const text = validFallbacks.length === 1 ? validFallbacks[0] : `${validFallbacks.length} targets`;
          this.statusBar.setDebugTargetsText(text);
          this.statusBar.setDebugTargetsTooltip(`Debug targets: ${validFallbacks.join(', ')} (${workspace.name})`);
          this.output.appendLine(`Preserved debug targets: ${validFallbacks.join(', ')} (from previous selection)`);
          return;
        }
      }

      const defaultDebugTargets = BuildSystemScanner.getDefaultDebugTargets(selectedWorkspaceInfo.path, this.currentConfiguration);
      const workspaceConfig = BuildSystemScanner.getWorkspaceConfiguration(selectedWorkspaceInfo.path, this.currentConfiguration);
      const explicitTargets = workspaceConfig?.defaultDebugTargets || [];

      if (defaultDebugTargets.length > 0) {
        this.currentDebugTargets = [...defaultDebugTargets];
        const text = defaultDebugTargets.length === 1 ? defaultDebugTargets[0] : `${defaultDebugTargets.length} targets`;
        this.statusBar.setDebugTargetsText(text);
        this.statusBar.setDebugTargetsTooltip(`Debug targets: ${defaultDebugTargets.join(', ')} (${workspace.name})`);

        if (explicitTargets.length > 0)
          this.output.appendLine(`Auto-selected explicit default debug targets: ${defaultDebugTargets.join(', ')}`);
        else
          this.output.appendLine(`Auto-selected debug targets via priority: ${defaultDebugTargets.join(', ')}`);
      } else {
        if (targets.length === 1) {
          this.currentDebugTargets = [targets[0].name];
          this.statusBar.setDebugTargetsText(targets[0].name);
          this.statusBar.setDebugTargetsTooltip(`Auto-selected debug target: ${targets[0].name} (${workspace.name})`);
          this.output.appendLine(`Auto-selected debug target: ${targets[0].name} (only option)`);
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
            label: `${wsFolder.name} / ${gen.name}`,
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

      if (allChoices.length === 1) {
        selectedChoice = allChoices[0];
        this.output.appendLine(`Auto-selected generator: ${selectedChoice.generator.name} in ${selectedChoice.workspaceFolder.name} (only option available)`);
      } else {
        // Sort choices for display
        const sortedChoices = allChoices.sort((a, b) => a.label.localeCompare(b.label));
        const items = sortedChoices.map(choice => ({ 
          label: choice.label,
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
      }

      if (selectedChoice) {
        const fallbacks = {
          workspace: this.currentWorkspace ?? undefined,
          configuration: this.currentConfiguration ?? undefined,
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.currentGenerator = selectedChoice.generator.name;
        this.currentWorkspace = null;
        this.currentConfiguration = null;
        this.currentTarget = null;
        this.currentDebugTargets = [];

        // Only show workspace name if there are multiple workspace folders
        const hasMultipleWorkspaces = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
        const generatorText = hasMultipleWorkspaces 
          ? `${selectedChoice.workspaceFolder.name} / ${selectedChoice.generator.name}`
          : selectedChoice.generator.name;
        
        this.statusBar.setGeneratorText(generatorText);
        this.statusBar.setGeneratorTooltip(`Current generator: ${selectedChoice.generator.name} (${selectedChoice.workspaceFolder.name})`);
        this.statusBar.setWorkspaceText('No Workspace');
        this.statusBar.setConfigurationText('No Configuration');
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setDebugTargetsText('No Debug Targets');

        this.output.appendLine(`Generator selected: ${selectedChoice.generator.name} for workspace: ${selectedChoice.workspaceFolder.name}`);

        // Store the selected workspace folder and trigger cascade
        this.selectedWorkspaceFolder = selectedChoice.workspaceFolder;
        this.cascadeAutoSelection(fallbacks);
        
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
      if (workspaces.length === 1) {
        selected = workspaces[0].name;
        this.output.appendLine(`Auto-selected workspace: ${selected} (only option available)`);
      } else {
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
      }

      if (selected) {
        const fallbacks = {
          configuration: this.currentConfiguration ?? undefined,
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.currentWorkspace = selected;
        this.currentConfiguration = null;
        this.currentTarget = null;
        this.currentDebugTargets = [];

        this.statusBar.setWorkspaceText(selected);
        this.statusBar.setWorkspaceTooltip(`Current workspace: ${selected} (${workspace.name})`);
        this.statusBar.setConfigurationText('No Configuration');
        this.statusBar.setTargetText('All Targets');
        this.statusBar.setDebugTargetsText('No Debug Targets');
        this.statusBar.setDebugTargetsTooltip(`No debug targets selected (${workspace.name})`);

        this.output.appendLine(`Workspace selected: ${selected} for workspace: ${workspace.name}`);
        this.cascadeAutoSelection(fallbacks);
        
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
      if (configurations.length === 1) {
        selected = configurations[0].name;
        this.output.appendLine(`Auto-selected configuration: ${configurations[0].configuration} (only option available)`);
      } else {
        // Create a map from configuration display to name
        const configMap = new Map<string, string>();
        configurations.forEach(config => {
          configMap.set(config.configuration, config.name);
        });
        
        const sortedConfigs = configurations.sort((a, b) => a.configuration.localeCompare(b.configuration));
        const items = sortedConfigs.map(config => ({ label: config.configuration }));
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items;
        quickPick.placeholder = `Select a configuration for ${workspace.name}`;
        if (this.currentConfiguration) {
          const currentConfig = configurations.find(c => c.name === this.currentConfiguration);
          if (currentConfig) {
            const currentItem = items.find(item => item.label === currentConfig.configuration);
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
            const name = selectedItem ? configMap.get(selectedItem.label) : undefined;
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
      }

      if (selected) {
        const fallbacks = {
          target: this.currentTarget ?? undefined,
          debugTargets: [...this.currentDebugTargets]
        };

        this.currentConfiguration = selected;
        this.currentTarget = null;
        this.currentDebugTargets = [];

        // Find the configuration object to get the display name
        const selectedConfig = configurations.find(c => c.name === selected);
        const displayName = selectedConfig?.configuration || selected;
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
      if (!workspace || !this.currentGenerator || !this.currentWorkspace) {
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
      const sortedTargetNames = targets.map(target => target.name).sort();
      const itemNames = ['All Targets', ...sortedTargetNames];

      let selected: string | undefined;
      const defaultBuildTarget = this.currentConfiguration ? BuildSystemScanner.getDefaultBuildTarget(selectedWorkspaceInfo.path, this.currentConfiguration) : null;
      if (itemNames.length === 1) {
        selected = itemNames[0];
        this.output.appendLine(`Auto-selected target: ${selected} (only option available)`);
      } else {
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
      }

      if (selected) {
        this.currentTarget = selected;
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
      if (!workspace || !this.currentGenerator || !this.currentWorkspace) {
        vscode.window.showWarningMessage('Please select generator and workspace first.');
        return;
      }
      const generators = BuildSystemScanner.getGenerators(workspace);
      const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
      if (!selectedGenerator) return;
      const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
      const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
      if (!selectedWorkspaceInfo) return;
      const targets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
      const itemNames = targets.map(target => target.name).sort();
      if (itemNames.length === 0) {
        vscode.window.showWarningMessage('No targets found for debugging.');
        return;
      }
      let selected: string[] | undefined;
      if (itemNames.length === 1) {
        selected = [itemNames[0]];
        this.output.appendLine(`Auto-selected debug target: ${selected[0]} (only option available)`);
      } else {
        const items = itemNames.map(name => ({ label: name, picked: this.currentDebugTargets.includes(name) }));
        const selectedItems = await vscode.window.showQuickPick(items, { placeHolder: `Select debug targets for ${workspace.name}`, canPickMany: true });
        selected = selectedItems?.map(item => item.label);
      }
      if (selected && selected.length > 0) {
        this.currentDebugTargets = selected;
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
      if (!workspace || !this.currentGenerator || !this.currentWorkspace) {
        this.output.appendLine('Missing prerequisites: workspace, generator, or workspace not selected');
        vscode.window.showWarningMessage('Please select generator and workspace first.');
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
      const itemNames = targets.map(target => target.name).sort();
      this.output.appendLine(`Found ${itemNames.length} targets: ${itemNames.join(', ')}`);
      this.output.appendLine(`Current debug targets: ${this.currentDebugTargets.join(', ')}`);

      if (itemNames.length === 0) {
        this.output.appendLine('No targets found for debugging');
        vscode.window.showWarningMessage('No targets found for debugging.');
        return;
      }

      let selected: string | undefined;
      if (itemNames.length === 1) {
        selected = itemNames[0];
        this.output.appendLine(`Auto-selected single debug target: ${selected} (only option available)`);
      } else {
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
      }

      this.output.appendLine(`Final selected value: ${selected || 'undefined'}`);
      if (selected) {
        this.output.appendLine('Updating debug targets and status bar');
        this.currentDebugTargets = [selected];
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
  private async generateCompileCommands(showNotification: boolean = false): Promise<void> {
    if (!this.selectedWorkspaceFolder || !this.currentGenerator || !this.currentWorkspace || !this.currentConfiguration) {
      if (showNotification) {
        vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
      }
      return;
    }

    const generators = BuildSystemScanner.getGenerators(this.selectedWorkspaceFolder);
    const selectedGenerator = generators.find(gen => gen.name === this.currentGenerator);
    if (!selectedGenerator) return;

    const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
    const selectedWorkspaceInfo = workspaces.find(ws => ws.name === this.currentWorkspace);
    if (!selectedWorkspaceInfo) return;

    // Dispose existing watcher
    if (this.compileCommandsWatcher) {
      this.compileCommandsWatcher.dispose();
      this.compileCommandsWatcher = null;
    }

    try {
      this.output.appendLine('Generating compile_commands.json...');
      
      const outputPath = await CompileCommandsGenerator.generateForWorkspace(
        this.selectedWorkspaceFolder,
        selectedWorkspaceInfo.path,
        this.currentConfiguration,
        this.currentTarget || undefined
      );

      if (outputPath) {
        this.output.appendLine(`Generated compile_commands.json at: ${outputPath}`);
        if (showNotification) {
          vscode.window.showInformationMessage(`Generated compile_commands.json for ${this.currentConfiguration}`);
        }

        // Set up watcher for changes
        this.compileCommandsWatcher = CompileCommandsGenerator.createWatcher(
          this.selectedWorkspaceFolder,
          selectedWorkspaceInfo.path,
          this.currentConfiguration,
          this.currentTarget || undefined
        );
      }
    } catch (error) {
      this.output.appendLine(`Error generating compile_commands.json: ${error}`);
      if (showNotification) {
        vscode.window.showErrorMessage(`Failed to generate compile_commands.json: ${error}`);
      }
    }
  }
}


