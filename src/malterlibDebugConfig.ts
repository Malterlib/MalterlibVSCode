import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for a single debug launch
 */
export interface MalterlibLaunchConfig {
  /** Unique name for this launch configuration */
  name: string;

  /** Whether this launch configuration is enabled (default: true) */
  enabled?: boolean;

  /** Working directory for the debugger */
  workingDirectory?: string;

  /** Environment variables to set */
  environment?: { [key: string]: string };

  /** Command line arguments to pass to the executable */
  arguments?: string[];

  /** Override the executable path */
  executablePath?: string;
}

/**
 * Configuration for a specific target within a workspace
 */
export interface MalterlibTargetConfig {
  /** Array of launch configurations for this target */
  launches: MalterlibLaunchConfig[];
}

/**
 * Configuration for a workspace
 */
export interface MalterlibWorkspaceConfig {
  /** Map of target name to target configuration */
  targets: { [targetName: string]: MalterlibTargetConfig };
}

/**
 * Root configuration structure for malterlib.json
 */
export interface MalterlibDebugConfig {
  /** Version of the configuration format */
  version?: string;

  /** Map of workspace name to workspace configuration */
  workspaces: { [workspaceName: string]: MalterlibWorkspaceConfig };
}

/**
 * Manages loading and watching the malterlib.json configuration file
 */
export class MalterlibConfigManager {
  private baseConfig: MalterlibDebugConfig | null = null;
  private localConfig: MalterlibDebugConfig | null = null;
  private mergedConfig: MalterlibDebugConfig | null = null;
  private configPath: string | null = null;
  private localConfigPath: string | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private localFileWatcher: vscode.FileSystemWatcher | null = null;
  private onConfigChangedEmitter = new vscode.EventEmitter<MalterlibDebugConfig | null>();

  /** Event fired when configuration changes */
  readonly onConfigChanged = this.onConfigChangedEmitter.event;

  constructor(private workspaceFolder: vscode.WorkspaceFolder) {
    this.configPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'malterlib.json');
    this.localConfigPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'malterlib.local.json');
  }

  /**
   * Initialize the configuration manager and start watching for changes
   */
  async initialize(): Promise<void> {
    await this.loadConfigs();
    this.startWatching();
  }

  /**
   * Load both base and local configurations from disk and merge them
   */
  private async loadConfigs(): Promise<void> {
    await this.loadBaseConfig();
    await this.loadLocalConfig();
    this.mergeConfigs();
  }

  /**
   * Load the base configuration from malterlib.json
   */
  private async loadBaseConfig(): Promise<void> {
    if (!this.configPath) {
      this.baseConfig = null;
      return;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        this.baseConfig = null;
        return;
      }

      const content = await fs.promises.readFile(this.configPath, 'utf8');
      
      // Check if content is empty or just whitespace
      if (!content.trim()) {
        console.warn('Base config file is empty, treating as no config');
        this.baseConfig = null;
        return;
      }
      
      try {
        this.baseConfig = JSON.parse(content) as MalterlibDebugConfig;
      } catch (parseError) {
        console.error(`Failed to parse malterlib.json: ${parseError}`);
        // Don't update config if parsing fails - keep the last valid config
        return;
      }
    } catch (error) {
      console.error(`Failed to load malterlib.json: ${error}`);
      // Don't null out config on read errors - keep the last valid config
      // This prevents losing the config if file is temporarily inaccessible
    }
  }

  /**
   * Load the local configuration from malterlib.local.json
   */
  private async loadLocalConfig(): Promise<void> {
    if (!this.localConfigPath) {
      this.localConfig = null;
      return;
    }

    try {
      if (!fs.existsSync(this.localConfigPath)) {
        this.localConfig = null;
        return;
      }

      const content = await fs.promises.readFile(this.localConfigPath, 'utf8');
      
      // Check if content is empty or just whitespace
      if (!content.trim()) {
        console.warn('Local config file is empty, treating as no config');
        this.localConfig = null;
        return;
      }
      
      try {
        this.localConfig = JSON.parse(content) as MalterlibDebugConfig;
      } catch (parseError) {
        console.error(`Failed to parse malterlib.local.json: ${parseError}`);
        // Don't update config if parsing fails - keep the last valid config
        return;
      }
    } catch (error) {
      console.error(`Failed to load malterlib.local.json: ${error}`);
      // Don't null out config on read errors - keep the last valid config
      // This prevents losing the config if file is temporarily inaccessible
    }
  }

  /**
   * Merge base and local configurations
   * Local config takes precedence over base config
   * Launch configs are identified by name for merging
   */
  private mergeConfigs(): void {
    // Start with base config or empty config
    const base = this.baseConfig || { workspaces: {} };
    const local = this.localConfig;

    // If no local config, just use base
    if (!local) {
      const configChanged = JSON.stringify(this.mergedConfig) !== JSON.stringify(base);
      this.mergedConfig = base.workspaces ? base : null;
      if (configChanged)
        this.onConfigChangedEmitter.fire(this.mergedConfig);
      return;
    }

    // Deep clone base to avoid mutations
    const merged: MalterlibDebugConfig = JSON.parse(JSON.stringify(base));

    // Merge workspaces
    for (const workspaceName in local.workspaces) {
      const localWorkspace = local.workspaces[workspaceName];
      
      if (!merged.workspaces[workspaceName]) {
        // Workspace doesn't exist in base, add it entirely
        merged.workspaces[workspaceName] = localWorkspace;
      } else {
        // Merge targets within the workspace
        const baseWorkspace = merged.workspaces[workspaceName];
        
        for (const targetName in localWorkspace.targets) {
          const localTarget = localWorkspace.targets[targetName];
          
          if (!baseWorkspace.targets[targetName]) {
            // Target doesn't exist in base, add it entirely
            baseWorkspace.targets[targetName] = localTarget;
          } else {
            // Merge launch configs by name
            const baseTarget = baseWorkspace.targets[targetName];
            const baseLaunches = baseTarget.launches || [];
            const localLaunches = localTarget.launches || [];
            
            // Create a map of base launches by name (apply default name if not set)
            const launchMap = new Map<string, MalterlibLaunchConfig>();
            for (const launch of baseLaunches) {
              // Use target name as default if launch doesn't have a name
              const launchName = launch.name || targetName;
              launchMap.set(launchName, { ...launch, name: launchName });
            }
            
            // Override or add local launches
            for (const localLaunch of localLaunches) {
              // Apply default name if not set
              const localLaunchName = localLaunch.name || targetName;
              const baseLaunch = launchMap.get(localLaunchName);
              
              if (baseLaunch) {
                // Merge local properties into base launch
                const merged: MalterlibLaunchConfig = { ...baseLaunch };
                
                // Override with local values if they're defined
                if (localLaunch.name !== undefined) merged.name = localLaunch.name;
                if (localLaunch.enabled !== undefined) merged.enabled = localLaunch.enabled;
                if (localLaunch.executablePath !== undefined) merged.executablePath = localLaunch.executablePath;
                if (localLaunch.workingDirectory !== undefined) merged.workingDirectory = localLaunch.workingDirectory;
                if (localLaunch.arguments !== undefined) merged.arguments = localLaunch.arguments;
                if (localLaunch.environment !== undefined) merged.environment = localLaunch.environment;
                
                launchMap.set(localLaunchName, merged);
              } else {
                // New local launch, add it entirely (with default name if needed)
                launchMap.set(localLaunchName, { ...localLaunch, name: localLaunchName });
              }
            }
            
            // Convert back to array
            baseTarget.launches = Array.from(launchMap.values());
          }
        }
      }
    }

    // Update version if local has one
    if (local.version)
      merged.version = local.version;

    const configChanged = JSON.stringify(this.mergedConfig) !== JSON.stringify(merged);
    this.mergedConfig = merged;
    
    if (configChanged)
      this.onConfigChangedEmitter.fire(this.mergedConfig);
  }

  /**
   * Start watching the configuration files for changes
   */
  private startWatching(): void {
    // Watch base config
    if (this.configPath) {
      const pattern = new vscode.RelativePattern(this.workspaceFolder, '.vscode/malterlib.json');
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

      this.fileWatcher.onDidCreate(() => this.loadConfigs());
      this.fileWatcher.onDidChange(() => this.loadConfigs());
      this.fileWatcher.onDidDelete(() => {
        this.baseConfig = null;
        this.loadConfigs();
      });
    }

    // Watch local config
    if (this.localConfigPath) {
      const localPattern = new vscode.RelativePattern(this.workspaceFolder, '.vscode/malterlib.local.json');
      this.localFileWatcher = vscode.workspace.createFileSystemWatcher(localPattern);

      this.localFileWatcher.onDidCreate(() => this.loadConfigs());
      this.localFileWatcher.onDidChange(() => this.loadConfigs());
      this.localFileWatcher.onDidDelete(() => {
        this.localConfig = null;
        this.loadConfigs();
      });
    }
  }

  /**
   * Get launch configurations for a specific workspace and target
   */
  getLaunchConfigs(workspace: string, target: string): MalterlibLaunchConfig[] {
    if (!this.mergedConfig)
      return [];

    const workspaceConfig = this.mergedConfig.workspaces[workspace];
    if (!workspaceConfig)
      return [];

    const targetConfig = workspaceConfig.targets[target];
    if (!targetConfig)
      return [];

    return targetConfig.launches || [];
  }

  /**
   * Get all configured workspaces
   */
  getWorkspaces(): string[] {
    if (!this.mergedConfig)
      return [];

    return Object.keys(this.mergedConfig.workspaces);
  }

  /**
   * Get all configured targets for a workspace
   */
  getTargets(workspace: string): string[] {
    if (!this.mergedConfig)
      return [];

    const workspaceConfig = this.mergedConfig.workspaces[workspace];
    if (!workspaceConfig)
      return [];

    return Object.keys(workspaceConfig.targets);
  }

  /**
   * Check if configuration exists
   */
  hasConfig(): boolean {
    return this.mergedConfig !== null;
  }

  /**
   * Get base configuration for a specific workspace and target
   * Used by config editor to show defaults when editing local.json
   */
  getBaseLaunchConfigs(workspace: string, target: string): MalterlibLaunchConfig[] {
    if (!this.baseConfig)
      return [];

    const workspaceConfig = this.baseConfig.workspaces[workspace];
    if (!workspaceConfig)
      return [];

    const targetConfig = workspaceConfig.targets[target];
    if (!targetConfig)
      return [];

    return targetConfig.launches || [];
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    if (this.localFileWatcher) {
      this.localFileWatcher.dispose();
      this.localFileWatcher = null;
    }
    this.onConfigChangedEmitter.dispose();
  }
}