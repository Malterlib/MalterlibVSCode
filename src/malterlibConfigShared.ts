import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BuildSystemScanner } from './buildSystemScanner';
import { StatusBarController } from './statusBarController';
import { MalterlibDebugConfig } from './malterlibDebugConfig';

export interface ScannerData {
  [workspaceName: string]: {
    targets: string[];
    defaultConfigs: { [targetName: string]: { [configName: string]: any } };
    baseLaunches?: { [targetName: string]: any[] }; // Base config launches when editing local.json
  };
}

/**
 * Shared utilities for the Malterlib configuration editor
 */
export class MalterlibConfigShared {
  public static getScannerData(statusController?: StatusBarController, isLocalConfig: boolean = false): ScannerData {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
      return {};

    const generators = BuildSystemScanner.getGenerators(workspaceFolder);
    const workspaceData: ScannerData = {};

    // Get configuration from selection state or use first available
    let defaultConfigName = 'Debug';
    if (statusController) {
      const snapshot = statusController.getSelectionSnapshot();
      if (snapshot.configuration)
        defaultConfigName = snapshot.configuration;
    }

    // If no configuration from selection, get first available
    if (defaultConfigName === 'Debug') {
      for (const generator of generators) {
        const workspaces = BuildSystemScanner.getWorkspaces(generator.path);
        if (workspaces.length > 0) {
          const configurations = BuildSystemScanner.getWorkspaceConfigurations_WorkspaceLevel(workspaces[0].path);
          if (configurations.length > 0) {
            defaultConfigName = configurations[0].name;
            break;
          }
        }
      }
    }

    // Load base config if editing local.json
    let baseConfig: MalterlibDebugConfig | null = null;
    if (isLocalConfig) {
      const baseConfigPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'malterlib.json');
      try {
        if (fs.existsSync(baseConfigPath)) {
          const content = fs.readFileSync(baseConfigPath, 'utf8');
          if (content.trim())
            baseConfig = JSON.parse(content) as MalterlibDebugConfig;
        }
      } catch (error) {
        console.error(`Failed to load base config for local.json defaults: ${error}`);
      }
    }

    for (const generator of generators) {
      const workspaces = BuildSystemScanner.getWorkspaces(generator.path);
      for (const workspace of workspaces) {
        const targets = BuildSystemScanner.getTargets(workspace.path);
        const debuggableTargets: string[] = [];
        const defaultConfigs: { [targetName: string]: { [configName: string]: any } } = {};

        // Get all available configurations
        const configurations = BuildSystemScanner.getWorkspaceConfigurations_WorkspaceLevel(workspace.path);

        // Filter to only include targets with valid debug commands
        for (const target of targets) {
          const targetCfgMap = target.configurations;
          let targetCfgInfo = targetCfgMap?.get(defaultConfigName);
          if (!targetCfgInfo && targetCfgMap) {
            for (const value of targetCfgMap.values()) {
              targetCfgInfo = value;
              break;
            }
          }

          if (!targetCfgInfo)
            continue;

          // Check if target has a program (local or remote debug command)
          const localCmd = targetCfgInfo?.localDebuggerCommand;
          const remoteCmd = targetCfgInfo?.remoteDebuggerCommand;
          const program = localCmd || remoteCmd;

          if (program) {
            debuggableTargets.push(target.name);

            // Generate default configs for all configurations
            defaultConfigs[target.name] = {};
            for (const config of configurations) {
              let cfgInfo = targetCfgMap?.get(config.name);
              if (!cfgInfo && targetCfgMap) {
                for (const value of targetCfgMap.values()) {
                  cfgInfo = value;
                  break;
                }
              }
              if (!cfgInfo)
                continue;

              const localCommand = cfgInfo.localDebuggerCommand;
              const localWorkingDir = cfgInfo.localDebuggerWorkingDirectory;
              const remoteCommand = cfgInfo.remoteDebuggerCommand;
              const remoteWorkingDir = cfgInfo.remoteDebuggerWorkingDirectory;
              const extraArgs = cfgInfo.debuggerCommandArguments || [];

              // Prefer local command if present. If not, fall back to remote
              const execPath = localCommand || remoteCommand || '';
              const workDir = localCommand ? localWorkingDir : remoteWorkingDir;

              // Start with scanner defaults
              let defaultConfig = {
                name: target.name,
                executablePath: execPath,
                workingDirectory: workDir || generator.buildSystemBasePath || workspaceFolder.uri.fsPath,
                arguments: extraArgs,
                environment: {}
              };

              // If editing local.json, merge base config values as defaults
              if (isLocalConfig && baseConfig) {
                const baseLaunches = baseConfig.workspaces?.[workspace.name]?.targets?.[target.name]?.launches;
                if (baseLaunches && baseLaunches.length > 0) {
                  // Use first launch config from base as default
                  const baseLaunch = baseLaunches[0];
                  defaultConfig = {
                    ...defaultConfig,
                    name: baseLaunch.name || defaultConfig.name,
                    executablePath: baseLaunch.executablePath || defaultConfig.executablePath,
                    workingDirectory: baseLaunch.workingDirectory || defaultConfig.workingDirectory,
                    arguments: baseLaunch.arguments || defaultConfig.arguments,
                    environment: baseLaunch.environment || defaultConfig.environment
                  };
                }
              }

              defaultConfigs[target.name][config.name] = defaultConfig;
            }
          }
        }

        if (debuggableTargets.length > 0) {
          const data: any = {
            targets: debuggableTargets,
            defaultConfigs: defaultConfigs
          };

          // If editing local.json, include base launches
          if (isLocalConfig && baseConfig) {
            data.baseLaunches = {};
            for (const targetName of debuggableTargets) {
              const baseLaunches = baseConfig.workspaces?.[workspace.name]?.targets?.[targetName]?.launches;
              if (baseLaunches)
                data.baseLaunches[targetName] = baseLaunches;
            }
          }

          workspaceData[workspace.name] = data;
        }
      }
    }

    return workspaceData;
  }

  public static getSelectionState(statusController?: StatusBarController) {
    let selectedWorkspace: string | null = null;
    let selectedConfiguration: string | null = null;
    let debugTargets: string[] = [];

    if (statusController) {
      const snapshot = statusController.getSelectionSnapshot();
      selectedWorkspace = snapshot.workspace;
      selectedConfiguration = snapshot.configuration;
      debugTargets = statusController.getDebugTargetsSnapshot();
    }

    return {
      selectedWorkspace,
      selectedConfiguration,
      debugTargets
    };
  }

  public static getWebviewContent(
    webview: vscode.Webview,
    extensionPath: string
  ): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(extensionPath, 'media', 'configEditor.js')
    ));

    const styleUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(extensionPath, 'media', 'configEditor.css')
    ));

    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <title>Malterlib Debug Configuration</title>
    </head>
    <body>
        <div class="split-container">
            <div class="tree-panel" id="tree-panel">
                <div class="tree-header">
                    <h2>Workspaces & Targets</h2>
                    <div class="tree-buttons">
                        <button id="filter-tree-btn" class="btn btn-small active" title="Filter by selection">🔍</button>
                        <button id="select-multi-debug-btn" class="btn btn-small" title="Select multiple debug targets">📋</button>
                        <button id="select-single-debug-btn" class="btn btn-small" title="Select single debug target">🎯</button>
                    </div>
                </div>
                <div id="tree-container">
                    <!-- Tree will be dynamically populated here -->
                </div>
            </div>

            <div class="resize-handle" id="resize-handle"></div>

            <div class="config-panel" id="config-panel">
                <div class="config-header">
                    <h2 id="config-title">Select a target to configure</h2>
                </div>

                <div id="config-container">
                    <div id="empty-state">
                        <p>Select a target from the tree to configure its launch settings.</p>
                    </div>

                    <div id="target-config" style="display: none;">
                        <div class="tab-bar">
                            <div id="tabs-container">
                                <!-- Tabs will be dynamically added here -->
                            </div>
                            <button id="add-launch-btn" class="btn-add-tab" title="Add Launch Configuration">+</button>
                            <button id="add-postcopy-launch-btn" class="btn-add-tab btn-postcopy-tab" title="Add Launch from PostCopy.MConfig">📦</button>
                        </div>

                        <div id="launch-content">
                            <!-- Active launch configuration will be shown here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}