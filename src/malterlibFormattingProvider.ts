import * as vscode from 'vscode';
import { GeneratorInfo } from './buildSystemScanner';
import { getFormatGenerator, onDidChangeFormatFileScripts, runFormatFileScript } from './formatFileScript';
import { MalterlibProjectDetector } from './malterlibProject';

/**
 * Formats documents and selections with the FormatFile.sh script of a ConfigStore. FormatFile.sh <File> [<Offset>
 * <Length>] reads the document from stdin and writes it formatted to stdout, with the selection's offset and length in
 * UTF-8 bytes. It exits with 0 when it wrote the document, 1 when it did but some violations have no automatic fix, and
 * 3 when the file doesn't opt in to formatting. Malterlib's runs MTool Format --stdin; another build system can supply
 * its own.
 */
export class MalterlibFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
  private static readonly languages = ['c', 'cpp', 'objective-c', 'objective-cpp', 'malterlib-build'];

  constructor(
    private getSelectedGenerator: () => string | null,
    private getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private output: vscode.OutputChannel
  ) { }

  /**
   * Register the provider for the documents of the workspace folders with a ConfigStore that has a FormatFile.sh, so it
   * isn't another formatter to choose from in other C and C++ workspaces. The registration follows the folders, and the
   * FormatFile.sh scripts, which the scanner doesn't watch.
   */
  register(): vscode.Disposable {
    let registration: vscode.Disposable | undefined;
    let registeredFolders: string | undefined;
    const update = () => {
      const folders = (vscode.workspace.workspaceFolders ?? [])
        .filter(folder => MalterlibProjectDetector.isMalterlibProject(folder) && this.getGenerator(folder));
      const key = folders.map(folder => folder.uri.toString()).join('\n');
      if (key === registeredFolders)
        return;
      registeredFolders = key;
      registration?.dispose();
      registration = undefined;
      if (!folders.length)
        return;
      const selector = folders.flatMap(folder => MalterlibFormattingProvider.languages
        .map(language => ({ language, scheme: 'file', pattern: new vscode.RelativePattern(folder, '**') })));
      registration = vscode.Disposable.from(
        vscode.languages.registerDocumentFormattingEditProvider(selector, this),
        vscode.languages.registerDocumentRangeFormattingEditProvider(selector, this)
      );
    };
    const scripts = onDidChangeFormatFileScripts(update);
    update();
    return vscode.Disposable.from(
      scripts,
      { dispose: () => registration?.dispose() }
    );
  }

  provideDocumentFormattingEdits(document: vscode.TextDocument, _options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    return this.format(document, undefined, token);
  }

  provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, _options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    return this.format(document, range, token);
  }

  private async format(document: vscode.TextDocument, range: vscode.Range | undefined, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder || !MalterlibProjectDetector.isMalterlibProject(workspaceFolder))
      return [];

    const generator = this.getGenerator(workspaceFolder);
    if (!generator) {
      vscode.window.setStatusBarMessage('Malterlib: No ConfigStore has a FormatFile.sh to format with', 5000);
      return [];
    }

    const source = document.getText();
    const args = [document.uri.fsPath];
    if (range) {
      const offset = Buffer.byteLength(source.slice(0, document.offsetAt(range.start)), 'utf8');
      const length = Buffer.byteLength(document.getText(range), 'utf8');
      args.push(String(offset), String(length));
    }

    const result = await runFormatFileScript(generator, workspaceFolder, args, source, token);
    if (token.isCancellationRequested)
      return [];

    const fileName = vscode.workspace.asRelativePath(document.uri, false);
    if (result.code === 3) {
      vscode.window.setStatusBarMessage(`Malterlib: ${fileName} doesn't opt in to formatting`, 5000);
      return [];
    }

    if (result.code !== 0 && result.code !== 1) {
      this.output.appendLine(`Formatting ${fileName} failed${result.code !== null ? ` with exit code ${result.code}` : ''}:`);
      this.output.appendLine(result.stderr.trimEnd());
      const firstLine = result.stderr.trim().split(/\r?\n/)[0];
      vscode.window.showErrorMessage(`Malterlib: Formatting ${fileName} failed${firstLine ? `: ${firstLine}` : ''}`);
      return [];
    }

    if (result.code === 1) {
      // The violations without an automatic fix, as <path>:<line>:<col>: <rule>: <explanation>
      this.output.appendLine(`Formatting ${fileName} left violations without an automatic fix:`);
      this.output.appendLine(result.stderr.trimEnd());
      vscode.window.setStatusBarMessage(`Malterlib: Formatting ${fileName} left violations without an automatic fix, see the Malterlib output`, 5000);
    }

    // The document's line endings, as the editor converts those of inserted text anyway, and the span of the changes
    // mustn't split a CRLF
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const formatted = result.stdout.replace(/\r\n|\r|\n/g, eol);
    if (formatted === source)
      return [];

    // One edit from the first to the last change. The editor reduces it to the lines that changed, but only after
    // checking whether the edits for several ranges, such as the modified lines when saving, overlap, which they would
    // if each replaced the whole document.
    let start = 0;
    while (start < source.length && start < formatted.length && source.charCodeAt(start) === formatted.charCodeAt(start))
      start++;
    let sourceEnd = source.length;
    let formattedEnd = formatted.length;
    while (sourceEnd > start && formattedEnd > start && source.charCodeAt(sourceEnd - 1) === formatted.charCodeAt(formattedEnd - 1)) {
      sourceEnd--;
      formattedEnd--;
    }
    // Not within a surrogate pair, which the editor would move the positions out of
    const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
    if (start > 0 && isLowSurrogate(source.charCodeAt(start)))
      start--;
    if (sourceEnd < source.length && isLowSurrogate(source.charCodeAt(sourceEnd))) {
      sourceEnd++;
      formattedEnd++;
    }
    return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(start), document.positionAt(sourceEnd)), formatted.substring(start, formattedEnd))];
  }

  private getGenerator(workspaceFolder: vscode.WorkspaceFolder): GeneratorInfo | undefined {
    return getFormatGenerator(workspaceFolder, this.getSelectedWorkspaceFolder(), this.getSelectedGenerator());
  }
}
