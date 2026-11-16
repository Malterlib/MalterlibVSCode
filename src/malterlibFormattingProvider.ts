import * as vscode from 'vscode';
import { GeneratorInfo } from './buildSystemScanner';
import { FormatResult, getFormatGenerator, onDidChangeFormatFileScripts, runFormatFileScript, scriptExists } from './formatFileScript';
import { FormatAnswer, FormatServers, toUtf8Text } from './formatServer';
import { MalterlibProjectDetector } from './malterlibProject';

/**
 * Formats documents and selections with the scripts of a ConfigStore.
 *
 * FormatServer.sh is kept running, and is given the document, with the selection's offset and length in UTF-8 bytes, as
 * a request, which it answers with the document formatted. Malterlib's runs MTool Format --server.
 *
 * A ConfigStore without it, or whose script fails, as with an MTool that has no --server yet, formats with FormatFile.sh
 * if it has one, which is run for each document: FormatFile.sh <File> [<Offset> <Length>] reads the document from stdin
 * and writes it formatted to stdout. It exits with 0 when it wrote the document, 1 when it did but some violations have
 * no automatic fix, and 3 when the file doesn't opt in to formatting. Malterlib's runs MTool Format --stdin; another
 * build system can supply its own.
 */
export class MalterlibFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
  private static readonly languages = ['c', 'cpp', 'objective-c', 'objective-cpp', 'malterlib-build'];

  constructor(
    private getSelectedGenerator: () => string | null,
    private getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private servers: FormatServers,
    private output: vscode.OutputChannel
  ) { }

  /**
   * Register the provider for the documents of the workspace folders with a ConfigStore that has a script to format
   * with, so it isn't another formatter to choose from in other C and C++ workspaces. The registration follows the
   * folders, and the scripts, which the scanner doesn't watch.
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
      vscode.window.setStatusBarMessage('Malterlib: No ConfigStore has a script to format with', 5000);
      return [];
    }

    const source = document.getText();
    const selection = range && {
      offset: Buffer.byteLength(source.slice(0, document.offsetAt(range.start)), 'utf8'),
      length: Buffer.byteLength(document.getText(range), 'utf8')
    };

    const fileName = vscode.workspace.asRelativePath(document.uri, false);
    let result: FormatResult | undefined;
    // A document with a NUL character can't be given to a format server
    if (this.servers.isUsable(generator.formatServerScript) && !source.includes('\0')) {
      const script = generator.formatServerScript;
      const answer = (await this.servers.request(script, generator, workspaceFolder, [{ request: 'file', path: document.uri.fsPath, source, ...selection }]))?.[0];
      // The source as the server gets it, which is what a document that stays as it is, is
      result = answer && MalterlibFormattingProvider.getServerResult(answer, toUtf8Text(source));
      if (answer && !result)
        this.servers.fail(script, 'It answered a file with none of a text, unchanged, excluded and an error');
      if (token.isCancellationRequested)
        return [];
    }
    // Without a format server, or with one that failed, the way an MTool without --server formats
    if (!result) {
      if (!scriptExists(generator.formatFileScript)) {
        vscode.window.showErrorMessage(`Malterlib: Formatting ${fileName} failed, see the Malterlib output`);
        return [];
      }
      const args = [document.uri.fsPath];
      if (selection)
        args.push(String(selection.offset), String(selection.length));
      result = await runFormatFileScript(generator, workspaceFolder, args, source, token);
      if (token.isCancellationRequested)
        return [];
    }

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

  /**
   * A format server's answer for a file as FormatFile.sh gives it, by its exit code, stdout and stderr, or undefined
   * for what is no answer for a file
   */
  private static getServerResult(answer: FormatAnswer, source: string): FormatResult | undefined {
    const report = typeof answer.report === 'string' ? answer.report : '';
    if (typeof answer.error === 'string')
      return { code: 2, stdout: '', stderr: report ? `${report}\n${answer.error}` : answer.error };
    if (answer.excluded === true)
      return { code: 3, stdout: '', stderr: report };
    const text = typeof answer.text === 'string' ? answer.text : answer.unchanged === true ? source : undefined;
    if (text === undefined)
      return undefined;
    return { code: answer.unresolved === true ? 1 : 0, stdout: text, stderr: report };
  }

  private getGenerator(workspaceFolder: vscode.WorkspaceFolder): GeneratorInfo | undefined {
    return getFormatGenerator(workspaceFolder, this.getSelectedWorkspaceFolder(), this.getSelectedGenerator());
  }
}
