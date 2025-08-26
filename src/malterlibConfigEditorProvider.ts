import * as vscode from 'vscode';
import { BuildSystemScanner } from './buildSystemScanner';
import { StatusBarController } from './statusBarController';
import { MalterlibConfigShared } from './malterlibConfigShared';

export class MalterlibConfigEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'malterlib.configEditor';

  private statusController: StatusBarController | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    statusController?: StatusBarController
  ) {
    this.statusController = statusController;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Setup the webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(vscode.Uri.joinPath(this.context.extensionUri, 'media').fsPath)]
    };

    // Set initial content
    webviewPanel.webview.html = MalterlibConfigShared.getWebviewContent(
      webviewPanel.webview,
      this.context.extensionPath
    );

    // Track state
    let updateFromWebview = false;
    let scannerChangeDisposable: vscode.Disposable | undefined;
    let selectionChangeDisposable: vscode.Disposable | undefined;

    // Check if editing local.json
    const isLocalConfig = document.uri.path.endsWith('malterlib.local.json');

    // Function to update webview from document
    const updateWebview = async () => {
      if (updateFromWebview) {
        updateFromWebview = false;
        return;
      }

      try {
        const text = document.getText();
        const config = text ? JSON.parse(text) : { version: '1.0', workspaces: {} };
        const scannerData = MalterlibConfigShared.getScannerData(this.statusController, isLocalConfig);
        const selectionState = MalterlibConfigShared.getSelectionState(this.statusController);

        webviewPanel.webview.postMessage({
          command: 'loadConfig',
          config,
          scannerData,
          isLocalConfig,
          selectionState,
        });
      } catch (error) {
        // Invalid JSON, let the webview know
        webviewPanel.webview.postMessage({
          command: 'error',
          message: `Invalid JSON: ${error}`
        });
      }
    };

    // Setup automatic updates from scanner
    const setupAutomaticUpdates = async () => {
      // Listen for scanner data changes
      scannerChangeDisposable = BuildSystemScanner.onDidChangeScanningAsync(async () => {
        updateWebview();
      });

      // Listen for selection state changes
      if (this.statusController) {
        selectionChangeDisposable = this.statusController.onSelectionChanged(() => {
          updateWebview();
        });
      }
    };

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'load':
          await updateWebview();
          break;
        case 'save':
          updateFromWebview = true;
          const json = JSON.stringify(message.config, null, 2);
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            json
          );
          await vscode.workspace.applyEdit(edit);
          break;
        case 'openBaseConfig':
          // Open the base malterlib.json file
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const baseConfigUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'malterlib.json');
            await vscode.commands.executeCommand('vscode.open', baseConfigUri);
          }
          break;
        case 'selectDebugTargets':
          // Execute the existing command to select multiple debug targets
          await vscode.commands.executeCommand('malterlib.selectDebugTargets');
          break;
        case 'selectSingleDebugTarget':
          // Execute the existing command to select a single debug target
          await vscode.commands.executeCommand('malterlib.selectSingleDebugTarget');
          break;
        case 'getPostCopyDestinations': {
          // Get PostCopy destinations for current target
          const { workspace, target, configuration } = message;
          
          const destinations: string[] = [];
          
          if (workspace && target) {
            // Get the workspace folder and its generator
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
              const defaultGen = BuildSystemScanner.getDefaultGenerator(workspaceFolder);
              
              if (defaultGen) {
                // Get the workspace path
                const workspaces = BuildSystemScanner.getWorkspaces(defaultGen.path);
                const workspaceInfo = workspaces.find(w => w.name === workspace);
                
                if (workspaceInfo) {
                  // Get target configuration info
                  const targetInfo = BuildSystemScanner.getTargetConfigInfo(workspaceInfo.path, target, configuration);
                  
                  if (targetInfo?.postCopyProject || targetInfo?.postCopyProject2) {
                    // Get PostCopy.MConfig data from scanner
                    const postCopyProjects = BuildSystemScanner.getPostCopyProjects(defaultGen.path);
                    
                    if (postCopyProjects) {
                      // Check primary project
                      if (targetInfo.postCopyProject) {
                        const project = postCopyProjects.get(targetInfo.postCopyProject);
                        if (project) {
                          project.destinations.forEach((dest: string) => {
                            // Use postCopyDestination if specified, otherwise just the destination
                            if (targetInfo.postCopyDestination)
                              destinations.push(`${dest}/${targetInfo.postCopyDestination}`);
                            else
                              destinations.push(dest);
                          });
                        }
                      }
                      
                      // Check secondary project  
                      if (targetInfo.postCopyProject2) {
                        const project = postCopyProjects.get(targetInfo.postCopyProject2);
                        if (project) {
                          project.destinations.forEach((dest: string) => {
                            // Use same postCopyDestination for second project if specified
                            if (targetInfo.postCopyDestination)
                              destinations.push(`${dest}/${targetInfo.postCopyDestination}`);
                            else
                              destinations.push(dest);
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Send destinations back to webview
          webviewPanel.webview.postMessage({
            command: 'postCopyDestinations',
            destinations
          });
          break;
        }
      }
    });

    // Update webview when document changes
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString())
        updateWebview();
    });

    // Setup automatic updates
    await setupAutomaticUpdates();

    // Initial load
    await updateWebview();

    // Cleanup
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      if (scannerChangeDisposable) scannerChangeDisposable.dispose();
      if (selectionChangeDisposable) selectionChangeDisposable.dispose();
    });
  }
}