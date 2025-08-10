// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerSemanticTokens } from './semanticTokens';

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

	// Register semantic tokens via helper
	context.subscriptions.push(registerSemanticTokens(context, output));
}

// This method is called when your extension is deactivated
export function deactivate() { }
