import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { BuildSystemScanner, GeneratorInfo } from './buildSystemScanner';
import { MalterlibProjectDetector } from './malterlibProject';

/**
 * The Git Bash that runs the ConfigStore's scripts on Windows, like the tasks' terminal. Git for Windows only adds the
 * directory of git.exe to the PATH by default, and a bash.exe on the PATH can be WSL's.
 */
function findGitBash(): string {
  const candidates: string[] = [];
  const terminal = vscode.workspace.getConfiguration('terminal.integrated');
  const profileName = terminal.get<string>('defaultProfile.windows');
  const profiles = terminal.get<Record<string, { path?: string | string[] } | null>>('profiles.windows') ?? {};
  const profilePath = profileName ? profiles[profileName]?.path : undefined;
  for (const candidate of Array.isArray(profilePath) ? profilePath : profilePath ? [profilePath] : []) {
    if (/bash\.exe$/i.test(candidate))
      candidates.push(candidate);
  }
  // <Git>\cmd\git.exe on the PATH
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (directory && fs.existsSync(path.join(directory, 'git.exe')))
      candidates.push(path.join(directory, '..', 'bin', 'bash.exe'));
  }
  for (const root of [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (root)
      candidates.push(path.join(root, 'Git', 'bin', 'bash.exe'));
  }
  if (process.env.LOCALAPPDATA)
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'));
  return candidates.find(candidate => fs.existsSync(candidate)) ?? 'bash';
}

interface FormatResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

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
    const scriptWatchers = new Map<string, vscode.Disposable>();
    const update = () => {
      const scripts = new Set((vscode.workspace.workspaceFolders ?? [])
        .filter(folder => MalterlibProjectDetector.isMalterlibProject(folder))
        .flatMap(folder => BuildSystemScanner.getGenerators(folder).flatMap(generator => generator.formatFileScript ?? [])));
      for (const [script, watcher] of scriptWatchers) {
        if (!scripts.has(script)) {
          watcher.dispose();
          scriptWatchers.delete(script);
        }
      }
      for (const script of scripts) {
        if (scriptWatchers.has(script))
          continue;
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(path.dirname(script)), path.basename(script).replace(/[[\]{}*?]/g, '?')), false, true, false);
        scriptWatchers.set(script, vscode.Disposable.from(watcher, watcher.onDidCreate(update), watcher.onDidDelete(update)));
      }

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
    update();
    return vscode.Disposable.from(
      BuildSystemScanner.onDidChangeScanningAsync(() => update()),
      MalterlibProjectDetector.onDidChangeDetectionAsync(() => update()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => update()),
      { dispose: () => registration?.dispose() },
      { dispose: () => scriptWatchers.forEach(watcher => watcher.dispose()) }
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

    const result = await this.run(generator, workspaceFolder, args, source, token);
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

  /**
   * The ConfigStore to format with: the selected generator's in the selected workspace folder, or the one with the
   * highest priority
   */
  private getGenerator(workspaceFolder: vscode.WorkspaceFolder): GeneratorInfo | undefined {
    const generators = BuildSystemScanner.getGenerators(workspaceFolder)
      .filter(generator => generator.formatFileScript && fs.existsSync(generator.formatFileScript));
    const selectedGenerator = this.getSelectedWorkspaceFolder()?.uri.fsPath === workspaceFolder.uri.fsPath ? this.getSelectedGenerator() : null;
    return generators.find(generator => generator.name === selectedGenerator) ?? generators[0];
  }

  private run(generator: GeneratorInfo, workspaceFolder: vscode.WorkspaceFolder, args: string[], input: string, token: vscode.CancellationToken): Promise<FormatResult> {
    return new Promise(resolve => {
      const cwd = generator.buildSystemBasePath || workspaceFolder.uri.fsPath;
      const env = { ...process.env, MalterlibWorkspaceRoot: cwd };

      // On Windows the ConfigStore's scripts run in Git Bash, like the tasks. Elsewhere the script gets its own process
      // group, so cancelling can stop the formatter it runs too.
      const script = generator.formatFileScript!;
      const child = process.platform === 'win32'
        ? spawn(findGitBash(), [vscode.Uri.file(script).path.replace(/^\/([a-z]):/, '/$1'), ...args], { cwd, env })
        : spawn(script, args, { cwd, env, detached: true });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (data: Buffer) => stdout.push(data));
      child.stderr.on('data', (data: Buffer) => stderr.push(data));

      // The processes the script runs keep its output open, so don't wait for them to exit
      const cancellation = token.onCancellationRequested(() => {
        if (child.pid !== undefined) {
          try {
            if (process.platform === 'win32')
              spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).on('error', () => { });
            else
              process.kill(-child.pid, 'SIGTERM');
          } catch {
            // Already exited
          }
        }
        finish(null);
      });
      let resolved = false;
      const finish = (code: number | null, error?: string) => {
        if (resolved)
          return;
        resolved = true;
        cancellation.dispose();
        resolve({
          code,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: error ?? Buffer.concat(stderr).toString('utf8')
        });
      };
      child.on('error', error => finish(null, String(error)));
      child.on('close', code => finish(code));

      // The script can exit without reading all of its input, for a file that doesn't opt in
      child.stdin.on('error', () => { });
      child.stdin.end(input, 'utf8');
    });
  }
}
