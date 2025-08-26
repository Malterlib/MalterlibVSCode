import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { BuildSystemScanner, TargetInfo } from './buildSystemScanner';

export interface CompileCommand {
  directory: string;
  command?: string;
  arguments?: string[];
  file: string;
  output?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class CompileCommandsGenerator {
  private static isGenerating = false;
  private static pendingRequests = new Map<string, {
    workspacePath: string;
    configurationName: string;
    selectedTarget?: string;
    generatorPath?: string;
    callbacks: Array<{
      resolve: (value: string | null) => void;
      reject: (error: any) => void;
    }>;
  }>();

  /**
   * Generate a merged compile_commands.json file for a workspace
   * @param workspaceFolder The VS Code workspace folder
   * @param workspacePath The path to the selected Malterlib workspace
   * @param configurationName The selected configuration name
   * @param selectedTarget Optional selected target - if provided, its commands come first
   * @param generatorPath Optional generator path to include commands from other workspaces
   * @returns Path to the generated compile_commands.json file
   */
  public static async generateForWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    workspacePath: string,
    configurationName: string,
    selectedTarget?: string,
    generatorPath?: string
  ): Promise<string | null> {
    const key = workspaceFolder.uri.fsPath;

    // Create a promise for this request
    return new Promise<string | null>((resolve, reject) => {
      // If already generating, add to pending
      if (this.isGenerating) {
        console.log(`Generation already in progress, queueing request for ${workspaceFolder.name}`);

        const existingRequest = this.pendingRequests.get(key);
        if (existingRequest) {
          // Add this callback to the existing request
          console.log(`Adding callback to existing pending request for ${workspaceFolder.name}`);
          existingRequest.callbacks.push({ resolve, reject });
          // Update the parameters to the latest values
          existingRequest.workspacePath = workspacePath;
          existingRequest.configurationName = configurationName;
          existingRequest.selectedTarget = selectedTarget;
          existingRequest.generatorPath = generatorPath;
        } else {
          // Create a new pending request
          this.pendingRequests.set(key, {
            workspacePath,
            configurationName,
            selectedTarget,
            generatorPath,
            callbacks: [{ resolve, reject }]
          });
        }
      } else {
        // Start processing immediately
        this.isGenerating = true;
        console.log(`Starting compile_commands.json generation for ${workspaceFolder.name}`);

        // Process asynchronously
        this.processGeneration(workspaceFolder, workspacePath, configurationName, selectedTarget, generatorPath, resolve, reject);
      }
    });
  }

  /**
   * Process generation and all pending requests
   */
  private static async processGeneration(
    workspaceFolder: vscode.WorkspaceFolder,
    workspacePath: string,
    configurationName: string,
    selectedTarget: string | undefined,
    generatorPath: string | undefined,
    resolve: (value: string | null) => void,
    reject: (error: any) => void
  ): Promise<void> {
    // Process the initial request

    try {
      const result = await this.doGenerateForWorkspace(workspaceFolder, workspacePath, configurationName, selectedTarget, generatorPath);
      resolve(result);
    } catch (error) {
      console.error('Error generating compile_commands.json:', error);
      vscode.window.showErrorMessage(`Failed to generate compile_commands.json: ${error}`);
      reject(error);
    }

    // Always process pending requests, even if the first one failed
    try {
      while (this.pendingRequests.size > 0) {
        // Get the first pending request
        const entry = this.pendingRequests.entries().next();
        if (!entry.value) break;
        const [pendingKey, pending] = entry.value;
        this.pendingRequests.delete(pendingKey);

        await sleep(1000); // Slight delay to batch rapid requests

        // Find the workspace folder for this key
        const pendingWorkspace = vscode.workspace.workspaceFolders?.find(ws => ws.uri.fsPath === pendingKey);
        if (pendingWorkspace) {
          try {
            console.log(`Processing pending request for ${pendingWorkspace.name} with ${pending.callbacks.length} waiting callbacks`);
            const pendingResult = await this.doGenerateForWorkspace(
              pendingWorkspace,
              pending.workspacePath,
              pending.configurationName,
              pending.selectedTarget,
              pending.generatorPath
            );
            // Resolve all callbacks with the result
            for (const callback of pending.callbacks)
              callback.resolve(pendingResult);
          } catch (error) {
            console.error(`Error processing pending request for ${pendingWorkspace.name}:`, error);
            // Reject all callbacks with the error
            for (const callback of pending.callbacks)
              callback.reject(error);
          }
        } else {
          // Workspace no longer exists, resolve all callbacks with null
          for (const callback of pending.callbacks)
            callback.resolve(null);
        }
      }
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Internal method that does the actual generation work
   */
  private static async doGenerateForWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    workspacePath: string,
    configurationName: string,
    selectedTarget?: string,
    generatorPath?: string
  ): Promise<string | null> {
    try {
      // Get all targets in the workspace
      const targets = BuildSystemScanner.getTargets(workspacePath);
      if (targets.length === 0) {
        vscode.window.showWarningMessage('No targets found in workspace');
        return null;
      }

      // Collect all compile commands from all targets
      const commandMap = new Map<string, CompileCommand[]>();

      for (const target of targets) {
        const commands = await this.getTargetCompileCommands(target, configurationName);
        if (commands.length > 0) {
          // Group commands by file
          for (const command of commands) {
            const key = this.getCommandKey(command);
            if (!commandMap.has(key))
              commandMap.set(key, []);
            const existingCommands = commandMap.get(key)!;

            // Check if this exact command already exists
            const isDuplicate = existingCommands.some(existing =>
              this.areCommandsIdentical(existing, command)
            );

            if (!isDuplicate) {
              existingCommands.push(command);
              // Mark which target this command came from
              (command as any).__target = target.name;
            }
          }
        }
      }

      // Add commands from other workspaces if generator path is provided
      if (generatorPath)
        await this.addCommandsFromOtherWorkspaces(commandMap, workspacePath, generatorPath, configurationName);

      // Build final command list with proper ordering
      const allCommands: CompileCommand[] = [];
      for (const commands of commandMap.values()) {
        if (commands.length === 1) {
          // Only one command for this file, add it directly
          allCommands.push(commands[0]);
        } else {
          // Multiple commands for the same file
          // Sort: selected target first, then current workspace targets, then other workspaces last
          const sorted = [...commands].sort((a, b) => {
            const aTarget = (a as any).__target;
            const bTarget = (b as any).__target;
            const aWorkspace = (a as any).__workspace;
            const bWorkspace = (b as any).__workspace;

            // Commands from other workspaces come last
            if (aWorkspace && !bWorkspace) return 1;
            if (!aWorkspace && bWorkspace) return -1;

            // Among current workspace commands, selected target comes first
            if (!aWorkspace && !bWorkspace && selectedTarget) {
              if (aTarget === selectedTarget) return -1;
              if (bTarget === selectedTarget) return 1;
            }

            // Otherwise maintain original order
            return 0;
          });

          // Add all variants (clangd and other tools can handle multiple entries)
          allCommands.push(...sorted);
        }
      }

      // Clean up temporary __target and __workspace properties
      for (const command of allCommands) {
        delete (command as any).__target;
        delete (command as any).__workspace;
      }

      // Write the merged compile_commands.json to the workspace root using atomic replace
      const outputPath = path.join(workspaceFolder.uri.fsPath, 'compile_commands.json');
      await this.atomicWriteFile(outputPath, JSON.stringify(allCommands, null, 2));

      return outputPath;
    } catch (error) {
      console.error('Error generating compile_commands.json:', error);
      vscode.window.showErrorMessage(`Failed to generate compile_commands.json: ${error}`);
      return null;
    }
  }

  /**
   * Get compile commands for a specific target and configuration
   */
  private static async getTargetCompileCommands(
    target: TargetInfo,
    configurationName: string
  ): Promise<CompileCommand[]> {
    try {
      // Get the target's configurations
      if (!target.configurations)
        return [];

      const targetConfig = target.configurations.get(configurationName);
      if (!targetConfig || !targetConfig.compileCommands || !(await BuildSystemScanner.pathExists(targetConfig.compileCommands)))
        return [];

      // Read the compile_commands.json file
      const compileCommandsPath = targetConfig.compileCommands;
      const content = await fsp.readFile(compileCommandsPath, 'utf8');
      const commands = JSON.parse(content) as CompileCommand[];

      return commands;
    } catch (error) {
      console.error(`Error reading compile commands for target ${target.name}:`, error);
      return [];
    }
  }

  /**
   * Get a unique key for a compile command (for deduplication)
   */
  private static getCommandKey(command: CompileCommand): string {
    // Use just the file path as the key to group commands for the same file
    return command.file;
  }

  /**
   * Check if two compile commands are identical
   */
  private static areCommandsIdentical(a: CompileCommand, b: CompileCommand): boolean {
    // Check all relevant fields
    if (a.file !== b.file) return false;
    if (a.directory !== b.directory) return false;
    if (a.output !== b.output) return false;

    // Compare command or arguments
    if (a.command && b.command)
      return a.command === b.command;

    if (a.arguments && b.arguments) {
      if (a.arguments.length !== b.arguments.length) return false;
      return a.arguments.every((arg, i) => arg === b.arguments![i]);
    }

    // One has command, other has arguments - not identical
    return false;
  }

  /**
   * Watch for changes in compile_commands.json files and regenerate merged file
   */
  public static createWatcher(
    workspaceFolder: vscode.WorkspaceFolder,
    workspacePath: string,
    configurationName: string,
    selectedTarget?: string,
    generatorPath?: string
  ): vscode.Disposable {
    const pattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore/*/Targets/*/*/compile_commands.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const regenerate = async () => {
      await this.generateForWorkspace(workspaceFolder, workspacePath, configurationName, selectedTarget, generatorPath);
    };

    watcher.onDidCreate(regenerate);
    watcher.onDidChange(regenerate);
    watcher.onDidDelete(regenerate);

    return watcher;
  }

  /**
   * Clean up pending requests
   * Should be called when extension is deactivated
   */
  public static dispose(): void {
    this.isGenerating = false;

    // Reject all pending promises
    for (const pending of this.pendingRequests.values()) {
      for (const callback of pending.callbacks)
        callback.reject(new Error('Extension deactivated'));
    }

    this.pendingRequests.clear();
  }

  /**
   * Add compile commands from other workspaces with the same generator
   * @param commandMap The existing command map to add to
   * @param currentWorkspacePath The current workspace path to exclude
   * @param generatorPath The generator path to find other workspaces for
   * @param configurationName The configuration to use for the other workspaces
   */
  private static async addCommandsFromOtherWorkspaces(
    commandMap: Map<string, CompileCommand[]>,
    currentWorkspacePath: string,
    generatorPath: string,
    configurationName: string
  ): Promise<void> {
    // Get all workspaces for this generator
    const allWorkspaces = BuildSystemScanner.getWorkspaces(generatorPath);

    // Extract base configuration name (strip suffix like " (Tests)")
    const baseConfigName = configurationName.replace(/ \(.*\)$/, '');

    for (const workspace of allWorkspaces) {
      // Skip the current workspace
      if (workspace.path === currentWorkspacePath)
        continue;

      // Get all targets in this workspace
      const targets = BuildSystemScanner.getTargets(workspace.path);

      for (const target of targets) {
        // Try to find the best matching configuration
        let selectedConfig: string | undefined;

        if (target.configurations) {
          const availableConfigs = Array.from(target.configurations.keys());

          // 1. Try exact match
          if (availableConfigs.includes(configurationName))
            selectedConfig = configurationName;
          // 2. Try base config match (e.g., "Release Testing" matches "Release Testing (Tests)")
          else if (availableConfigs.some(c => c.replace(/ \(.*\)$/, '') === baseConfigName))
            selectedConfig = availableConfigs.find(c => c.replace(/ \(.*\)$/, '') === baseConfigName);
          // 3. Use any available configuration as fallback
          else if (availableConfigs.length > 0)
            selectedConfig = availableConfigs[0];
        }

        if (!selectedConfig)
          continue;

        const commands = await this.getTargetCompileCommands(target, selectedConfig);

        for (const command of commands) {
          const key = this.getCommandKey(command);

          // Only add if the file is not already in the map
          // This is different from the main selection which checks if commands are identical
          if (!commandMap.has(key)) {
            commandMap.set(key, [command]);

            // Mark which workspace and target this command came from
            (command as any).__workspace = workspace.name;
            (command as any).__target = target.name;
          }
        }
      }
    }
  }

  /**
   * Atomically write a file by writing to a temporary file and then renaming it
   * This ensures the file is either fully written or not written at all
   */
  private static async atomicWriteFile(filePath: string, content: string): Promise<void> {
    // Generate a unique temporary file name in the same directory
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const tempName = `.${basename}.${process.pid}.${Date.now()}.tmp`;
    const tempPath = path.join(dir, tempName);

    try {
      // Write to temporary file with exclusive flag to prevent race conditions
      await fsp.writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });

      // Atomically rename the temporary file to the target file
      // This operation is atomic on POSIX systems and mostly atomic on Windows
      await fsp.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fsp.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}
