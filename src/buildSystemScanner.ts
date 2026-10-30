import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { PostCopyParser, PostCopyProject } from './postCopyParser';
import { isInBuildSystemDirectory, readListedBuildSystems } from './buildSystemsListing';
import { getDirectoryIdentity, getLinkTarget, watchDirectoryAndAncestors } from './directoryWatcher';

export interface GeneratorInfo {
  // The name of a build system in the checkout's BuildSystem directory, its directory name, and of one elsewhere its
  // output directory as BuildSystems.json lists it, relative to the checkout or absolute
  name: string;
  // The output directory as the pickers show it: BuildSystem/<Name>, or the path BuildSystems.json lists
  label: string;
  // BuildSystem/HostTools, the build system of the tools that builds run on the host, which builds of the other build
  // systems build from inside ninja
  hostTools?: boolean;
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
  tidyTargetScript?: string;
  tidyWorkspaceScript?: string;
  formatFileScript?: string;
  formatScript?: string;
  formatCheckScript?: string;
  postCopyProjects?: Map<string, PostCopyProject>;
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
  // The build.ninja that builds the configuration, whose outputs BuildTarget.sh builds as targets
  ninjaFile?: string;
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
  targetName?: string;
  debugPriority?: number;
  // If true, this target generates a buildable scheme for this configuration
  generateScheme?: boolean;
  debuggerCommandArguments?: string[];
  localDebuggerCommand?: string;
  localDebuggerWorkingDirectory?: string;
  remoteDebuggerCommand?: string;
  remoteDebuggerWorkingDirectory?: string;
  compileCommands?: string;
  postCopyDestination?: string;
  postCopyProject?: string;
  postCopyProject2?: string;
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

type ScanningEvent = 'generators' | 'workspaces' | 'targets' | 'configurations';

interface ScanTask {
  kind: 'buildSystem' | 'workspaces' | 'targets' | 'configurations' | 'singleTargetConfig' | 'postCopyUpdate';
  workspaceFolder?: vscode.WorkspaceFolder;
  generatorPath?: string;
  workspacePath?: string;
  targetPath?: string;
  targetConfigPath?: string;
  event: ScanningEvent;
  key: string;
}

type QueuedTask = ScanTask | {
  kind: 'flush';
  resolve: () => void;
};

export class BuildSystemScanner {
  private static readonly changeCoalesceDelay = 100;
  private static generators = new Map<string, GeneratorInfo[]>();
  private static workspaces = new Map<string, WorkspaceInfo[]>();
  private static targets = new Map<string, TargetInfo[]>();
  private static configurations = new Map<string, ConfigurationInfo[]>();
  // The watchers of the build systems outside the BuildSystem directory of each initialized workspace folder, and of the
  // links that build systems are found through, by `outputDir:<Directory>` and `link:<Path>`, with the identity of the
  // directory they watch
  private static outOfTreeWatchers = new Map<string, Map<string, { watcher: vscode.Disposable; identity: string | undefined }>>();

  // Async listeners that the queue will await before considering a task complete
  private static asyncScanningListeners = new Set<(event: string) => Promise<void> | void>();

  // --- Queue management to serialize scans and avoid race conditions ---
  private static taskQueue: QueuedTask[] = [];
  private static queuedKeys = new Set<string>();
  private static pendingTasks = new Map<string, ScanTask>();
  private static changeCoalesceTimer: NodeJS.Timeout | undefined;
  private static deferredScanningEvent: ScanningEvent | undefined;
  private static deferredFlushWaiters: Array<() => void> = [];
  private static processingQueue = false;

  private static enqueueTask(task: ScanTask): void {
    if (this.queuedKeys.has(task.key))
      return;

    for (const queuedTask of this.taskQueue) {
      if (queuedTask.kind !== 'flush' && this.taskSubsumes(queuedTask, task))
        return;
    }

    for (let index = this.taskQueue.length - 1; index >= 0; index--) {
      const queuedTask = this.taskQueue[index];
      if (queuedTask.kind !== 'flush' && this.taskSubsumes(task, queuedTask)) {
        this.taskQueue.splice(index, 1);
        this.queuedKeys.delete(queuedTask.key);
      }
    }

    this.taskQueue.push(task);
    this.queuedKeys.add(task.key);
    void this.processQueue();
  }

  private static scheduleTask(task: ScanTask): void {
    for (const pendingTask of this.pendingTasks.values()) {
      if (this.taskSubsumes(pendingTask, task))
        return;
    }

    for (const [key, pendingTask] of this.pendingTasks) {
      if (this.taskSubsumes(task, pendingTask))
        this.pendingTasks.delete(key);
    }

    this.pendingTasks.set(task.key, task);

    if (this.changeCoalesceTimer)
      clearTimeout(this.changeCoalesceTimer);
    this.changeCoalesceTimer = setTimeout(() => this.flushPendingTasks(), this.changeCoalesceDelay);
  }

  private static taskSubsumes(task: ScanTask, candidate: ScanTask): boolean {
    if (task.key === candidate.key)
      return true;

    const candidatePath = this.getTaskPath(candidate);
    if (!candidatePath)
      return false;

    switch (task.kind) {
      case 'buildSystem':
        return !!task.workspaceFolder && (this.isEqualOrParent(path.join(task.workspaceFolder.uri.fsPath, 'BuildSystem'), candidatePath) ||
          (this.generators.get(task.workspaceFolder.uri.fsPath) ?? []).some(generator => this.isEqualOrParent(generator.path, candidatePath)));
      case 'workspaces':
        return !!task.generatorPath && candidate.kind !== 'postCopyUpdate' && this.isEqualOrParent(path.join(task.generatorPath, 'ConfigStore'), candidatePath);
      case 'targets':
        return !!task.workspacePath && (candidate.kind === 'configurations' || candidate.kind === 'singleTargetConfig') && this.isEqualOrParent(path.join(task.workspacePath, 'Targets'), candidatePath);
      default:
        return false;
    }
  }

  private static getTaskPath(task: ScanTask): string | undefined {
    switch (task.kind) {
      case 'buildSystem':
        return task.workspaceFolder?.uri.fsPath;
      case 'workspaces':
      case 'postCopyUpdate':
        return task.generatorPath;
      case 'targets':
        return task.workspacePath;
      case 'configurations':
        return task.targetPath;
      case 'singleTargetConfig':
        return task.targetConfigPath;
    }
  }

  private static isEqualOrParent(parentPath: string, candidatePath: string): boolean {
    const relativePath = path.relative(parentPath, candidatePath);
    return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
  }

  private static flushPendingTasks(): void {
    if (this.changeCoalesceTimer) {
      clearTimeout(this.changeCoalesceTimer);
      this.changeCoalesceTimer = undefined;
    }

    const tasks = Array.from(this.pendingTasks.values());
    this.pendingTasks.clear();
    tasks.forEach(task => this.enqueueTask(task));
  }

  private static async processQueue(): Promise<void> {
    if (this.processingQueue)
      return;
    this.processingQueue = true;
    let scanningEvent = this.deferredScanningEvent;
    this.deferredScanningEvent = undefined;
    const flushWaiters = this.deferredFlushWaiters;
    this.deferredFlushWaiters = [];
    try {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        if (task.kind !== 'flush')
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
            case 'singleTargetConfig':
              if (task.targetConfigPath)
                await this.updateSingleTargetConfiguration(task.targetConfigPath);
              break;
            case 'postCopyUpdate':
              if (task.generatorPath)
                await this.updatePostCopyData(task.generatorPath);
              break;
            case 'flush':
              // No scan; used to allow awaiting until prior tasks finish
              flushWaiters.push(task.resolve);
              break;
          }
          if (task.kind !== 'flush')
            scanningEvent = this.getBroaderScanningEvent(scanningEvent, task.event);
        } catch (err) {
          console.error(`[BuildSystemScanner] Error processing scan task ${task.kind}:`, err);
        }
      }

      // A ConfigStore operation can produce hundreds of watcher events. Notify
      // consumers only after the coalesced scans have produced a consistent view.
      if (scanningEvent) {
        if (this.pendingTasks.size > 0)
          this.deferredScanningEvent = this.getBroaderScanningEvent(this.deferredScanningEvent, scanningEvent);
        else
          await this.notifyAsyncScanningListeners(scanningEvent);
      }
    } finally {
      this.processingQueue = false;
      if (this.pendingTasks.size > 0 || this.taskQueue.length > 0)
        this.deferredFlushWaiters.push(...flushWaiters);
      else
        flushWaiters.forEach(resolve => resolve());
      if (this.taskQueue.length > 0)
        void this.processQueue();
    }
  }

  private static getBroaderScanningEvent(current: ScanningEvent | undefined, candidate: ScanningEvent): ScanningEvent {
    if (!current)
      return candidate;

    const priority: Record<ScanningEvent, number> = {
      generators: 3,
      workspaces: 2,
      targets: 1,
      configurations: 0
    };
    return priority[candidate] > priority[current] ? candidate : current;
  }

  private static queueBuildSystem(workspaceFolder: vscode.WorkspaceFolder, coalesce: boolean = false) {
    const key = `buildSystem:${workspaceFolder.uri.fsPath}`;
    const task: ScanTask = {
      kind: 'buildSystem',
      workspaceFolder,
      event: 'generators',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
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

  private static queueWorkspaces(generatorPath: string, coalesce: boolean = false) {
    const key = `workspaces:${generatorPath}`;
    const task: ScanTask = {
      kind: 'workspaces',
      generatorPath,
      event: 'workspaces',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
  }

  private static queueTargets(workspacePath: string, coalesce: boolean = false) {
    const key = `targets:${workspacePath}`;
    const task: ScanTask = {
      kind: 'targets',
      workspacePath,
      event: 'targets',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
  }

  private static queueConfigurations(targetPath: string, coalesce: boolean = false) {
    const key = `configurations:${targetPath}`;
    const task: ScanTask = {
      kind: 'configurations',
      targetPath,
      event: 'configurations',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
  }

  private static queueSingleTargetConfiguration(targetConfigPath: string, coalesce: boolean = false) {
    const key = `singleTargetConfig:${targetConfigPath}`;
    const task: ScanTask = {
      kind: 'singleTargetConfig',
      targetConfigPath,
      event: 'targets',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
  }

  private static queuePostCopyUpdate(generatorPath: string, coalesce: boolean = false) {
    const key = `postCopy:${generatorPath}`;
    const task: ScanTask = {
      kind: 'postCopyUpdate',
      generatorPath,
      event: 'generators',
      key
    };
    if (coalesce)
      this.scheduleTask(task);
    else
      this.enqueueTask(task);
  }

  /**
   * Wait until the current scanner queue drains. If the queue is active or non-empty,
   * enqueue a flush task that resolves when all prior tasks have completed.
   */
  public static async waitForScannerQueue(): Promise<void> {
    this.flushPendingTasks();
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
    // Initial scan (queued)
    this.queueBuildSystem(workspaceFolder);

    const disposables: vscode.Disposable[] = [];

    // Watch for BuildSystem directory changes (watch patterns regardless of current existence). Moving or replacing
    // the BuildSystem directory itself can be reported for it only, also as a change. It only changes itself when its
    // generator directories do, so rescanning on its changes is cheap.
    const buildSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, 'BuildSystem'));
    buildSystemWatcher.onDidCreate(() => this.queueBuildSystem(workspaceFolder, true));
    buildSystemWatcher.onDidChange(() => this.queueBuildSystem(workspaceFolder, true));
    buildSystemWatcher.onDidDelete(() => this.queueBuildSystem(workspaceFolder, true));
    disposables.push(buildSystemWatcher);

    // Watch for new generator directories
    const generatorPattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*');
    const generatorWatcher = vscode.workspace.createFileSystemWatcher(generatorPattern);

    generatorWatcher.onDidCreate(() => {
      this.queueBuildSystem(workspaceFolder, true);
    });

    generatorWatcher.onDidDelete(() => {
      this.queueBuildSystem(workspaceFolder, true);
    });

    disposables.push(generatorWatcher);

    disposables.push(...this.watchConfigStores(workspaceFolder, workspaceFolder.uri, 'BuildSystem/*/', workspaceFolder.uri, 'BuildSystem/*/ConfigStore/'));

    // BuildSystems.json lists the build systems of the checkout, also those outside it, which are watched on their own
    // when it's read. MTool replaces it by a rename, and only when its contents change.
    const listingWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, 'BuildSystem/BuildSystems.json'));
    listingWatcher.onDidCreate(() => this.queueBuildSystem(workspaceFolder, true));
    listingWatcher.onDidChange(() => this.queueBuildSystem(workspaceFolder, true));
    listingWatcher.onDidDelete(() => this.queueBuildSystem(workspaceFolder, true));
    disposables.push(listingWatcher);

    this.outOfTreeWatchers.set(workspaceFolder.uri.fsPath, new Map());
    disposables.push({
      dispose: () => {
        this.outOfTreeWatchers.get(workspaceFolder.uri.fsPath)?.forEach(({ watcher }) => watcher.dispose());
        this.outOfTreeWatchers.delete(workspaceFolder.uri.fsPath);
      }
    });

    return vscode.Disposable.from(...disposables);
  }

  /**
   * Watch the ConfigStores of build systems, of each directory that `prefix` matches in `base`: every
   * `BuildSystem/<Name>/` of the workspace folder, or the output directory itself of a build system outside it. The
   * paths of the events are the same relative to the build systems. A pattern with a `/` watches its base recursively,
   * so the patterns inside the ConfigStore are relative to `configStoreBase` and `configStorePrefix`: the workspace
   * folder, which is watched anyway, or the ConfigStore of a build system outside it, rather than its whole build.
   */
  private static watchConfigStores(workspaceFolder: vscode.WorkspaceFolder, base: vscode.Uri, prefix: string, configStoreBase: vscode.Uri, configStorePrefix: string): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Watch for ConfigStore changes
    const configStorePattern = new vscode.RelativePattern(base, prefix + 'ConfigStore');
    const configStoreWatcher = vscode.workspace.createFileSystemWatcher(configStorePattern);

    configStoreWatcher.onDidCreate(() => {
      // Re-scan full BuildSystem to pick up new generator workspaces
      this.queueBuildSystem(workspaceFolder, true);
    });

    configStoreWatcher.onDidDelete(() => {
      this.queueBuildSystem(workspaceFolder, true);
    });

    disposables.push(configStoreWatcher);

    // Watch for workspace directory changes
    const workspacePattern = new vscode.RelativePattern(configStoreBase, configStorePrefix + '*');
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher(workspacePattern);

    // Generator.json is read when the BuildSystem directory is scanned. A build system other than mib can write it
    // after creating the ConfigStore, or rewrite it.
    const onWorkspaceCreatedOrDeleted = (uri: vscode.Uri) => {
      if (path.basename(uri.fsPath) === 'Generator.json') {
        this.queueBuildSystem(workspaceFolder, true);
        return;
      }
      const generatorPath = path.dirname(path.dirname(uri.fsPath));
      this.queueWorkspaces(generatorPath, true);
    };

    workspaceWatcher.onDidCreate(onWorkspaceCreatedOrDeleted);
    workspaceWatcher.onDidDelete(onWorkspaceCreatedOrDeleted);

    // Only Generator.json: change events for the workspace directories would rescan on every write inside them
    workspaceWatcher.onDidChange(uri => {
      if (path.basename(uri.fsPath) === 'Generator.json')
        this.queueBuildSystem(workspaceFolder, true);
    });

    disposables.push(workspaceWatcher);

    // A workspace is only listed once it has a Workspace.json, which can be written after its directory is created
    const workspaceJsonPattern = new vscode.RelativePattern(configStoreBase, configStorePrefix + '*/Workspace.json');
    const workspaceJsonWatcher = vscode.workspace.createFileSystemWatcher(workspaceJsonPattern);

    const onWorkspaceJsonChanged = (uri: vscode.Uri) => {
      const generatorPath = path.dirname(path.dirname(path.dirname(uri.fsPath)));
      this.queueWorkspaces(generatorPath, true);
    };

    workspaceJsonWatcher.onDidCreate(onWorkspaceJsonChanged);
    workspaceJsonWatcher.onDidChange(onWorkspaceJsonChanged);
    workspaceJsonWatcher.onDidDelete(onWorkspaceJsonChanged);

    disposables.push(workspaceJsonWatcher);

    // Watch for workspace configuration changes
    const workspaceConfigPattern = new vscode.RelativePattern(configStoreBase, configStorePrefix + '*/Configs/*');
    const workspaceConfigWatcher = vscode.workspace.createFileSystemWatcher(workspaceConfigPattern);

    workspaceConfigWatcher.onDidCreate(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      const generatorPath = path.dirname(path.dirname(workspacePath));
      this.queueWorkspaces(generatorPath, true);
    });

    workspaceConfigWatcher.onDidChange(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      const generatorPath = path.dirname(path.dirname(workspacePath));
      this.queueWorkspaces(generatorPath, true);
    });

    workspaceConfigWatcher.onDidDelete(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      const generatorPath = path.dirname(path.dirname(workspacePath));
      this.queueWorkspaces(generatorPath, true);
    });

    disposables.push(workspaceConfigWatcher);

    // Watch for target changes
    const targetPattern = new vscode.RelativePattern(configStoreBase, configStorePrefix + '*/Targets/*');
    const targetWatcher = vscode.workspace.createFileSystemWatcher(targetPattern);

    targetWatcher.onDidCreate(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      this.queueTargets(workspacePath, true);
    });

    targetWatcher.onDidDelete(uri => {
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      this.queueTargets(workspacePath, true);
    });

    // A target JSON's priority decides the target order, which also orders the merged compile_commands.json.
    // Only the JSON files: change events for the target directories would rescan the workspace on every write inside them
    targetWatcher.onDidChange(uri => {
      if (!uri.fsPath.endsWith('.json'))
        return;
      const workspacePath = path.dirname(path.dirname(uri.fsPath));
      this.queueTargets(workspacePath, true);
    });

    disposables.push(targetWatcher);

    // Watch for configuration changes
    const configPattern = new vscode.RelativePattern(configStoreBase, configStorePrefix + '*/Targets/*/Configs/*');
    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

    const onConfigCreatedOrChanged = (uri: vscode.Uri) => {
      const targetPath = path.dirname(path.dirname(uri.fsPath));
      this.queueConfigurations(targetPath, true);
      this.queueSingleTargetConfiguration(uri.fsPath, true);
    };

    configWatcher.onDidCreate(onConfigCreatedOrChanged);

    // Existing configurations are rewritten when their settings change, e.g. when they gain a compileCommands path
    configWatcher.onDidChange(onConfigCreatedOrChanged);

    configWatcher.onDidDelete(uri => {
      const targetPath = path.dirname(path.dirname(uri.fsPath));
      this.queueConfigurations(targetPath, true);
    });

    disposables.push(configWatcher);

    // Watch for PostCopy.MConfig changes
    const postCopyPattern = new vscode.RelativePattern(base, prefix + 'PostCopy.MConfig');
    const postCopyWatcher = vscode.workspace.createFileSystemWatcher(postCopyPattern);

    postCopyWatcher.onDidCreate(uri => {
      const generatorPath = path.dirname(uri.fsPath);
      this.queuePostCopyUpdate(generatorPath, true);
    });

    postCopyWatcher.onDidChange(uri => {
      const generatorPath = path.dirname(uri.fsPath);
      this.queuePostCopyUpdate(generatorPath, true);
    });

    postCopyWatcher.onDidDelete(uri => {
      const generatorPath = path.dirname(uri.fsPath);
      this.queuePostCopyUpdate(generatorPath, true);
    });

    disposables.push(postCopyWatcher);

    return disposables;
  }

  /**
   * Get available generators for a workspace (sorted by priority)
   */
  public static getGenerators(workspaceFolder: vscode.WorkspaceFolder): GeneratorInfo[] {
    const generators = this.generators.get(workspaceFolder.uri.fsPath) || [];
    // The host tools come after the others, which are built normally
    const sorted = this.sortByPriority(generators);
    return [...sorted.filter(generator => !generator.hostTools), ...sorted.filter(generator => generator.hostTools)];
  }

  /**
   * Get PostCopy projects for a specific generator
   */
  public static getPostCopyProjects(generatorPath: string): Map<string, PostCopyProject> | undefined {
    // A build system can be outside the workspace folder
    for (const generators of this.generators.values()) {
      const generator = generators.find(g => g.path === generatorPath);
      if (generator)
        return generator.postCopyProjects;
    }
    return undefined;
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
    const allGenerators = this.getGenerators(workspaceFolder);
    if (allGenerators.length === 0) return null;
    if (allGenerators.length === 1) return allGenerators[0];

    // Check if fallback exists in available generators
    if (fallback) {
      const fallbackGenerator = allGenerators.find(g => g.name === fallback);
      if (fallbackGenerator)
        return fallbackGenerator;
    }

    // The host tools are only selected by choice
    const generators = allGenerators.filter(g => !g.hostTools);
    if (generators.length === 1) return generators[0];

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
   * Get target configuration info for a specific target
   */
  public static getTargetConfigInfo(workspacePath: string, targetName: string, configurationName?: string): TargetConfigInfo | undefined {
    const targets = this.getTargets(workspacePath);
    const target = targets.find(t => t.name === targetName);

    if (!target || !target.configurations)
      return undefined;

    // If configuration name is provided, return that specific config
    if (configurationName)
      return target.configurations.get(configurationName);

    // Otherwise, return the first available configuration
    const firstConfig = target.configurations.values().next();
    return firstConfig.done ? undefined : firstConfig.value;
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
   * Scan the build systems of a workspace folder: the directories of its BuildSystem directory, which MTool scans too,
   * as build systems from before BuildSystem/BuildSystems.json or that only an older MTool updated aren't in it, and the
   * ones it lists elsewhere, such as those generated with --output-directory outside the checkout
   */
  private static async scanBuildSystem(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const checkout = workspaceFolder.uri.fsPath;
    const buildSystemPath = path.join(checkout, 'BuildSystem');

    // Paths as watcher events name them, as the caches are by path: on Windows with a lower case drive letter
    const normalize = (filePath: string) => vscode.Uri.file(filePath).fsPath;

    const candidates: { name: string; label: string; generatorPath: string; hostTools: boolean }[] = [];
    // The build systems outside the BuildSystem directory, whose ConfigStores are watched where they are, as watchers
    // don't follow links, also while their directories are missing, until they're generated again; and the links that
    // build systems are found through, which are watched for being replaced or retargeted
    const outputDirs: string[] = [];
    const linkPaths: string[] = [];
    try {
      const dirents = await fsp.readdir(buildSystemPath, { withFileTypes: true });
      for (const dirent of dirents) {
        let generatorPath = path.join(buildSystemPath, dirent.name);
        if (dirent.isSymbolicLink()) {
          const links: string[] = [];
          const realPath = normalize(getLinkTarget(generatorPath, links));
          linkPaths.push(...links.map(normalize));
          if (!isInBuildSystemDirectory(checkout, realPath))
            outputDirs.push(realPath);
          if (!(await fsp.stat(realPath).catch(() => undefined))?.isDirectory())
            continue;
          generatorPath = realPath;
        } else if (!dirent.isDirectory())
          continue;
        candidates.push({ name: dirent.name, label: `BuildSystem/${dirent.name}`, generatorPath, hostTools: dirent.name === 'HostTools' });
      }
    } catch {
      // No BuildSystem directory
    }

    const isCandidate = (outputDir: string) => candidates.some(candidate =>
      process.platform === 'linux' ? candidate.generatorPath === outputDir : candidate.generatorPath.toLowerCase() === outputDir.toLowerCase());
    for (const outputDir of await readListedBuildSystems(checkout)) {
      if (isInBuildSystemDirectory(checkout, outputDir))
        continue;
      // Such as a link in the checkout to a directory elsewhere that it's in. The links are watched also when it's a
      // build system found already, as they can be retargeted to another.
      const links: string[] = [];
      const realPath = normalize(getLinkTarget(outputDir, links));
      linkPaths.push(...links.map(normalize));
      if (isCandidate(realPath))
        continue;
      outputDirs.push(realPath);
      const relativePath = path.relative(checkout, outputDir);
      const bInCheckout = relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
      const listed = bInCheckout ? relativePath.split(path.sep).join('/') : outputDir;
      candidates.push({ name: listed, label: listed, generatorPath: realPath, hostTools: false });
    }
    this.updateOutOfTreeWatchers(workspaceFolder, outputDirs, linkPaths);

    const generators: GeneratorInfo[] = [];
    for (const candidate of candidates) {
      try {
        const generator = await this.readGenerator(candidate.name, candidate.label, candidate.generatorPath, candidate.hostTools);
        if (!generator)
          continue;
        generators.push(generator);

        // Scan workspaces for this generator
        await this.scanWorkspaces(candidate.generatorPath);
      } catch (error) {
        console.error(`Error scanning build system ${candidate.generatorPath}: ${error}`);
      }
    }
    this.generators.set(checkout, generators);
  }

  /**
   * Read a build system from its output directory, unless it has no ConfigStore, as a listed one whose directory was
   * deleted
   */
  private static async readGenerator(generatorName: string, label: string, generatorPath: string, hostTools: boolean): Promise<GeneratorInfo | undefined> {
    const configStorePath = path.join(generatorPath, 'ConfigStore');

    if (!(await BuildSystemScanner.pathExists(configStorePath)))
      return undefined;

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

    buildTargetScript = path.join(configStorePath, 'BuildTarget.sh');
    buildWorkspaceScript = path.join(configStorePath, 'BuildWorkspace.sh');

    // The tidy scripts take the same arguments as the build scripts. A build system without them has no tidy tasks.
    const tidyTargetScript = path.join(configStorePath, 'TidyTarget.sh');
    const tidyWorkspaceScript = path.join(configStorePath, 'TidyWorkspace.sh');

    // FormatFile.sh formats an editor's buffer, and Format.sh and FormatCheck.sh take the arguments of the
    // workspace scripts. A build system without them has no formatting.
    const formatFileScript = path.join(configStorePath, 'FormatFile.sh');
    const formatScript = path.join(configStorePath, 'Format.sh');
    const formatCheckScript = path.join(configStorePath, 'FormatCheck.sh');

    // Parse PostCopy.MConfig if it exists
    let postCopyProjects: Map<string, PostCopyProject> | undefined;
    const postCopyPath = path.join(generatorPath, 'PostCopy.MConfig');
    if (await BuildSystemScanner.pathExists(postCopyPath))
      postCopyProjects = await PostCopyParser.parse(postCopyPath);

    return {
      name: generatorName,
      label,
      hostTools,
      path: generatorPath,
      configStorePath,
      priority,
      buildSystemBasePath,
      buildSystemFile,
      generator,
      generatorFamily,
      outputDir,
      buildTargetScript,
      buildWorkspaceScript,
      tidyTargetScript,
      tidyWorkspaceScript,
      formatFileScript,
      formatScript,
      formatCheckScript,
      postCopyProjects
    };
  }

  /**
   * Watch the build systems outside the workspace folder's BuildSystem directory, with the watchers of their ConfigStores
   * and of their output directories, which generating them creates, and deleting them can be reported for only, and the
   * links that build systems are found through, for being replaced or retargeted. A directory is watched also before it
   * exists.
   */
  private static updateOutOfTreeWatchers(workspaceFolder: vscode.WorkspaceFolder, outputDirs: string[], linkPaths: string[]): void {
    const watchers = this.outOfTreeWatchers.get(workspaceFolder.uri.fsPath);
    if (!watchers)
      return; // Not initialized

    // A link's watchers only watch for it changing, while an output directory's also watch its ConfigStore, which is
    // recursive and would watch everything below a link to a directory that a build system is somewhere in
    const wanted = new Map<string, () => vscode.Disposable[]>();
    const rescan = () => this.queueBuildSystem(workspaceFolder, true);
    for (const linkPath of linkPaths)
      wanted.set(`link:${linkPath}`, () => [watchDirectoryAndAncestors(linkPath, rescan)]);
    for (const outputDir of outputDirs) {
      // From the ConfigStore, which can be replaced too, which can be reported as a change of it only
      wanted.set(`outputDir:${outputDir}`, () => [
        ...this.watchConfigStores(workspaceFolder, vscode.Uri.file(outputDir), '', vscode.Uri.file(path.join(outputDir, 'ConfigStore')), ''),
        watchDirectoryAndAncestors(path.join(outputDir, 'ConfigStore'), rescan)
      ]);
    }
    // The watchers of an output directory are also based at its ConfigStore, which can be created or replaced after them
    const identityOf = (key: string) => {
      const watched = key.slice(key.indexOf(':') + 1);
      const identity = getDirectoryIdentity(watched);
      return key.startsWith('outputDir:') ? `${identity}/${getDirectoryIdentity(path.join(watched, 'ConfigStore'))}` : identity;
    };

    // A watcher watches the directory a link pointed to when it was made, so a link that's retargeted, or a directory
    // that's replaced, needs new ones
    for (const [key, { watcher, identity }] of watchers) {
      if (!wanted.has(key) || identityOf(key) !== identity) {
        watcher.dispose();
        watchers.delete(key);
      }
    }

    for (const [key, createWatchers] of wanted) {
      if (watchers.has(key))
        continue;
      const identity = identityOf(key);
      watchers.set(key, { watcher: vscode.Disposable.from(...createWatchers()), identity });
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
   * Update PostCopy data for a generator
   */
  private static async updatePostCopyData(generatorPath: string): Promise<void> {
    // Find the workspace folder for this generator, which can be outside it
    const found = Array.from(this.generators).find(([, generators]) => generators.some(g => g.path === generatorPath));
    if (!found) {
      console.log(`[BuildSystemScanner] Generator not found at ${generatorPath}, skipping PostCopy update`);
      return;
    }

    const [workspaceFolderPath, generators] = found;
    const generator = generators.find(g => g.path === generatorPath)!;

    // Parse PostCopy.MConfig if it exists
    const postCopyPath = path.join(generatorPath, 'PostCopy.MConfig');
    if (await BuildSystemScanner.pathExists(postCopyPath)) {
      generator.postCopyProjects = await PostCopyParser.parse(postCopyPath);
      console.log(`[BuildSystemScanner] Updated PostCopy data for generator ${generator.name}`);
    } else {
      generator.postCopyProjects = undefined;
      console.log(`[BuildSystemScanner] Removed PostCopy data for generator ${generator.name} (file deleted)`);
    }

    // Update the generators map with the modified generator
    this.generators.set(workspaceFolderPath, generators);
  }

  /**
   * Update a single target configuration in an existing target
   */
  private static async updateSingleTargetConfiguration(targetConfigPath: string): Promise<void> {
    // Deduce paths from the config path
    // targetConfigPath is like: .../BuildSystem/Generator/ConfigStore/Workspace/Targets/Target/Configs/Config.json
    const targetPath = path.dirname(path.dirname(targetConfigPath)); // Remove Configs/Config.json
    const workspacePath = path.dirname(path.dirname(targetPath)); // Remove Targets/Target
    const targetName = path.basename(targetPath);
    const configName = path.basename(targetConfigPath, '.json');

    // Get the current targets for this workspace
    const targets = this.targets.get(workspacePath);
    if (!targets) {
      console.log(`[BuildSystemScanner] No targets found for workspace ${workspacePath}, running full scan`);
      await this.scanTargets(workspacePath);
      return;
    }

    // Find the specific target
    const targetIndex = targets.findIndex(t => t.name === targetName);
    if (targetIndex === -1) {
      console.log(`[BuildSystemScanner] Target ${targetName} not found, running full scan`);
      await this.scanTargets(workspacePath);
      return;
    }

    const target = targets[targetIndex];

    // Check if the config file exists
    if (!(await this.pathExists(targetConfigPath))) {
      console.log(`[BuildSystemScanner] Config file ${targetConfigPath} no longer exists, removing from target`);
      if (target.configurations)
        target.configurations.delete(configName);
    } else {
      // Read and update the specific configuration
      try {
        const content = await fsp.readFile(targetConfigPath, 'utf8');
        const configJson = JSON.parse(content);

        if (!target.configurations)
          target.configurations = new Map<string, TargetConfigInfo>();

        target.configurations.set(configName, {
          name: configName,
          path: targetConfigPath,
          platform: configJson.platform || '',
          architecture: configJson.architecture || '',
          configuration: configJson.configuration || '',
          targetName: configJson.targetName,
          debugPriority: configJson.debugPriority,
          generateScheme: configJson.generateScheme,
          debuggerCommandArguments: configJson.debuggerCommandArguments,
          localDebuggerCommand: configJson.localDebuggerCommand,
          localDebuggerWorkingDirectory: configJson.localDebuggerWorkingDirectory,
          remoteDebuggerCommand: configJson.remoteDebuggerCommand,
          remoteDebuggerWorkingDirectory: configJson.remoteDebuggerWorkingDirectory,
          compileCommands: configJson.compileCommands,
          postCopyDestination: configJson.postCopyDestination,
          postCopyProject: configJson.postCopyProject,
          postCopyProject2: configJson.postCopyProject2
        });

        console.log(`[BuildSystemScanner] Updated configuration ${configName} for target ${targetName}`);
      } catch (error) {
        console.error(`Error reading target configuration JSON for ${configName}: ${error}`);
      }
    }

    // Update the targets map with the modified target
    this.targets.set(workspacePath, targets);
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
            targetName: configJson.targetName,
            debugPriority: configJson.debugPriority,
            generateScheme: configJson.generateScheme,
            debuggerCommandArguments: configJson.debuggerCommandArguments,
            localDebuggerCommand: configJson.localDebuggerCommand,
            localDebuggerWorkingDirectory: configJson.localDebuggerWorkingDirectory,
            remoteDebuggerCommand: configJson.remoteDebuggerCommand,
            remoteDebuggerWorkingDirectory: configJson.remoteDebuggerWorkingDirectory,
            compileCommands: configJson.compileCommands,
            postCopyDestination: configJson.postCopyDestination,
            postCopyProject: configJson.postCopyProject,
            postCopyProject2: configJson.postCopyProject2
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
        let ninjaFile: string | undefined;

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
          ninjaFile = configJson.ninjaFile;
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
          defaultDebugTargets,
          ninjaFile
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

  public static async pathExists(p: string): Promise<boolean> {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }
}
