// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
	output.appendLine('Malterlib semantic-token provider activated');
	
	// ---------- Load Malterlib data ----------
	const extensionRoot = context.extensionPath;
	function readJSON(rel: string) {
		const abs = path.join(extensionRoot, rel); // workspace root is parent of extension dir
		try {
			return JSON.parse(fs.readFileSync(abs, 'utf8'));
		} catch {
			return {};
		}
	}

	// Load new combined scopes.json
	const scopesJson = readJSON('scopes.json');
	const keywords: Record<string, string> = scopesJson.keywords;
	const prefixes: string[] = Object.keys(scopesJson.prefixes);
	const prefixInfo: Record<string, {scope: string, variable: boolean}> = scopesJson.prefixes;
	const scopeArray: string[] = scopesJson.scopes;

	// Prefix maps: variable and non-variable
	const maxPrefixLen = 6;
	const prefixMapInfoVar: Record<number, Record<string, string>> = {};
	const prefixMapInfo: Record<number, Record<string, string>> = {};
	for (let i = 0; i <= maxPrefixLen; ++i) {
		prefixMapInfoVar[i] = {};
		prefixMapInfo[i] = {};
	}
	for (const prefix of prefixes) {
		const {scope, variable} = prefixInfo[prefix];
		const len = prefix.length;
		if (variable)
			prefixMapInfoVar[len][prefix] = scope;
		else
			prefixMapInfo[len][prefix] = scope;
	}

	// Concept valid chars (from C++: "binpfro")
	const validConceptChars = new Set('binpfro'.split(''));
	function isUpperCase(ch: string) {
		const code = ch.charCodeAt(0);
		return (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || (code >= 0xc0 && code <= 0xdf);
	}

	function matchVariablePrefix(identifier: string, prefix: string): boolean {
		if (!identifier.startsWith(prefix)) return false;
		const matchLen = prefix.length;
		const identLen = identifier.length;
		if (identLen <= matchLen) return false;
		let ch = identifier[matchLen];
		if (isUpperCase(ch)) return true;
		if (!validConceptChars.has(ch)) return false;
		if (identLen <= matchLen + 1) return false;
		ch = identifier[matchLen + 1];
		if (isUpperCase(ch)) return true;
		return false;
	}

	function matchOtherPrefix(identifier: string, prefix: string): boolean {
		const matchLen = prefix.length;
		const identLen = identifier.length;
		if (identLen <= matchLen) return false;
		return identifier.startsWith(prefix) && isUpperCase(identifier[matchLen]);
	}

	function classifyIdentifier(name: string): string | undefined {
		// 1. Exact keyword match
		if (keywords[name]) 
			return keywords[name];
		// 2. Prefix match (longest first)
		const len = name.length;
		for (let i = Math.min(maxPrefixLen, len); i >= 0; --i) {
			const prefix = name.substring(0, i);
			if (prefixMapInfo[i][prefix]) {
				if (matchOtherPrefix(name, prefix)) {
					// Special case for E/CF
					if (i === 1 && prefix === 'E' && !name.includes('_'))
						return "malterlib-enum"; // Enum
					if (i === 2 && prefix === 'CF' && name.endsWith('Ref'))
						return "malterlib-type"; // CoreFoundation type
					return prefixMapInfo[i][prefix];
				}
			}
			if (prefixMapInfoVar[i][prefix]) {
				if (matchVariablePrefix(name, prefix))
					return prefixMapInfoVar[i][prefix];
			}
		}
		return undefined;
	}

	const scopeToIndex = new Map<string, number>();
	scopeArray.forEach((scope, idx) => scopeToIndex.set(scope, idx));

	const legend = new vscode.SemanticTokensLegend(scopeArray, []);

	class MalterlibProvider implements vscode.DocumentSemanticTokensProvider {
		provideDocumentSemanticTokens(doc: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
			const builder = new vscode.SemanticTokensBuilder(legend);
			
			// Improved identifier regex: matches [[, ]], standard identifiers, and preprocessor directives like #include
			const identRe = /(\[\[|\]\]|#[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)/g;

			let inBlockComment = false; // Track block comment state across lines

			for (let line=0; line<doc.lineCount; ++line) {
				const text = doc.lineAt(line).text;

				// --- Track comment/string/include state ---
				// States: inBlockComment, inString, inChar, inAngleInclude
				let inAngleInclude = false;
				let includeStart = text.match(/^\s*#\s*include\s*/);
				let angleStart = -1;
				if (includeStart) {
					// Find first < after #include
					angleStart = text.indexOf('<', includeStart[0].length);
					if (angleStart !== -1) {
						// Find closing >
						let angleEnd = text.indexOf('>', angleStart+1);
						if (angleEnd !== -1)
							inAngleInclude = true;
					}
				}

				// Precompute comment/string/angle regions for this line
				let regions: Array<{start: number, end: number}> = [];

				let searchIdx = 0;
				while (searchIdx < text.length) {
					if (inBlockComment) {
						let end = text.indexOf('*/', searchIdx);
						if (end !== -1) {
							regions.push({start: searchIdx, end: end+2});
							searchIdx = end+2;
							inBlockComment = false;
						} else {
							regions.push({start: searchIdx, end: text.length});
							break;
						}
					} else {
						let start = text.indexOf('/*', searchIdx);
						let lineCommentStart = text.indexOf('//', searchIdx);
						if (start !== -1 && (lineCommentStart === -1 || start < lineCommentStart)) {
							let end = text.indexOf('*/', start+2);
							if (end !== -1) {
								regions.push({start, end: end+2});
								searchIdx = end+2;
							} else {
								regions.push({start, end: text.length});
								inBlockComment = true;
								break;
							}
						} else if (lineCommentStart !== -1) {
							regions.push({start: lineCommentStart, end: text.length});
							break;
						} else
							break;
					}
				}

				// Strings and char literals
				let strRe = /("([^\\"]|\\.)*")|('([^\\']|\\.)*')/g;
				let mstr: RegExpExecArray | null;
				while ((mstr = strRe.exec(text)))
					regions.push({start: mstr.index, end: mstr.index + mstr[0].length});

				// Angle include
				if (inAngleInclude && angleStart !== -1) {
					let angleEnd = text.indexOf('>', angleStart+1);
					if (angleEnd !== -1)
						regions.push({start: angleStart, end: angleEnd+1});
				}
				// Sort regions for efficient lookup
				regions.sort((a,b)=>a.start-b.start);

				// Helper: is a given range inside any region?
				function isInRegion(start: number, end: number) {
					for (const r of regions) {
						if (start < r.end && end > r.start) 
							return true;
					}
					return false;
				}

				let m: RegExpExecArray | null;
				while ((m = identRe.exec(text))) {
					const ident = m[0];
					const start = m.index;
					const end = m.index + ident.length;
					if (isInRegion(start, end)) 
						continue; // skip if inside comment/string/include
					const scope = classifyIdentifier(ident);
					if (scope) {
						const tokenType = scopeToIndex.get(scope);
						if (tokenType !== undefined)
							builder.push(line, m.index, ident.length, tokenType, 0);
					}
				}

			}
			return builder.build();
		}
	}

	const provider = new MalterlibProvider();
	const langs = [{scheme: '*', language:'c' }, {scheme: '*', language:'cpp' }];
	
	// Register providers
	const disposables: vscode.Disposable[] = [];
	
	function registerProviders() {
		// Dispose existing providers
		disposables.forEach(d => d.dispose());
		disposables.length = 0;
		
		// Check if semantic coloring is enabled
		const config = vscode.workspace.getConfiguration('malterlib');
		const enableSemanticColoring = config.get<boolean>('enableSemanticColoring', true);
		
		if (enableSemanticColoring) {
			// Register new providers only when enabled
			for (const sel of langs) {
				const disposable = vscode.languages.registerDocumentSemanticTokensProvider(sel, provider, legend);
				disposables.push(disposable);
			}
		}
	}
	
	// Initial registration
	registerProviders();
	
	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('malterlib.enableSemanticColoring')) {
				output.appendLine(`Semantic coloring setting changed. Re-registering providers...`);
				registerProviders();
				
				// The semantic tokens will update automatically when the provider is re-registered
				// No need for additional refresh commands
			}
		})
	);
	
	// Clean up disposables on deactivation
	context.subscriptions.push({
		dispose: () => {
			disposables.forEach(d => d.dispose());
		}
	});
	
	setTimeout(() => {
		registerProviders();
	}, 1000);
}

// This method is called when your extension is deactivated
export function deactivate() {}
