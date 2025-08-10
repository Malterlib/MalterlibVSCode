import * as vscode from 'vscode';
import { promises as fsp } from 'fs';

export class MalterlibProjectDetector {
  private static malterlibProjects = new Set<string>();

  // --- Queue to serialize scans and avoid race conditions ---
  private static taskQueue: Array<{
    kind: 'folder' | 'flush';
    workspaceFolder?: vscode.WorkspaceFolder;
    resolve?: () => void;
    key?: string; // used for dedup of folder tasks
  }> = [];
  private static queuedKeys = new Set<string>();
  private static processingQueue = false;

  private static enqueueTask(task: { kind: 'folder'; workspaceFolder: vscode.WorkspaceFolder; key: string }): void;
  private static enqueueTask(task: { kind: 'flush'; resolve: () => void }): void;
  private static enqueueTask(task: { kind: 'folder' | 'flush'; workspaceFolder?: vscode.WorkspaceFolder; key?: string; resolve?: () => void }): void {
    if (task.kind === 'folder') {
      if (!task.key || !task.workspaceFolder)
        return;
      if (this.queuedKeys.has(task.key))
        return;
      this.taskQueue.push(task);
      this.queuedKeys.add(task.key);
    } else
      this.taskQueue.push(task);
    void this.processQueue();
  }

  private static async processQueue(): Promise<void> {
    if (this.processingQueue)
      return;
    this.processingQueue = true;
    try {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        try {
          if (task.kind === 'folder' && task.workspaceFolder) {
            if (task.key)
              this.queuedKeys.delete(task.key);
            await this.scanFolder(task.workspaceFolder);
          } else if (task.kind === 'flush') {
            // no-op, used to resolve when prior tasks are done
          }
          // For folder tasks, notify async listeners and await them
          if (task.kind === 'folder' && task.workspaceFolder)
            await this.notifyAsyncDetectionListeners(task.workspaceFolder);
          if (task.kind === 'flush' && task.resolve)
            task.resolve();
        } catch (err) {
          console.error('Error processing MalterlibProjectDetector task', err);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Check if a workspace folder contains a Malterlib project
   */
  public static isMalterlibProject(workspaceFolder: vscode.WorkspaceFolder): boolean {
    if (!workspaceFolder)
      return false;

    const projectPath = workspaceFolder.uri.fsPath;
    return this.malterlibProjects.has(projectPath);
  }

  /**
   * Check if any workspace folder contains a Malterlib project
   */
  public static hasAnyMalterlibProject(): boolean {
    if (!vscode.workspace.workspaceFolders)
      return false;

    return vscode.workspace.workspaceFolders.some(folder => this.isMalterlibProject(folder));
  }

  /**
   * Get the current active Malterlib workspace folder (if any)
   */
  public static getActiveMalterlibWorkspace(): vscode.WorkspaceFolder | undefined {
    if (!vscode.workspace.workspaceFolders)
      return undefined;

    // First try to get workspace folder of active text editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (workspaceFolder && this.isMalterlibProject(workspaceFolder))
        return workspaceFolder;
    }

    // Fall back to first Malterlib project found
    return vscode.workspace.workspaceFolders.find(folder => this.isMalterlibProject(folder));
  }

  /**
   * Initialize the detector and scan all workspace folders
   */
  public static initialize(): vscode.Disposable {
    // Initial scan (enqueue)
    this.queueAllWorkspaces();

    const disposables: vscode.Disposable[] = [];

    // Watch for workspace folder changes
    disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(e => {
        // Remove removed folders
        for (const removed of e.removed)
          this.malterlibProjects.delete(removed.uri.fsPath);

        // Scan added folders
        for (const added of e.added)
          this.queueFolder(added);
      })
    );

    // Watch for file system changes to detect new .MBuildSystem files
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const pattern = new vscode.RelativePattern(folder, '*.MBuildSystem');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        
        watcher.onDidCreate(uri => {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
          if (workspaceFolder)
            this.queueFolder(workspaceFolder);
        });

        watcher.onDidDelete(uri => {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
          if (workspaceFolder)
            this.queueFolder(workspaceFolder);
        });

        disposables.push(watcher);
      }
    }

    return vscode.Disposable.from(...disposables);
  }

  /**
   * Enqueue scans for all current workspace folders
   */
  private static queueAllWorkspaces(): void {
    if (!vscode.workspace.workspaceFolders)
      return;

    for (const folder of vscode.workspace.workspaceFolders)
      this.queueFolder(folder);
  }

  /**
   * Enqueue a scan for a specific workspace folder
   */
  private static queueFolder(workspaceFolder: vscode.WorkspaceFolder): void {
    const key = workspaceFolder.uri.fsPath;
    this.enqueueTask({ kind: 'folder', workspaceFolder, key });
  }

  /**
   * Perform the actual scan of a workspace folder for .MBuildSystem files
   */
  private static async scanFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const directoryPath = workspaceFolder.uri.fsPath;
    let hasMalterlibFile = false;
    try {
      const files = await fsp.readdir(directoryPath);
      hasMalterlibFile = files.some(file => file.endsWith('.MBuildSystem'));
    } catch {
      hasMalterlibFile = false; // directory might not exist or be inaccessible
    }

    const hadProject = this.malterlibProjects.has(directoryPath);
    if (hasMalterlibFile && !hadProject)
      this.malterlibProjects.add(directoryPath);
    else if (!hasMalterlibFile && hadProject)
      this.malterlibProjects.delete(directoryPath);
  }

  /**
   * Wait until the detector's queue drains. If busy, enqueues a flush task that resolves
   * after all prior tasks complete.
   */
  public static async waitForDetectorQueue(): Promise<void> {
    const isBusy = this.processingQueue || this.taskQueue.length > 0;
    if (!isBusy)
      return;
    await new Promise<void>(resolve => {
      this.enqueueTask({ kind: 'flush', resolve });
    });
  }

  // Async detection listeners that are awaited by the queue
  private static asyncDetectionListeners = new Set<(workspaceFolder: vscode.WorkspaceFolder) => Promise<void> | void>();

  public static onDidChangeDetectionAsync(listener: (workspaceFolder: vscode.WorkspaceFolder) => Promise<void> | void): vscode.Disposable {
    this.asyncDetectionListeners.add(listener);
    return { dispose: () => this.asyncDetectionListeners.delete(listener) };
  }

  private static async notifyAsyncDetectionListeners(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    if (this.asyncDetectionListeners.size === 0)
      return;
    const tasks = Array.from(this.asyncDetectionListeners).map(fn => Promise.resolve().then(() => fn(workspaceFolder)));
    await Promise.allSettled(tasks);
  }
}