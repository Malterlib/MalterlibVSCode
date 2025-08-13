import * as vscode from 'vscode';
import { BuildSystemScanner } from './buildSystemScanner';
import { MalterlibProjectDetector } from './malterlibProject';

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

  constructor(
    private readonly getSelectionSnapshot: () => SelectionSnapshot,
    private readonly getDebugTargetsSnapshot: () => string[],
    private readonly getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private readonly output: vscode.OutputChannel,
  ) {
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

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    const workspaceFolder = this.getSelectedWorkspaceFolder();
    if (!workspaceFolder)
      return undefined;

    // If user invoked generic 'Run and Debug' without launch.json, synthesize from selection
    if (!debugConfiguration || Object.keys(debugConfiguration).length === 0) {
      const configs = this.createDebugConfigurations();
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
      const configs = this.createDebugConfigurations();
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

  private createDebugConfigurations(): vscode.DebugConfiguration[] {
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

      const name = `Malterlib: ${targetName} (${configurationName})`;

      const lldbConfig: vscode.DebugConfiguration = {
        type: MalterlibLaunchProvider.debugType,
        request: 'launch',
        name,
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

    // Log created configs for diagnostics
    if (configs.length > 0)
      this.output.appendLine(`MalterlibLaunchProvider: created ${configs.length} LLDB configurations for ${selection.workspace} / ${configurationName}`);

    return configs;
  }
}


