// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerSemanticTokens } from './semanticTokens';
import { ConfigurationReader } from './config';
import { StatusBar } from './statusBar';
import { MalterlibProjectDetector } from './malterlibProject';
import { BuildSystemScanner } from './buildSystemScanner';
import { MalterlibTaskProvider } from './malterlibTaskProvider';
import { MalterlibLaunchProvider } from './malterlibLaunchProvider';
import { StatusBarController } from './statusBarController';
import { CompileCommandsGenerator } from './compileCommandsGenerator';
import { MalterlibConfigEditorProvider } from './malterlibConfigEditorProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
async function waitForExtension(name: string, retries: number = 10) {
  if (!retries) {
    console.log(`Extension ${name} not found`);
    return;
  }

  const ext = vscode.extensions.getExtension(name);
  if (!ext) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return waitForExtension(name, retries - 1);
  }
  await ext.activate();
}

export async function activate(context: vscode.ExtensionContext) {
  await waitForExtension('llvm-vs-code-extensions.vscode-clangd');
  //	await waitForExtension('ms-vscode.cpptools');

  const output = vscode.window.createOutputChannel('Malterlib');
  output.appendLine('Malterlib initialized');

  // Initialize Malterlib project detector
  const projectDetector = MalterlibProjectDetector.initialize();
  context.subscriptions.push(projectDetector);

  // Initialize build system scanners for all workspace folders
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      if (MalterlibProjectDetector.isMalterlibProject(folder)) {
        const scanner = BuildSystemScanner.initialize(folder);
        context.subscriptions.push(scanner);
      }
    }
  }

  // Listen for new Malterlib projects and initialize scanners
  MalterlibProjectDetector.onDidChangeDetectionAsync(async (workspaceFolder: vscode.WorkspaceFolder | undefined) => {
    if (workspaceFolder && MalterlibProjectDetector.isMalterlibProject(workspaceFolder)) {
      const scanner = BuildSystemScanner.initialize(workspaceFolder);
      context.subscriptions.push(scanner);
      // Ensure initial scan for this workspace completes before detector queue drains
      await BuildSystemScanner.waitForScannerQueue();
      statusBar.update();
      statusController.cascadeAutoSelection();
      statusController.generateCompileCommands();
    }
  });

  // Initialize status bar
  const config = new ConfigurationReader();
  const statusBar = new StatusBar(config);
  // Hide status bar buttons until initial scans complete
  statusBar.setVisible(false);
  context.subscriptions.push(statusBar);
  // Create controller to manage status bar state and commands
  const statusController = new StatusBarController(statusBar, output, context.workspaceState);
  context.subscriptions.push(statusController);

  // Status bar controller handles scanning updates internally

  // After activation, wait for initial Malterlib detection and BuildSystem scanning to settle
  (async () => {
    try {
      await MalterlibProjectDetector.waitForDetectorQueue();
      await BuildSystemScanner.waitForScannerQueue();
    } catch (err) {
      console.error('Error waiting for initial scans:', err);
    } finally {
      output.appendLine(`Initial scanning complete`);
      statusBar.update();
      statusController.initializeAutoSelection();
      statusBar.setVisible(true);
      statusController.generateCompileCommands();
    }
  })();

  // Register task provider using controller snapshot
  const taskProvider = new MalterlibTaskProvider(
    () => statusController.getSelectionSnapshot(),
    () => statusController.getSelectedWorkspaceFolder()
  );
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(MalterlibTaskProvider.taskType, taskProvider)
  );

  // Register semantic tokens via helper
  context.subscriptions.push(registerSemanticTokens(context, output));

  // Register debug/launch configuration providers (dynamic + initial)
  const launchProvider = new MalterlibLaunchProvider(
    () => statusController.getSelectionSnapshot(),
    () => statusController.getDebugTargetsSnapshot(),
    () => statusController.getSelectedWorkspaceFolder(),
    output,
  );
  await launchProvider.initialize();

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('lldb', launchProvider, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    {
      dispose: () => launchProvider.dispose()
    }
  );

  // Register command to open the debug configuration file
  const openConfigCommand = vscode.commands.registerCommand('malterlib.openDebugConfigEditor', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
    const configUri = vscode.Uri.joinPath(vscodeDir, 'malterlib.json');

    try {
      // Check if file exists
      await vscode.workspace.fs.stat(configUri);
    } catch {
      // File doesn't exist, create it with default content
      const defaultConfig = {
        version: '1.0',
        workspaces: {}
      };
      const content = Buffer.from(JSON.stringify(defaultConfig, null, 2), 'utf8');

      // Ensure .vscode directory exists
      try {
        await vscode.workspace.fs.createDirectory(vscodeDir);
      } catch {
        // Directory might already exist, that's fine
      }

      await vscode.workspace.fs.writeFile(configUri, content);
    }

    // Open the file - it will automatically use our custom editor
    await vscode.commands.executeCommand('vscode.open', configUri);
  });
  context.subscriptions.push(openConfigCommand);

  // Register command to open the local debug configuration file
  const openLocalConfigCommand = vscode.commands.registerCommand('malterlib.openLocalDebugConfigEditor', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
    const configUri = vscode.Uri.joinPath(vscodeDir, 'malterlib.local.json');

    try {
      // Check if file exists
      await vscode.workspace.fs.stat(configUri);
    } catch {
      // File doesn't exist, create it with default content
      const defaultConfig = {
        version: '1.0',
        workspaces: {}
      };
      const content = Buffer.from(JSON.stringify(defaultConfig, null, 2), 'utf8');

      // Ensure .vscode directory exists
      try {
        await vscode.workspace.fs.createDirectory(vscodeDir);
      } catch {
        // Directory might already exist, that's fine
      }

      await vscode.workspace.fs.writeFile(configUri, content);

      // Add to .gitignore since file was just created
      const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
      // Use the most specific path possible (absolute path from repo root)
      const gitignorePath = '/.vscode/malterlib.local.json';
      
      try {
        // Read existing .gitignore
        const gitignoreContent = await vscode.workspace.fs.readFile(gitignoreUri);
        const gitignoreText = Buffer.from(gitignoreContent).toString('utf8');
        
        // Check if already in .gitignore (check various possible patterns)
        const lines = gitignoreText.split('\n');
        const alreadyIgnored = lines.some(line => {
          const trimmed = line.trim();
          return trimmed === gitignorePath ||
                 trimmed === gitignorePath.substring(1) || // without leading slash
                 trimmed === '.vscode/malterlib.local.json' ||
                 trimmed === 'malterlib.local.json' ||
                 trimmed === '*.local.json' ||
                 trimmed === '**/*.local.json' ||
                 trimmed === '.vscode/*.local.json';
        });
        
        if (!alreadyIgnored) {
          // Add to .gitignore with most specific path
          const newGitignore = gitignoreText.trimEnd() + '\n' + gitignorePath + '\n';
          await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(newGitignore, 'utf8'));
          vscode.window.showInformationMessage(`Added ${gitignorePath} to .gitignore`);
        }
      } catch {
        // .gitignore doesn't exist, create it with the entry
        const newGitignore = gitignorePath + '\n';
        await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(newGitignore, 'utf8'));
        vscode.window.showInformationMessage(`Created .gitignore and added ${gitignorePath}`);
      }
    }

    // Open the file - it will automatically use our custom editor
    await vscode.commands.executeCommand('vscode.open', configUri);
  });
  context.subscriptions.push(openLocalConfigCommand);

  // Register custom editor provider for malterlib.json files
  const editorProvider = new MalterlibConfigEditorProvider(context, statusController);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MalterlibConfigEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Helper function to get the current malterlib config URI if active (supports both .json and .local.json)
  const getCurrentMalterlibConfigUri = (): vscode.Uri | undefined => {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab?.input) {
      let uri: vscode.Uri | undefined;

      if (activeTab.input instanceof vscode.TabInputText)
        uri = activeTab.input.uri;
      else if (activeTab.input instanceof vscode.TabInputCustom)
        uri = activeTab.input.uri;

      if (uri && (uri.fsPath.endsWith('malterlib.json') || uri.fsPath.endsWith('malterlib.local.json'))) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
          const relativePath = vscode.workspace.asRelativePath(uri, false);
          if (relativePath === '.vscode/malterlib.json' || relativePath === '.vscode\\malterlib.json' ||
              relativePath === '.vscode/malterlib.local.json' || relativePath === '.vscode\\malterlib.local.json')
            return uri;
        }
      }
    }
    return undefined;
  };

  // Register command to open in JSON editor
  const openConfigJsonCommand = vscode.commands.registerCommand('malterlib.openConfigJson', () => {
    const uri = getCurrentMalterlibConfigUri();
    if (uri)
      vscode.commands.executeCommand('vscode.openWith', uri, 'default');
  });
  context.subscriptions.push(openConfigJsonCommand);

  // Register command to open in UI editor
  const openConfigUICommand = vscode.commands.registerCommand('malterlib.openConfigUI', () => {
    const uri = getCurrentMalterlibConfigUri();
    if (uri)
      vscode.commands.executeCommand('vscode.openWith', uri, MalterlibConfigEditorProvider.viewType);
  });
  context.subscriptions.push(openConfigUICommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Clean up any pending compile commands generation
  CompileCommandsGenerator.dispose();
}
