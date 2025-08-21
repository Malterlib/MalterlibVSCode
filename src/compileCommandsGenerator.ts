import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BuildSystemScanner, WorkspaceInfo, TargetInfo } from './buildSystemScanner';

export interface CompileCommand {
  directory: string;
  command?: string;
  arguments?: string[];
  file: string;
  output?: string;
}

export class CompileCommandsGenerator {
  /**
   * Generate a merged compile_commands.json file for a workspace
   * @param workspaceFolder The VS Code workspace folder
   * @param workspacePath The path to the selected Malterlib workspace
   * @param configurationName The selected configuration name
   * @param selectedTarget Optional selected target - if provided, its commands come first
   * @returns Path to the generated compile_commands.json file
   */
  public static async generateForWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    workspacePath: string,
    configurationName: string,
    selectedTarget?: string
  ): Promise<string | null> {
    try {
      // Get all targets in the workspace
      const targets = BuildSystemScanner.getTargets(workspacePath);
      if (targets.length === 0) {
        vscode.window.showWarningMessage('No targets found in workspace');
        return null;
      }

      // Collect all compile commands from all targets
      const allCommands: CompileCommand[] = [];
      const commandMap = new Map<string, CompileCommand[]>();
      
      for (const target of targets) {
        const commands = await this.getTargetCompileCommands(target, configurationName);
        if (commands.length > 0) {
          // Group commands by file
          for (const command of commands) {
            const key = this.getCommandKey(command);
            if (!commandMap.has(key)) {
              commandMap.set(key, []);
            }
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

      // Order commands: selected target's commands first
      for (const [key, commands] of commandMap.entries()) {
        if (commands.length === 1) {
          // Only one command for this file, add it directly
          allCommands.push(commands[0]);
        } else {
          // Multiple commands for the same file
          // Sort so selected target comes first
          const sorted = [...commands].sort((a, b) => {
            const aTarget = (a as any).__target;
            const bTarget = (b as any).__target;
            
            if (selectedTarget) {
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

      // Clean up temporary __target property
      for (const command of allCommands) {
        delete (command as any).__target;
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
      if (!target.configurations) {
        return [];
      }

      const targetConfig = target.configurations.get(configurationName);
      if (!targetConfig || !targetConfig.compileCommands) {
        return [];
      }

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
    if (a.command && b.command) {
      return a.command === b.command;
    }
    
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
    selectedTarget?: string
  ): vscode.Disposable {
    const pattern = new vscode.RelativePattern(workspaceFolder, 'BuildSystem/*/ConfigStore/*/Targets/*/*/compile_commands.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const regenerate = async () => {
      await this.generateForWorkspace(workspaceFolder, workspacePath, configurationName, selectedTarget);
    };

    watcher.onDidCreate(regenerate);
    watcher.onDidChange(regenerate);
    watcher.onDidDelete(regenerate);

    return watcher;
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