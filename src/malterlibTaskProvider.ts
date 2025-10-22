import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BuildSystemScanner } from './buildSystemScanner';
import { MalterlibProjectDetector } from './malterlibProject';

interface MalterlibTaskDefinition extends vscode.TaskDefinition {
  type: 'malterlib';
  action: 'generate' | 'build' | 'buildTarget' | 'clean';
  generator?: string;
  workspace?: string;
  configuration?: string;
  target?: string;
}

interface GeneratorConfig {
  buildSystemFile: string;
  generator: string;
  generatorFamily: string;
  outputDir: string;
  priority?: number;
}

const buildProblemMatchers = ['$malterlib-build-clang', '$malterlib-build-ld', '$malterlib-build-cl', '$malterlib-build-clang-cl', '$malterlib-buildsystem', '$malterlib-buildsystem-windows'];

export class MalterlibTaskProvider implements vscode.TaskProvider {
  static readonly taskType = 'malterlib';

  constructor(
    private getCurrentSelections: () => {
      generator: string | null;
      workspace: string | null;
      configuration: string | null;
      target: string | null;
    },
    private getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null
  ) { }

  provideTasks(): Thenable<vscode.Task[]> {
    return this.getTasks();
  }

  resolveTask(_task: vscode.Task): vscode.Task | undefined {
    const definition = _task.definition as MalterlibTaskDefinition;
    if (definition.type === 'malterlib') {
      const includeWorkspace = definition.workspace !== undefined;
      return this.createTask(definition, undefined, includeWorkspace) || undefined;
    }
    return undefined;
  }

  private async getTasks(): Promise<vscode.Task[]> {
    const tasks: vscode.Task[] = [];

    await MalterlibProjectDetector.waitForDetectorQueue();
    await BuildSystemScanner.waitForScannerQueue();

    const workspaceFolder = this.getSelectedWorkspaceFolder();
    if (!workspaceFolder)
      return tasks;

    // Generate tasks - always available if we have a generator
    const selections = this.getCurrentSelections();

    if (selections.generator) {
      // Task 1: Generate for specific workspace (if workspace is selected)
      if (selections.workspace) {
        const workspaceGenerateTask = this.createGenerateTask(workspaceFolder, selections, true);
        if (workspaceGenerateTask)
          tasks.push(workspaceGenerateTask);
      }

      // Task 2: Generate all (no workspace specified)
      const allGenerateTask = this.createGenerateTask(workspaceFolder, selections, false);
      if (allGenerateTask)
        tasks.push(allGenerateTask);

      // Task 3: Build workspace (if workspace and configuration are selected)
      if (selections.workspace && selections.configuration) {
        const buildTask = this.createBuildTask(workspaceFolder, selections);
        if (buildTask)
          tasks.push(buildTask);
      }

      // Task 4: Build target (only when a specific target is selected)
      if (selections.workspace && selections.configuration && selections.target && selections.target !== 'All Targets') {
        const buildTargetTask = this.createBuildTargetTask(workspaceFolder, selections);
        if (buildTargetTask)
          tasks.push(buildTargetTask);
      }
    }

    return tasks;
  }

  private createGenerateTask(
    workspaceFolder: vscode.WorkspaceFolder,
    selections: { generator: string | null; workspace: string | null; configuration: string | null; target: string | null },
    includeWorkspace: boolean
  ): vscode.Task | undefined {
    if (!selections.generator) return undefined;

    const definition: MalterlibTaskDefinition = {
      type: 'malterlib',
      action: 'generate',
      generator: selections.generator,
      workspace: includeWorkspace ? (selections.workspace || undefined) : undefined,
      configuration: selections.configuration || undefined,
      target: selections.target || undefined
    };

    return this.createTask(definition, workspaceFolder, includeWorkspace);
  }

  private createBuildTask(
    workspaceFolder: vscode.WorkspaceFolder,
    selections: { generator: string | null; workspace: string | null; configuration: string | null; target: string | null }
  ): vscode.Task | undefined {
    if (!selections.generator || !selections.workspace || !selections.configuration) return undefined;

    const definition: MalterlibTaskDefinition = {
      type: 'malterlib',
      action: 'build',
      generator: selections.generator,
      workspace: selections.workspace,
      configuration: selections.configuration,
      target: selections.target || undefined
    };

    return this.createTask(definition, workspaceFolder);
  }

  private createBuildTargetTask(
    workspaceFolder: vscode.WorkspaceFolder,
    selections: { generator: string | null; workspace: string | null; configuration: string | null; target: string | null }
  ): vscode.Task | undefined {
    if (!selections.generator || !selections.workspace || !selections.configuration || !selections.target) return undefined;
    if (selections.target === 'All Targets') return undefined;

    const definition: MalterlibTaskDefinition = {
      type: 'malterlib',
      action: 'buildTarget',
      generator: selections.generator,
      workspace: selections.workspace,
      configuration: selections.configuration,
      target: selections.target
    };

    return this.createTask(definition, workspaceFolder);
  }

  private createTask(definition: MalterlibTaskDefinition, workspaceFolder?: vscode.WorkspaceFolder, includeWorkspace?: boolean): vscode.Task | undefined {
    const wsFolder = workspaceFolder || this.getSelectedWorkspaceFolder();
    if (!wsFolder) return undefined;

    if (definition.action === 'generate') return this.createGenerateTaskImpl(definition, wsFolder, includeWorkspace);
    if (definition.action === 'build') return this.createBuildTaskImpl(definition, wsFolder);
    if (definition.action === 'buildTarget') return this.createBuildTargetTaskImpl(definition, wsFolder);

    return undefined;
  }

  private createGenerateTaskImpl(definition: MalterlibTaskDefinition, workspaceFolder: vscode.WorkspaceFolder, includeWorkspace?: boolean): vscode.Task | undefined {
    if (!definition.generator) return undefined;

    // Get generator configuration
    const generators = BuildSystemScanner.getGenerators(workspaceFolder);
    const selectedGenerator = generators.find(gen => gen.name === definition.generator);
    if (!selectedGenerator) return undefined;

    const generatorConfig = this.getGeneratorConfig(selectedGenerator.configStorePath);
    if (!generatorConfig) return undefined;

    // Build command arguments
    const args = this.buildGenerateCommand(generatorConfig, definition);

    // Create the task
    const execution = new vscode.ShellExecution('./mib', args, {
      cwd: workspaceFolder.uri.fsPath
    });

    // Use fixed task names so VS Code remembers them
    const taskName = includeWorkspace
      ? 'Generate Workspace'
      : 'Generate All';

    const task = new vscode.Task(
      definition,
      workspaceFolder,
      taskName,
      'Malterlib',
      execution,
      ['$malterlib-buildsystem', '$malterlib-buildsystem-windows'] // Build matcher
    );

    task.group = vscode.TaskGroup.Build;

    // Get clear terminal configuration
    const config = vscode.workspace.getConfiguration('malterlib', workspaceFolder);
    const clearTerminal = config.get<boolean>('clearTerminalOnBuild', true);

    task.presentationOptions = {
      echo: true,
      reveal: vscode.TaskRevealKind.Always,
      focus: false,
      panel: vscode.TaskPanelKind.Shared,
      showReuseMessage: true,
      clear: clearTerminal
    };

    return task;
  }

  private getGeneratorConfig(configStorePath: string): GeneratorConfig | undefined {
    const generatorJsonPath = path.join(configStorePath, 'Generator.json');

    if (!fs.existsSync(generatorJsonPath)) return undefined;

    try {
      const content = fs.readFileSync(generatorJsonPath, 'utf8');
      return JSON.parse(content) as GeneratorConfig;
    } catch (error) {
      console.error(`Error reading Generator.json: ${error}`);
      return undefined;
    }
  }

  private createBuildTaskImpl(definition: MalterlibTaskDefinition, workspaceFolder: vscode.WorkspaceFolder): vscode.Task | undefined {
    if (!definition.generator || !definition.workspace || !definition.configuration) return undefined;

    // Get generator configuration
    const generators = BuildSystemScanner.getGenerators(workspaceFolder);
    const selectedGenerator = generators.find(gen => gen.name === definition.generator);
    if (!selectedGenerator || !selectedGenerator.buildWorkspaceScript) return undefined;

    // Get workspace configuration to determine platform and architecture
    const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
    const selectedWorkspace = workspaces.find(ws => ws.name === definition.workspace);
    if (!selectedWorkspace) return undefined;

    // Get the specific configuration to get platform and architecture
    const workspaceConfig = BuildSystemScanner.getWorkspaceConfiguration(selectedWorkspace.path, definition.configuration);
    if (!workspaceConfig) return undefined;

    // Build command arguments
    // BuildXcodeWorkspace.sh Workspace Platform Architecture Configuration BuildSystemDir

    // Helper function to escape shell arguments
    const escapeShellArg = (arg: string): string => {
      // If the argument contains special characters, wrap it in single quotes
      // and escape any single quotes within it
      if (/[\\$`"'\s]/.test(arg))
        return `'${arg.replace(/'/g, "'\\''")}'`;

      return arg;
    };

    const args = [
      definition.workspace,
      workspaceConfig.platform,
      workspaceConfig.architecture,
      workspaceConfig.configuration,
      selectedGenerator.outputDir || 'BuildSystem/Default'
    ];

    // Set environment variable for MalterlibWorkspaceRoot
    const env = {
      ...process.env,
      MalterlibWorkspaceRoot: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath
    };

    // Create the task
    // Convert Windows path to Unix path for Git Bash on Windows
    const scriptPath = process.platform === 'win32'
      ? vscode.Uri.file(selectedGenerator.buildWorkspaceScript).path.replace(/^\/([a-z]):/, '/$1')
      : selectedGenerator.buildWorkspaceScript;

    // Build the command as a single string with properly escaped arguments
    const commandLine = `${escapeShellArg(scriptPath)} ${args.map(escapeShellArg).join(' ')}`;

    const execution = new vscode.ShellExecution(
      commandLine,
      {
        cwd: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath,
        env
      }
    );

    const taskName = 'Build Workspace';

    const task = new vscode.Task(
      definition,
      workspaceFolder,
      taskName,
      'Malterlib',
      execution,
      buildProblemMatchers
    );

    task.group = vscode.TaskGroup.Build;

    // Get clear terminal configuration
    const config = vscode.workspace.getConfiguration('malterlib', workspaceFolder);
    const clearTerminal = config.get<boolean>('clearTerminalOnBuild', true);

    task.presentationOptions = {
      echo: true,
      reveal: vscode.TaskRevealKind.Always,
      focus: false,
      panel: vscode.TaskPanelKind.Shared,
      showReuseMessage: true,
      clear: clearTerminal
    };

    return task;
  }

  private createBuildTargetTaskImpl(definition: MalterlibTaskDefinition, workspaceFolder: vscode.WorkspaceFolder): vscode.Task | undefined {
    if (!definition.generator || !definition.workspace || !definition.configuration || !definition.target) return undefined;
    if (definition.target === 'All Targets') return undefined;

    // Get generator configuration
    const generators = BuildSystemScanner.getGenerators(workspaceFolder);
    const selectedGenerator = generators.find(gen => gen.name === definition.generator);
    if (!selectedGenerator || !selectedGenerator.buildTargetScript) return undefined;

    // Get workspace info
    const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
    const selectedWorkspace = workspaces.find(ws => ws.name === definition.workspace);
    if (!selectedWorkspace) return undefined;

    // Determine platform/architecture/configuration from target-specific config if available; fall back to workspace-level config
    let platform: string | undefined;
    let architecture: string | undefined;
    let configurationName: string | undefined;
    let targetNameOverride: string | undefined;

    // Get the full target configuration info
    const targetConfigInfo = BuildSystemScanner.getTargetConfigInfo(selectedWorkspace.path, definition.target, definition.configuration);
    if (targetConfigInfo) {
      platform = targetConfigInfo.platform;
      architecture = targetConfigInfo.architecture;
      configurationName = targetConfigInfo.configuration;
      targetNameOverride = targetConfigInfo.targetName;
    }

    if (!platform || !architecture || !configurationName) {
      const workspaceConfig = BuildSystemScanner.getWorkspaceConfiguration(selectedWorkspace.path, definition.configuration);
      if (!workspaceConfig) return undefined;
      platform = platform || workspaceConfig.platform;
      architecture = architecture || workspaceConfig.architecture;
      configurationName = configurationName || workspaceConfig.configuration;
    }

    // Build command arguments
    // BuildXcodeTarget.sh Workspace Target Platform Architecture Configuration BuildSystemDir
    // Use targetName override if specified in configuration, otherwise use the original target name

    // Helper function to escape shell arguments
    const escapeShellArg = (arg: string): string => {
      // If the argument contains special characters, wrap it in single quotes
      // and escape any single quotes within it
      if (/[\\$`"'\s]/.test(arg))
        return `'${arg.replace(/'/g, "'\\''")}'`;
      return arg;
    };

    const args = [
      definition.workspace,
      targetNameOverride || definition.target,
      platform,
      architecture,
      configurationName,
      selectedGenerator.outputDir || 'BuildSystem/Default'
    ];

    // Set environment variable for MalterlibWorkspaceRoot
    const env = {
      ...process.env,
      MalterlibWorkspaceRoot: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath
    };

    // Create the task
    // Convert Windows path to Unix path for Git Bash on Windows
    const scriptPath = process.platform === 'win32'
      ? vscode.Uri.file(selectedGenerator.buildTargetScript).path.replace(/^\/([a-z]):/, '/$1')
      : selectedGenerator.buildTargetScript;

    // Build the command as a single string with properly escaped arguments
    const commandLine = `${escapeShellArg(scriptPath)} ${args.map(escapeShellArg).join(' ')}`;

    const execution = new vscode.ShellExecution(
      commandLine,
      {
        cwd: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath,
        env
      }
    );

    const taskName = 'Build Target';

    const task = new vscode.Task(
      definition,
      workspaceFolder,
      taskName,
      'Malterlib',
      execution,
      buildProblemMatchers
    );

    task.group = vscode.TaskGroup.Build;

    // Get clear terminal configuration
    const config = vscode.workspace.getConfiguration('malterlib', workspaceFolder);
    const clearTerminal = config.get<boolean>('clearTerminalOnBuild', true);

    task.presentationOptions = {
      echo: true,
      reveal: vscode.TaskRevealKind.Always,
      focus: false,
      panel: vscode.TaskPanelKind.Shared,
      showReuseMessage: true,
      clear: clearTerminal
    };

    return task;
  }

  private buildGenerateCommand(generatorConfig: GeneratorConfig, definition: MalterlibTaskDefinition): string[] {
    const args = ['generate'];

    // Add required arguments based on generator config
    args.push('--build-system', generatorConfig.buildSystemFile);
    args.push('--generator', generatorConfig.generator);
    args.push('--output-directory', generatorConfig.outputDir);

    // Add workspace if specified
    if (definition.workspace) args.push(definition.workspace);

    return args;
  }
}
