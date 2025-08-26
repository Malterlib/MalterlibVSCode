import * as vscode from 'vscode';
import { BuildSystemScanner } from './buildSystemScanner';
import { MalterlibConfigManager, MalterlibLaunchConfig } from './malterlibDebugConfig';

type SelectionSnapshot = {
  generator: string | null;
  workspace: string | null;
  configuration: string | null;
  target: string | null;
};

/**
 * Provides dynamic LLDB launch configurations derived from Malterlib ConfigStore.
 * This plugs into CodeLLDB (debug type 'lldb').
 */
export class MalterlibLaunchProvider implements vscode.DebugConfigurationProvider {
  static readonly debugType = 'lldb';
  private configManagers: Map<string, MalterlibConfigManager> = new Map();

  constructor(
    private readonly getSelectionSnapshot: () => SelectionSnapshot,
    private readonly getDebugTargetsSnapshot: () => string[],
    private readonly getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private readonly output: vscode.OutputChannel,
  ) {
  }

  async initialize(): Promise<void> {
    // Config managers are now initialized on demand per workspace folder
  }

  private async getOrCreateConfigManager(workspaceFolder: vscode.WorkspaceFolder): Promise<MalterlibConfigManager> {
    const key = workspaceFolder.uri.fsPath;
    let configManager = this.configManagers.get(key);

    if (!configManager) {
      configManager = new MalterlibConfigManager(workspaceFolder);
      await configManager.initialize();
      this.configManagers.set(key, configManager);
    }

    return configManager;
  }

  dispose(): void {
    for (const configManager of this.configManagers.values())
      configManager.dispose();
    this.configManagers.clear();
  }

  provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    // Dynamic: return a single stable-name stub; selection handled during resolve
    return [
      {
        type: MalterlibLaunchProvider.debugType,
        request: 'launch',
        name: 'Malterlib',
        malterlib: { useSelection: true }
      }
    ];
  }

  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined> {
    const workspaceFolder = this.getSelectedWorkspaceFolder();
    if (!workspaceFolder)
      return undefined;

    // If user invoked generic 'Run and Debug' without launch.json, synthesize from selection
    if (!debugConfiguration || Object.keys(debugConfiguration).length === 0) {
      const configs = await this.createDebugConfigurations();
      if (configs.length > 1) {
        const preLaunchTask = debugConfiguration?.preLaunchTask;
        void Promise.all(configs.map(cfg => {
          const merged = { ...cfg } as vscode.DebugConfiguration;
          if (preLaunchTask) merged.preLaunchTask = preLaunchTask;
          return vscode.debug.startDebugging(workspaceFolder, merged);
        }));
        return undefined;
      }
      if (configs.length === 1)
        return configs[0];
      vscode.window.showWarningMessage('Malterlib: No debug configuration available for current selection.');
      return undefined;
    }

    // If a stub was inserted into launch.json, resolve it to the current selection
    if (debugConfiguration.malterlib?.useSelection === true || (!debugConfiguration.program && typeof debugConfiguration.name === 'string' && debugConfiguration.name.startsWith('Malterlib:'))) {
      const configs = await this.createDebugConfigurations();
      if (configs.length === 0)
        return undefined;
      if (configs.length > 1) {
        const preLaunchTask = debugConfiguration.preLaunchTask;
        void Promise.all(configs.map(cfg => {
          const merged = { ...cfg } as vscode.DebugConfiguration;
          if (preLaunchTask) merged.preLaunchTask = preLaunchTask;
          return vscode.debug.startDebugging(workspaceFolder, merged);
        }));
        return undefined;
      }
      const resolved = configs[0];
      // Strip our internal marker if present
      delete debugConfiguration.malterlib;
      return { ...debugConfiguration, ...resolved };
    }

    return debugConfiguration;
  }

  private async createDebugConfigurations(): Promise<vscode.DebugConfiguration[]> {
    const workspaceFolder = this.getSelectedWorkspaceFolder();
    if (!workspaceFolder)
      return [];

    const selection = this.getSelectionSnapshot();
    const selectedDebugTargets = this.getDebugTargetsSnapshot();

    if (!selection.generator || !selection.workspace || !selection.configuration)
      return [];

    const generators = BuildSystemScanner.getGenerators(workspaceFolder);
    const selectedGenerator = generators.find(g => g.name === selection.generator);
    if (!selectedGenerator)
      return [];

    const workspaces = BuildSystemScanner.getWorkspaces(selectedGenerator.path);
    const selectedWorkspaceInfo = workspaces.find(w => w.name === selection.workspace);
    if (!selectedWorkspaceInfo)
      return [];

    const configurationName = selection.configuration;
    const workspaceConfig = BuildSystemScanner.getWorkspaceConfiguration(selectedGenerator.path, configurationName);

    // Determine which targets to create configs for
    let targetNames: string[] = [];
    if (selectedDebugTargets.length > 0)
      targetNames = selectedDebugTargets;
    else {
      // fall back to defaults
      targetNames = BuildSystemScanner.getDefaultDebugTargets(selectedWorkspaceInfo.path, configurationName);
    }
    if (targetNames.length === 0)
      return [];

    const allTargets = BuildSystemScanner.getTargets(selectedWorkspaceInfo.path);
    const configs: vscode.DebugConfiguration[] = [];

    for (const targetName of targetNames) {
      // Check if we have custom launch configurations for this target
      const configManager = await this.getOrCreateConfigManager(workspaceFolder);
      const customLaunches = configManager.getLaunchConfigs(selection.workspace, targetName) || [];

      // Filter to only enabled custom launches
      const enabledLaunches = customLaunches.filter(launch => launch.enabled !== false);
      
      if (enabledLaunches.length > 0) {
        // Use custom launch configurations - only enabled ones
        for (const customLaunch of enabledLaunches) {
          const config = await this.createCustomDebugConfig(
            customLaunch,
            targetName,
            configurationName,
            selectedGenerator,
            selectedWorkspaceInfo,
            workspaceFolder,
            allTargets
          );
          if (config)
            configs.push(config);
        }
      } else {
        // Fall back to default configuration
        const targetInfo = allTargets.find(t => t.name === targetName);
        if (!targetInfo)
          continue;

        // Target-level configuration for current configuration
        const targetConfigs = BuildSystemScanner.getConfigurations(targetInfo.path);
        const targetCfg = targetConfigs.find(c => c.name === configurationName);
        if (!targetCfg)
          continue;

        // Local vs remote debug commands are captured in TargetConfigInfo (read via scanTargetConfigurations)
        const targetCfgMap = targetInfo.configurations;
        const targetCfgInfo = targetCfgMap?.get(configurationName);
        const localCmd = targetCfgInfo?.localDebuggerCommand;
        const localCwd = targetCfgInfo?.localDebuggerWorkingDirectory;
        const remoteCmd = targetCfgInfo?.remoteDebuggerCommand;
        const remoteCwd = targetCfgInfo?.remoteDebuggerWorkingDirectory;
        const extraArgs = targetCfgInfo?.debuggerCommandArguments || [];

        // Prefer local command if present. If not, fall back to remote (user can forward manually).
        const program = localCmd || remoteCmd;
        const cwd = localCmd ? localCwd : remoteCwd;
        if (!program)
          continue;

        const lldbConfig: vscode.DebugConfiguration = {
          type: MalterlibLaunchProvider.debugType,
          request: 'launch',
          name : targetName,
          program,
          args: extraArgs,
          cwd: cwd || selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath,
          // Let CodeLLDB find symbols etc. Users can tweak via launch.json if needed
          env: {
            MalterlibWorkspaceRoot: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath
          }
        };

        // On macOS arm64, ensure lldb uses system arch when needed; keep minimal for now

        configs.push(lldbConfig);
      }
    }

    // Log created configs for diagnostics
    if (configs.length > 0)
      this.output.appendLine(`MalterlibLaunchProvider: created ${configs.length} LLDB configurations for ${selection.workspace} / ${configurationName}`);

    return configs;
  }

  private async createCustomDebugConfig(
    customLaunch: MalterlibLaunchConfig,
    targetName: string,
    configurationName: string,
    selectedGenerator: any,
    _selectedWorkspaceInfo: any,
    workspaceFolder: vscode.WorkspaceFolder,
    allTargets: any[]
  ): Promise<vscode.DebugConfiguration | null> {
    const targetInfo = allTargets.find(t => t.name === targetName);
    if (!targetInfo)
      return null;

    // Target-level configuration for current configuration
    const targetConfigs = BuildSystemScanner.getConfigurations(targetInfo.path);
    const targetCfg = targetConfigs.find(c => c.name === configurationName);
    if (!targetCfg)
      return null;

    // Local vs remote debug commands are captured in TargetConfigInfo
    const targetCfgMap = targetInfo.configurations;
    const targetCfgInfo = targetCfgMap?.get(configurationName);
    const localCmd = targetCfgInfo?.localDebuggerCommand;
    const localCwd = targetCfgInfo?.localDebuggerWorkingDirectory;
    const remoteCmd = targetCfgInfo?.remoteDebuggerCommand;
    const remoteCwd = targetCfgInfo?.remoteDebuggerWorkingDirectory;
    const defaultArgs = targetCfgInfo?.debuggerCommandArguments || [];

    // Start with the default program path, then override if custom path provided
    const defaultProgram = localCmd || remoteCmd;
    const program = customLaunch.executablePath || defaultProgram;
    if (!program)
      return null;

    // Use custom working directory if provided, otherwise fall back to defaults
    const defaultCwd = localCmd ? localCwd : remoteCwd;
    const cwd = customLaunch.workingDirectory ||
                defaultCwd ||
                selectedGenerator.buildSystemBasePath ||
                workspaceFolder.uri.fsPath;

    // Combine default args with custom args (custom args override)
    const args = customLaunch.arguments || defaultArgs;

    // Merge environment variables
    const defaultEnv = {
      MalterlibWorkspaceRoot: selectedGenerator.buildSystemBasePath || workspaceFolder.uri.fsPath
    };
    const env = { ...defaultEnv, ...(customLaunch.environment || {}) };

    const name = customLaunch.name || targetName;

    const lldbConfig: vscode.DebugConfiguration = {
      type: MalterlibLaunchProvider.debugType,
      request: 'launch',
      name,
      program,
      args,
      cwd,
      env
    };

    return lldbConfig;
  }
}


