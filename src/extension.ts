// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerSemanticTokens } from './semanticTokens';
import { ConfigurationReader } from './config';
import { StatusBar } from './statusBar';
import { MalterlibProjectDetector } from './malterlibProject';
import { BuildSystemScanner } from './buildSystemScanner';
import { MalterlibTaskProvider } from './malterlibTaskProvider';
import { StatusBarController } from './statusBarController';

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
			statusBar.update();
			statusController.initializeAutoSelection();
			statusBar.setVisible(true);
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
}

// This method is called when your extension is deactivated
export function deactivate() { }
