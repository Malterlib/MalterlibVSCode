import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';

export interface GeneratorInfo {
  name: string;
  path: string;
  configStorePath: string;
  priority?: number;
  buildSystemBasePath?: string;
  buildSystemFile?: string;
  generator?: string;
  generatorFamily?: string;
  outputDir?: string;
  buildTargetScript?: string;
  buildWorkspaceScript?: string;
}

export interface WorkspaceConfigInfo {
  name: string;
  path: string;
  platform: string;
  architecture: string;
  configuration: string;
  configurationPriority?: number;
  defaultBuildTarget?: string;
  defaultDebugTargets?: string[];
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  targetsPath: string;
  priority?: number;
  configurations?: Map<string, WorkspaceConfigInfo>;
}

export interface TargetConfigInfo {
  name: string;
  path: string;
  platform: string;
  architecture: string;
  configuration: string;
  debugPriority?: number;
  debuggerCommandArguments?: string[];
  localDebuggerCommand?: string;
  localDebuggerWorkingDirectory?: string;
  remoteDebuggerCommand?: string;
  remoteDebuggerWorkingDirectory?: string;
}

export interface TargetInfo {
  name: string;
  path: string;
  configsPath: string;
  priority?: number;
  configurations?: Map<string, TargetConfigInfo>;
}

export interface ConfigurationInfo {
  name: string;
  path: string;
  platform: string;
  architecture: string;
  configuration: string;
  debugPriority?: number;
}

export class BuildSystemScanner {
  private static generators = new Map<string, GeneratorInfo[]>();
  private static workspaces = new Map<string, WorkspaceInfo[]>();
  private static targets = new Map<string, TargetInfo[]>();
  private static configurations = new Map<string, ConfigurationInfo[]>();
  
  // Async listeners that the queue will await before considering a task complete
  private static asyncScanningListeners = new Set<(event: string) => Promise<void> | void>();

  // --- Queue management to serialize scans and avoid race conditions ---
  private static taskQueue: Array<{
    kind: 'buildSystem' | 'workspaces' | 'targets' | 'configurations' | 'flush';
    workspaceFolder?: vscode.WorkspaceFolder;
    generatorPath?: string;
    workspacePath?: string;
    targetPath?: string;
    event?: 'generators' | 'workspaces' | 'targets' | 'configurations';
    key?: string;
    resolve?: () => void; // only for flush tasks
  }> = [];
  private static queuedKeys = new Set<string>();
  private static processingQueue = false;

  private static enqueueTask(task: {
    kind: 'buildSystem' | 'workspaces' | 'targets' | 'configurations';
    workspaceFolder?: vscode.WorkspaceFolder;
    generatorPath?: string;
    workspacePath?: string;
    targetPath?: string;
    event: 'generators' | 'workspaces' | 'targets' | 'configurations';
    key: string;
  }): void {
    if (this.queuedKeys.has(task.key))
      return;
    this.taskQueue.push(task);
    this.queuedKeys.add(task.key);
    void this.processQueue();
  }

  private static async processQueue(): Promise<void> {
    if (this.processingQueue)
      return;
    this.processingQueue = true;
    try {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        if (task.key)
          this.queuedKeys.delete(task.key);
        try {
          switch (task.kind) {
            case 'buildSystem':
              if (task.workspaceFolder)
                await this.scanBuildSystem(task.workspaceFolder);
              break;
            case 'workspaces':
              if (task.generatorPath)
                await this.scanWorkspaces(task.generatorPath);
              break;
            case 'targets':
              if (task.workspacePath)
                await this.scanTargets(task.workspacePath);
              break;
            case 'configurations':
              if (task.targetPath)
                await this.scanConfigurations(task.targetPath);
              break;
            case 'flush':
              // No scan; used to allow awaiting until prior tasks finish
              break;
          }
          // Notify async listeners (awaited) so queue waits for processing
          if (task.event)
            await this.notifyAsyncScanningListeners(task.event);
          // Finally resolve any flush waiter
          if (task.resolve)
            task.resolve();
        } catch (err) {
          console.error('Error processing scan task', task.kind, err);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private static queueBuildSystem(workspaceFolder: vscode.WorkspaceFolder) {
    const key = `buildSystem:${workspaceFolder.uri.fsPath}`;
    this.enqueueTask({
      kind: 'buildSystem',
      workspaceFolder,
      event: 'generators',
      key
    });
  }

  /**
   * Register an async listener for scanning events. The scanner queue will await
   * completion of these listeners before considering a scan task done.
   */
  public static onDidChangeScanningAsync(listener: (event: string) => Promise<void> | void): vscode.Disposable {
    this.asyncScanningListeners.add(listener);
    return { dispose: () => this.asyncScanningListeners.delete(listener) };
  }

  private static async notifyAsyncScanningListeners(event: string): Promise<void> {
    if (this.asyncScanningListeners.size === 0)
      return;
    const tasks = Array.from(this.asyncScanningListeners).map(fn => Promise.resolve().then(() => fn(event)));
    await Promise.allSettled(tasks);
  }

  private static queueWorkspaces(generatorPath: string) {
    const key = `workspaces:${generatorPath}`;
    this.enqueueTask({
      kind: 'workspaces',
      generatorPath,
      event: 'workspaces',
      key
    });
  }

  private static queueTargets(workspacePath: string) {
    const key = `targets:${workspacePath}`;
    this.enqueueTask({
      kind: 'targets',
      workspacePath,
      event: 'targets',
      key
    });
  }

  private static queueConfigurations(targetPath: string) {
    const key = `configurations:${targetPath}`;
    this.enqueueTask({
      kind: 'configurations',
      targetPath,
      event: 'configurations',
      key
    });
  }

  /**
   * Wait until the current scanner queue drains. If the queue is active or non-empty,
   * enqueue a flush task that resolves when all prior tasks have completed.
   */
  public static async waitForScannerQueue(): Promise<void> {
    const isBusy = this.processingQueue || this.taskQueue.length > 0;
    if (!isBusy)
      return;
    await new Promise<void>(resolve => {
      // Use a unique flush task; do not dedupe
      this.taskQueue.push({ kind: 'flush', resolve });
      void this.processQueue();
    });
  }

  /**
   * Initialize the scanner for a workspace folder
   */
  public static initialize(workspaceFolder: vscode.WorkspaceFolder): vscode.Disposable {
    const buildSystemPath = path.join(workspaceFolder.uri.fsPath, 'BuildSystem');

    // Initial scan (queued)
    this.queueBuildSystem(workspaceFolder);

    const disposables: vscode.Disposable[] = [];

    // Watch for BuildSystem directory changes (watch patterns regardless of current existence)
    // Watch for new generator directories
    const generatorPattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*');
    const generatorWatcher = vscode.workspace.createFileSystemWatcher(generatorPattern);

    generatorWatcher.onDidCreate(() => {
      this.queueBuildSystem(workspaceFolder);
    });

    generatorWatcher.onDidDelete(() => {
      this.queueBuildSystem(workspaceFolder);
    });

    disposables.push(generatorWatcher);

    // Watch for ConfigStore changes
    const configStorePattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore');
    const configStoreWatcher = vscode.workspace.createFileSystemWatcher(configStorePattern);

    configStoreWatcher.onDidCreate(() => {
      // Re-scan full BuildSystem to pick up new generator workspaces
      this.queueBuildSystem(workspaceFolder);
    });

    configStoreWatcher.onDidDelete(() => {
      this.queueBuildSystem(workspaceFolder);
    });

    disposables.push(configStoreWatcher);

    // Watch for workspace directory changes
    const workspacePattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore/*');
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher(workspacePattern);

    workspaceWatcher.onDidCreate(uri => {
      const generatorPath = path.dirname(path.dirname(uri.fsPath));
      this.queueWorkspaces(generatorPath);
    });

    workspaceWatcher.onDidDelete(uri => {
      const generatorPath = path.dirname(path.dirname(uri.fsPath));
      this.queueWorkspaces(generatorPath);
    });

    disposables.push(workspaceWatcher);

    // Watch for target changes
    const targetPattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore/*/Targets/*');
    const targetWatcher = vscode.workspace.createFileSystemWatcher(targetPattern);

    targetWatcher.onDidCreate(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      this.queueTargets(workspacePath);
    });

    targetWatcher.onDidDelete(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      this.queueTargets(workspacePath);
    });

    disposables.push(targetWatcher);

    // Watch for configuration changes
    const configPattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore/*/Targets/*/Configs/*');
    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

    configWatcher.onDidCreate(uri => {
      const targetPath = path.dirname(path.dirname(uri.fsPath));
      this.queueConfigurations(targetPath);
    });

    configWatcher.onDidDelete(uri => {
      const targetPath = path.dirname(path.dirname(uri.fsPath));
      this.queueConfigurations(targetPath);
    });

    disposables.push(configWatcher);

    return vscode.Disposable.from(...disposables);
  }

  /**
   * Get available generators for a workspace (sorted by priority)
   */
  public static getGenerators(workspaceFolder: vscode.WorkspaceFolder): GeneratorInfo[] {
    const generators = this.generators.get(workspaceFolder.uri.fsPath) || [];
    return this.sortByPriority(generators);
  }

  /**
   * Get available workspaces for a generator (sorted by priority)
   */
  public static getWorkspaces(generatorPath: string): WorkspaceInfo[] {
    const workspaces = this.workspaces.get(generatorPath) || [];
    return this.sortByPriority(workspaces);
  }

  /**
   * Get available targets for a workspace (sorted by priority)
   */
  public static getTargets(workspacePath: string): TargetInfo[] {
    const targets = this.targets.get(workspacePath) || [];
    return this.sortByPriority(targets);
  }

  /**
   * Get available configurations for a target (sorted by debugPriority)
   */
  public static getConfigurations(targetPath: string): ConfigurationInfo[] {
    const configurations = this.configurations.get(targetPath) || [];
    return this.sortConfigurationsByPriority(configurations);
  }

  /**
   * Get workspace-level configuration for a specific configuration name
   */
  public static getWorkspaceConfiguration(workspacePath: string, configurationName: string): WorkspaceConfigInfo | null {
    const workspaces = Array.from(this.workspaces.values()).flat();
    const workspace = workspaces.find(w => w.path === workspacePath);
    if (!workspace || !workspace.configurations)
      return null;
    return workspace.configurations.get(configurationName) || null;
  }

  /**
   * Get all workspace-level configurations for a workspace
   */
  public static getWorkspaceConfigurations_WorkspaceLevel(workspacePath: string): WorkspaceConfigInfo[] {
    const workspaces = Array.from(this.workspaces.values()).flat();
    const workspace = workspaces.find(w => w.path === workspacePath);
    if (!workspace || !workspace.configurations)
      return [];
    return Array.from(workspace.configurations.values())
      .sort((a, b) => {
        // Sort by configurationPriority first (highest first)
        const aPriority = a.configurationPriority || 0;
        const bPriority = b.configurationPriority || 0;
        if (aPriority !== bPriority)
          return bPriority - aPriority;
        // Then by name
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Get all unique configurations across all targets in a workspace
   */
  public static getWorkspaceConfigurations(workspacePath: string): ConfigurationInfo[] {
    const allConfigs = new Map<string, ConfigurationInfo>();
    const targets = this.getTargets(workspacePath);

    for (const target of targets) {
      const configs = this.getConfigurations(target.path);
      for (const config of configs) {
        // Use config name as key to deduplicate
        allConfigs.set(config.name, config);
      }
    }

    return this.sortConfigurationsByPriority(Array.from(allConfigs.values()));
  }

  /**
   * Get the default generator (fallback first, then highest priority, or auto-select if only one)
   */
  public static getDefaultGenerator(workspaceFolder: vscode.WorkspaceFolder, fallback?: string): GeneratorInfo | null {
    const generators = this.getGenerators(workspaceFolder);
    if (generators.length === 0) return null;
    if (generators.length === 1) return generators[0];

    // Check if fallback exists in available generators
    if (fallback) {
      const fallbackGenerator = generators.find(g => g.name === fallback);
      if (fallbackGenerator)
        return fallbackGenerator;
    }

    // Find highest priority generator
    const withPriority = generators.filter(g => g.priority !== undefined);
    if (withPriority.length > 0) {
      return withPriority.reduce((max, current) =>
        (current.priority! > (max.priority || 0)) ? current : max
      );
    }

    return null;
  }

  /**
   * Get the default workspace for a generator (fallback first, then highest priority, or auto-select if only one)
   */
  public static getDefaultWorkspace(generatorPath: string, fallback?: string): WorkspaceInfo | null {
    const workspaces = this.getWorkspaces(generatorPath);
    if (workspaces.length === 0) return null;
    if (workspaces.length === 1) return workspaces[0];

    // Check if fallback exists in available workspaces
    if (fallback) {
      const fallbackWorkspace = workspaces.find(w => w.name === fallback);
      if (fallbackWorkspace)
        return fallbackWorkspace;
    }

    // Find highest priority workspace
    const withPriority = workspaces.filter(w => w.priority !== undefined);
    if (withPriority.length > 0) {
      return withPriority.reduce((max, current) =>
        (current.priority! > (max.priority || 0)) ? current : max
      );
    }

    return null;
  }

  /**
   * Get the default configuration for a workspace (fallback first, then considers both workspace configurationPriority and target debugPriority)
   */
  public static getDefaultConfiguration(workspacePath: string, fallback?: string): ConfigurationInfo | null {
    const configurations = this.getWorkspaceConfigurations(workspacePath);
    if (configurations.length === 0) return null;
    if (configurations.length === 1) return configurations[0];

    // Check if fallback exists in available configurations
    if (fallback) {
      const fallbackConfiguration = configurations.find(c => c.name === fallback);
      if (fallbackConfiguration)
        return fallbackConfiguration;
    }

    // First, try to find the highest priority from workspace-level configurations
    const workspaceConfigs = this.getWorkspaceConfigurations_WorkspaceLevel(workspacePath);
    if (workspaceConfigs.length > 0) {
      const highestWorkspaceConfig = workspaceConfigs[0]; // Already sorted by priority
      // Find matching target configuration
      const matchingConfig = configurations.find(c => c.name === highestWorkspaceConfig.name);
      if (matchingConfig)
        return matchingConfig;
    }

    // Fallback: Find highest debugPriority configuration from targets
    const withPriority = configurations.filter(c => c.debugPriority !== undefined);
    if (withPriority.length > 0) {
      return withPriority.reduce((max, current) =>
        (current.debugPriority! > (max.debugPriority || 0)) ? current : max
      );
    }

    return null;
  }

  /**
   * Get the default target for a workspace (highest priority, or auto-select if only one)
   */
  public static getDefaultTarget(workspacePath: string): TargetInfo | null {
    const targets = this.getTargets(workspacePath);
    if (targets.length === 0) return null;
    if (targets.length === 1) return targets[0];

    // Find highest priority target
    const withPriority = targets.filter(t => t.priority !== undefined);
    if (withPriority.length > 0) {
      return withPriority.reduce((max, current) =>
        (current.priority! > (max.priority || 0)) ? current : max
      );
    }

    return null;
  }

  /**
   * Sort items by priority (highest first), then by name
   */
  public static sortByPriority<T extends { priority?: number; name: string }>(items: T[]): T[] {
    return items.sort((a, b) => {
      // Sort by priority first (highest first)
      const aPriority = a.priority || 0;
      const bPriority = b.priority || 0;
      if (aPriority !== bPriority)
        return bPriority - aPriority;
      // Then by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Sort configurations by debugPriority (highest first), then by name
   */
  public static sortConfigurationsByPriority(configurations: ConfigurationInfo[]): ConfigurationInfo[] {
    return configurations.sort((a, b) => {
      // Sort by debugPriority first (highest first)
      const aPriority = a.debugPriority || 0;
      const bPriority = b.debugPriority || 0;
      if (aPriority !== bPriority)
        return bPriority - aPriority;
      // Then by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get default build target for a workspace configuration
   */
  public static getDefaultBuildTarget(workspacePath: string, configurationName: string): string | null {
    const workspaceConfig = this.getWorkspaceConfiguration(workspacePath, configurationName);
    return workspaceConfig?.defaultBuildTarget || null;
  }

  /**
   * Get default debug targets for a workspace configuration
   * Falls back to single highest debugPriority target if defaultDebugTargets is empty
   */
  public static getDefaultDebugTargets(workspacePath: string, configurationName: string): string[] {
    const workspaceConfig = this.getWorkspaceConfiguration(workspacePath, configurationName);
    const explicitTargets = workspaceConfig?.defaultDebugTargets || [];

    // If explicit targets are configured, use them
    if (explicitTargets.length > 0)
      return explicitTargets;

    // Fallback: find targets with highest debugPriority for this configuration
    const targets = this.getTargets(workspacePath);
    const targetConfigPairs: { targetName: string; debugPriority: number }[] = [];

    for (const target of targets) {
      const configurations = this.getConfigurations(target.path);
      const matchingConfig = configurations.find(config => config.name === configurationName);
      if (matchingConfig && matchingConfig.debugPriority !== undefined) {
        targetConfigPairs.push({
          targetName: target.name,
          debugPriority: matchingConfig.debugPriority
        });
      }
    }

    if (targetConfigPairs.length === 0)
      return [];

    // Find the highest debugPriority
    const maxPriority = Math.max(...targetConfigPairs.map(pair => pair.debugPriority));

    // Return only the first target with the highest priority (single selection from debugPriority)
    const highestPriorityTargets = targetConfigPairs
      .filter(pair => pair.debugPriority === maxPriority)
      .map(pair => pair.targetName)
      .sort(); // Sort alphabetically for consistent ordering

    // Return only the first one when falling back to debugPriority
    return highestPriorityTargets.length > 0 ? [highestPriorityTargets[0]] : [];
  }

  /**
   * Check for auto-selection based on priority or single option for each level
   */
  public static getAutoSelectionPath(workspaceFolder: vscode.WorkspaceFolder): {
    generator?: GeneratorInfo;
    workspace?: WorkspaceInfo;
    configuration?: ConfigurationInfo;
  } {
    const result: any = {};

    const defaultGenerator = this.getDefaultGenerator(workspaceFolder);
    if (defaultGenerator) {
      result.generator = defaultGenerator;

      const defaultWorkspace = this.getDefaultWorkspace(defaultGenerator.path);
      if (defaultWorkspace) {
        result.workspace = defaultWorkspace;

        const defaultConfiguration = this.getDefaultConfiguration(defaultWorkspace.path);
        if (defaultConfiguration)
          result.configuration = defaultConfiguration;
      }
    }

    return result;
  }

  /**
   * Scan the entire BuildSystem directory
   */
  private static async scanBuildSystem(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const buildSystemPath = path.join(workspaceFolder.uri.fsPath, 'BuildSystem');

    const exists = await BuildSystemScanner.pathExists(buildSystemPath);
    if (!exists) {
      this.generators.set(workspaceFolder.uri.fsPath, []);
      return;
    }

    try {
      const dirents = await fsp.readdir(buildSystemPath, { withFileTypes: true });
      const generatorDirs = dirents.filter(d => d.isDirectory()).map(d => d.name);

      const generators: GeneratorInfo[] = [];

      for (const generatorName of generatorDirs) {
        const generatorPath = path.join(buildSystemPath, generatorName);
        const configStorePath = path.join(generatorPath, 'ConfigStore');

        if (await BuildSystemScanner.pathExists(configStorePath)) {
          // Try to read data from Generator.json
          let priority: number | undefined;
          let buildSystemBasePath: string | undefined;
          let buildSystemFile: string | undefined;
          let generator: string | undefined;
          let generatorFamily: string | undefined;
          let outputDir: string | undefined;

          const generatorJsonPath = path.join(configStorePath, 'Generator.json');
          if (await BuildSystemScanner.pathExists(generatorJsonPath)) {
            try {
              const content = await fsp.readFile(generatorJsonPath, 'utf8');
              const generatorJson = JSON.parse(content);
              priority = generatorJson.priority;
              buildSystemBasePath = generatorJson.buildSystemBasePath;
              buildSystemFile = generatorJson.buildSystemFile;
              generator = generatorJson.generator;
              generatorFamily = generatorJson.generatorFamily;
              outputDir = generatorJson.outputDir;
            } catch (error) {
              console.error(`Error reading Generator.json for ${generatorName}: ${error}`);
            }
          }

          // Check for build scripts
          let buildTargetScript: string | undefined;
          let buildWorkspaceScript: string | undefined;

          const buildTargetPath = path.join(configStorePath, 'BuildTarget.sh');
          if (await BuildSystemScanner.pathExists(buildTargetPath))
            buildTargetScript = buildTargetPath;

          const buildWorkspacePath = path.join(configStorePath, 'BuildWorkspace.sh');
          if (await BuildSystemScanner.pathExists(buildWorkspacePath))
            buildWorkspaceScript = buildWorkspacePath;

          generators.push({
            name: generatorName,
            path: generatorPath,
            configStorePath,
            priority,
            buildSystemBasePath,
            buildSystemFile,
            generator,
            generatorFamily,
            outputDir,
            buildTargetScript,
            buildWorkspaceScript
          });

          // Scan workspaces for this generator
          await this.scanWorkspaces(generatorPath);
        }
      }

      this.generators.set(workspaceFolder.uri.fsPath, generators);
    } catch (error) {
      console.error(`Error scanning BuildSystem directory: ${error}`);
      this.generators.set(workspaceFolder.uri.fsPath, []);
    }
  }

  /**
   * Scan workspaces in a generator's ConfigStore
   */
  private static async scanWorkspaces(generatorPath: string): Promise<void> {
    const configStorePath = path.join(generatorPath, 'ConfigStore');

    if (!(await BuildSystemScanner.pathExists(configStorePath))) {
      this.workspaces.set(generatorPath, []);
      return;
    }

    try {
      const dirents = await fsp.readdir(configStorePath, { withFileTypes: true });
      const workspaceDirs = dirents
        .filter(dirent => dirent.isDirectory())
        .filter(dirent => dirent.name !== 'Generator.json') // Skip non-workspace files
        .map(dirent => dirent.name);

      const workspaces: WorkspaceInfo[] = [];

      for (const workspaceName of workspaceDirs) {
        const workspacePath = path.join(configStorePath, workspaceName);
        const targetsPath = path.join(workspacePath, 'Targets');
        const workspaceJsonPath = path.join(workspacePath, 'Workspace.json');

        // Verify it's a valid workspace (has Workspace.json)
        if (await BuildSystemScanner.pathExists(workspaceJsonPath)) {
          // Try to read priority from Workspace.json
          let priority: number | undefined;
          try {
            const content = await fsp.readFile(workspaceJsonPath, 'utf8');
            const workspaceJson = JSON.parse(content);
            priority = workspaceJson.priority;
          } catch (error) {
            console.error(`Error reading Workspace.json for ${workspaceName}: ${error}`);
          }

          // Scan workspace-level configurations
          const workspaceConfigurations = await this.scanWorkspaceConfigurations(workspacePath);

          workspaces.push({
            name: workspaceName,
            path: workspacePath,
            targetsPath,
            priority,
            configurations: workspaceConfigurations
          });

          // Scan targets for this workspace
          await this.scanTargets(workspacePath);
        }
      }

      this.workspaces.set(generatorPath, workspaces);
    } catch (error) {
      console.error(`Error scanning workspaces in ${generatorPath}: ${error}`);
      this.workspaces.set(generatorPath, []);
    }
  }

  /**
   * Scan targets in a workspace
   */
  private static async scanTargets(workspacePath: string): Promise<void> {
    const targetsPath = path.join(workspacePath, 'Targets');

    if (!(await BuildSystemScanner.pathExists(targetsPath))) {
      this.targets.set(workspacePath, []);
      return;
    }

    try {
      const targetItems = await fsp.readdir(targetsPath, { withFileTypes: true });
      const targets: TargetInfo[] = [];

      for (const item of targetItems) {
        if (item.isFile() && item.name.endsWith('.json')) {
          // This is a target JSON file
          const targetName = path.basename(item.name, '.json');
          const targetDirPath = path.join(targetsPath, targetName);
          const configsPath = path.join(targetDirPath, 'Configs');

          // Try to read priority from target JSON file
          let priority: number | undefined;
          const targetJsonPath = path.join(targetsPath, item.name);
          try {
            const content = await fsp.readFile(targetJsonPath, 'utf8');
            const targetJson = JSON.parse(content);
            priority = targetJson.priority;
          } catch (error) {
            console.error(`Error reading target JSON for ${targetName}: ${error}`);
          }

          // Scan target-specific configurations
          const targetConfigurations = await this.scanTargetConfigurations(configsPath);

          targets.push({
            name: targetName,
            path: targetDirPath,
            configsPath,
            priority,
            configurations: targetConfigurations
          });

          // Scan configurations for this target
          await this.scanConfigurations(targetDirPath);
        }
      }

      this.targets.set(workspacePath, targets);
    } catch (error) {
      console.error(`Error scanning targets in ${workspacePath}: ${error}`);
      this.targets.set(workspacePath, []);
    }
  }

  /**
   * Scan target-specific configurations
   */
  private static async scanTargetConfigurations(configsPath: string): Promise<Map<string, TargetConfigInfo>> {
    const configurations = new Map<string, TargetConfigInfo>();

    if (!(await BuildSystemScanner.pathExists(configsPath)))
      return configurations;

    try {
      const dirents = await fsp.readdir(configsPath, { withFileTypes: true });
      const configFiles = dirents
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
        .map(dirent => dirent.name);

      for (const configFile of configFiles) {
        const configName = path.basename(configFile, '.json');
        const configPath = path.join(configsPath, configFile);

        // Try to read target configuration data
        try {
          const content = await fsp.readFile(configPath, 'utf8');
          const configJson = JSON.parse(content);

          configurations.set(configName, {
            name: configName,
            path: configPath,
            platform: configJson.platform || '',
            architecture: configJson.architecture || '',
            configuration: configJson.configuration || '',
            debugPriority: configJson.debugPriority,
            debuggerCommandArguments: configJson.debuggerCommandArguments,
            localDebuggerCommand: configJson.localDebuggerCommand,
            localDebuggerWorkingDirectory: configJson.localDebuggerWorkingDirectory,
            remoteDebuggerCommand: configJson.remoteDebuggerCommand,
            remoteDebuggerWorkingDirectory: configJson.remoteDebuggerWorkingDirectory
          });
        } catch (error) {
          console.error(`Error reading target configuration JSON for ${configName}: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error scanning target configurations in ${configsPath}: ${error}`);
    }

    return configurations;
  }

  /**
   * Scan workspace-level configurations
   */
  private static async scanWorkspaceConfigurations(workspacePath: string): Promise<Map<string, WorkspaceConfigInfo>> {
    const configsPath = path.join(workspacePath, 'Configs');
    const configurations = new Map<string, WorkspaceConfigInfo>();

    if (!(await BuildSystemScanner.pathExists(configsPath)))
      return configurations;

    try {
      const dirents = await fsp.readdir(configsPath, { withFileTypes: true });
      const configFiles = dirents
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
        .map(dirent => dirent.name);

      for (const configFile of configFiles) {
        const configName = path.basename(configFile, '.json');
        const configPath = path.join(configsPath, configFile);

        let platform: string = '';
        let architecture: string = '';
        let configuration: string = '';
        let configurationPriority: number | undefined;
        let defaultBuildTarget: string | undefined;
        let defaultDebugTargets: string[] | undefined;

        // Try to read workspace configuration data
        try {
          const content = await fsp.readFile(configPath, 'utf8');
          const configJson = JSON.parse(content);
          platform = configJson.platform || '';
          architecture = configJson.architecture || '';
          configuration = configJson.configuration || '';
          configurationPriority = configJson.configurationPriority;
          defaultBuildTarget = configJson.defaultBuildTarget;
          defaultDebugTargets = configJson.defaultDebugTargets;
        } catch (error) {
          console.error(`Error reading workspace configuration JSON for ${configName}: ${error}`);
        }

        configurations.set(configName, {
          name: configName,
          path: configPath,
          platform,
          architecture,
          configuration,
          configurationPriority,
          defaultBuildTarget,
          defaultDebugTargets
        });
      }
    } catch (error) {
      console.error(`Error scanning workspace configurations in ${workspacePath}: ${error}`);
    }

    return configurations;
  }

  /**
   * Scan configurations for a target
   */
  private static async scanConfigurations(targetPath: string): Promise<void> {
    const configsPath = path.join(targetPath, 'Configs');

    if (!(await BuildSystemScanner.pathExists(configsPath))) {
      this.configurations.set(targetPath, []);
      return;
    }

    try {
      const dirents = await fsp.readdir(configsPath, { withFileTypes: true });
      const configFiles = dirents
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
        .map(dirent => dirent.name);

      const configurations: ConfigurationInfo[] = [];

      for (const configFile of configFiles) {
        const configName = path.basename(configFile, '.json');
        const configPath = path.join(configsPath, configFile);

        // Try to parse the configuration name (e.g., "macOS arm64 Debug")
        const parts = configName.split(' ');
        let platform = 'Unknown';
        let architecture = 'Unknown';
        let configuration = 'Unknown';
        let debugPriority: number | undefined;

        if (parts.length >= 3) {
          platform = parts[0];
          architecture = parts[1];
          configuration = parts.slice(2).join(' ');
        }

        // Try to read debugPriority from configuration JSON file
        try {
          const content = await fsp.readFile(configPath, 'utf8');
          const configJson = JSON.parse(content);
          debugPriority = configJson.debugPriority;
          // Also read platform, architecture, configuration from JSON if available
          if (configJson.platform) platform = configJson.platform;
          if (configJson.architecture) architecture = configJson.architecture;
          if (configJson.configuration) configuration = configJson.configuration;
        } catch (error) {
          console.error(`Error reading configuration JSON for ${configName}: ${error}`);
        }

        configurations.push({
          name: configName,
          path: configPath,
          platform,
          architecture,
          configuration,
          debugPriority
        });
      }

      this.configurations.set(targetPath, configurations.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error(`Error scanning configurations in ${targetPath}: ${error}`);
      this.configurations.set(targetPath, []);
    }
  }

  private static async pathExists(p: string): Promise<boolean> {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }
}