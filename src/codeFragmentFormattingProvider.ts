import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildEditorConfig,
  buildFragmentRequests,
  buildFragmentSource,
  buildStyleDocument,
  extractFormattedFragments,
  findStyleDocument,
  fitsColumns,
  FragmentLayoutOptions,
  parseFragmentAnswers,
  PreparedFragment,
  prepareFragment
} from './codeFragmentLayout';
import { GeneratorInfo } from './buildSystemScanner';
import { getFormatGenerator, onDidChangeFormatFileScripts, runFormatFileScript, scriptExists, singleFilePattern } from './formatFileScript';
import { FormatServers } from './formatServer';
import { MalterlibProjectDetector } from './malterlibProject';

/**
 * Lays out the code fragments Unbroken Code shows outside editors, such as the types in compiler messages and the
 * debugger's variables, with MTool Format for Malterlib.
 *
 * The ConfigStore's format server, FormatServer.sh, which runs MTool Format --server and is kept running, takes the
 * fragments of a request as they are and reads the style of the directory they come from.
 *
 * A ConfigStore without the script, or whose MTool has no --server yet, lays them out with FormatFile.sh: the fragments
 * are wrapped in code that parses, written as one source to format, and taken out of the formatted source again. The
 * source's settings come from an .editorconfig and a .malterlib-format in a temporary directory, one per style and
 * options, which extends the style of the directory the fragments come from.
 */
export class MalterlibCodeFragmentFormattingProvider implements vscode.CodeFragmentFormattingProvider, vscode.Disposable {
  // C++ only: the wrappers are C++, and the C++ profile would write C code in its style, such as with trailing return types
  private static readonly languages = ['cpp', 'objective-cpp'];
  private static readonly maxCacheEntries = 2000;
  // The width fragments that fit are formatted with, which no fragment's line comes near
  private static readonly unlimitedColumns = 100_000;

  // By style path, options and fragment
  private readonly cache = new Map<string, string | undefined>();
  private temporaryRoot: string | undefined;
  private readonly settingsDirectories = new Map<string, Promise<string>>();
  private settingsDirectoryCount = 0;
  private reportedFailure = false;
  // Changes when styles change, so layouts by the styles before aren't remembered
  private generation = 0;
  // The style files the workspace's watcher doesn't see, by their paths, and the directories and styles watched for
  private readonly styleWatchers = new Map<string, vscode.Disposable>();
  private readonly watchedStyles = new Set<string>();
  private readonly onDidChangeExternalStyle = new vscode.EventEmitter<void>();
  constructor(
    private getSelectedGenerator: () => string | null,
    private getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private onDidChangeSelection: vscode.Event<unknown>,
    private servers: FormatServers,
    private output: vscode.OutputChannel
  ) { }

  /**
   * Register the provider while a workspace folder is a Malterlib project. The fragments can come from files outside
   * the workspace, such as system headers, so it takes any document of the languages.
   */
  register(): vscode.Disposable {
    const registerProvider = vscode.languages.registerCodeFragmentFormattingProvider;
    if (!registerProvider)
      return this;

    // Registered while a Malterlib folder has a script to lay fragments out with, and again when the folders that have
    // one change, which makes the editor forget the fragments it was told to leave as they are
    let registration: vscode.Disposable | undefined;
    let registeredFolders: string | undefined;
    const update = () => {
      const selectedWorkspaceFolder = this.getSelectedWorkspaceFolder();
      const formatters = (vscode.workspace.workspaceFolders ?? [])
        .filter(folder => MalterlibProjectDetector.isMalterlibProject(folder))
        .flatMap(folder => {
          const generator = getFormatGenerator(folder, selectedWorkspaceFolder, this.getSelectedGenerator());
          if (!generator)
            return [];
          const scripts = [generator.formatFileScript, generator.formatServerScript].map(script => scriptExists(script) ? script : '');
          return [`${folder.uri.toString()}\t${scripts.join('\t')}`];
        });
      // The scripts each folder's fragments are laid out with: another one, such as of another ConfigStore selected,
      // registers again, which makes the editor forget the layouts of the one before
      // And the selected folder, whose formatter lays out files outside the workspace folders
      const key = [selectedWorkspaceFolder?.uri.toString() ?? '', ...formatters].join('\n');
      if (key === registeredFolders)
        return;
      registeredFolders = key;
      // Another formatter, or one created again where one was, can lay out differently
      this.cache.clear();
      ++this.generation;
      registration?.dispose();
      registration = formatters.length
        ? registerProvider(MalterlibCodeFragmentFormattingProvider.languages.map(language => ({ language, scheme: '*' })), this)
        : undefined;
    };
    // A script created again or changed where one was can lay out differently, so it registers again
    const scripts = vscode.Disposable.from(
      onDidChangeFormatFileScripts(changedScript => {
        if (changedScript !== undefined)
          registeredFolders = undefined;
        update();
      }),
      this.onDidChangeSelection(() => update()));
    update();

    // Fragments are laid out by the style of where they're from, so an edited style forgets the layouts here and, by
    // registering again, in the editor
    const styles = vscode.workspace.createFileSystemWatcher('**/.malterlib-format');
    const onDidChangeStyle = () => {
      this.cache.clear();
      ++this.generation;
      // A style can extend another one now, which is watched once the style is used again
      this.disposeStyleWatchers();
      registeredFolders = undefined;
      update();
    };
    return vscode.Disposable.from(
      scripts,
      styles,
      styles.onDidChange(onDidChangeStyle),
      styles.onDidCreate(onDidChangeStyle),
      styles.onDidDelete(onDidChangeStyle),
      this.onDidChangeExternalStyle.event(onDidChangeStyle),
      // The editor remembers the layouts it is given, so those without a format server that failed are asked for again
      // once it is tried again, by registering again
      this.servers.onDidRetry(() => {
        registeredFolders = undefined;
        update();
      }),
      { dispose: () => registration?.dispose() },
      this
    );
  }

  dispose(): void {
    if (this.temporaryRoot)
      fs.rmSync(this.temporaryRoot, { recursive: true, force: true });
    this.temporaryRoot = undefined;
    this.settingsDirectories.clear();
    this.disposeStyleWatchers();
    this.onDidChangeExternalStyle.dispose();
  }

  private disposeStyleWatchers() {
    for (const watcher of this.styleWatchers.values())
      watcher.dispose();
    this.styleWatchers.clear();
    this.watchedStyles.clear();
  }

  /**
   * Watches the style of a directory, the styles it extends, and where a nearer .malterlib-format can be created, which
   * the workspace's watcher doesn't see outside the workspace folders, of other names, or where it's excluded
   */
  private watchStyles(directory: string, stylePath: string | undefined) {
    const key = `${directory}\n${stylePath ?? ''}`;
    if (this.watchedStyles.has(key))
      return;
    this.watchedStyles.add(key);

    // Where findStyleDocument looks, in its order, up to the style it found: .malterlib-format in the directory and those
    // above it, and then Malterlib/Core/.malterlib-format in them
    candidates:
    for (const name of ['.malterlib-format', path.join('Malterlib', 'Core', '.malterlib-format')]) {
      for (let current = path.resolve(directory); ; current = path.dirname(current)) {
        const candidate = path.join(current, name);
        if (candidate === stylePath)
          break candidates;
        this.watchStyleFile(candidate);
        if (path.dirname(current) === current)
          break;
      }
    }

    const visited = new Set<string>();
    for (; stylePath && visited.size < 16 && !visited.has(stylePath);) {
      visited.add(stylePath);
      this.watchStyleFile(stylePath);
      let extended: string | undefined;
      try {
        // A YAML scalar, single quoted, double quoted or plain, which a comment can follow
        const value = /^Extends:[ \t]*(.*)$/m.exec(fs.readFileSync(stylePath, 'utf8'))?.[1] ?? '';
        extended = value.startsWith('\'')
          ? /^'((?:[^']|'')*)'/.exec(value)?.[1].replace(/''/g, '\'')
          : value.startsWith('"')
            ? /^"([^"]*)"/.exec(value)?.[1]
            : value.replace(/(?:^|[ \t])#.*$/, '').trim() || undefined;
      } catch {
        extended = undefined;
      }
      stylePath = extended ? path.resolve(path.dirname(stylePath), extended) : undefined;
    }
  }

  private watchStyleFile(file: string) {
    if (this.styleWatchers.has(file))
      return;
    // Also in the workspace, where the workspace's watcher doesn't see what files.watcherExclude excludes, while one of
    // a file does
    const watcher = vscode.workspace.createFileSystemWatcher(singleFilePattern(file));
    const changed = () => this.onDidChangeExternalStyle.fire();
    this.styleWatchers.set(file, vscode.Disposable.from(watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed)));
  }


  provideCodeFragmentFormatting(
    context: vscode.CodeFragmentFormattingContext,
    fragments: readonly string[],
    options: vscode.CodeFragmentFormattingOptions,
    token: vscode.CancellationToken
  ): Promise<(string | undefined)[] | undefined> {
    return this.layOut(context, fragments, options, token, true);
  }

  /** The fragments laid out by the format server, if it is to be used and the ConfigStore has one that works, or with FormatFile.sh */
  private async layOut(
    context: vscode.CodeFragmentFormattingContext,
    fragments: readonly string[],
    options: vscode.CodeFragmentFormattingOptions,
    token: vscode.CancellationToken,
    useServer: boolean
  ): Promise<(string | undefined)[] | undefined> {
    const results: (string | undefined)[] = fragments.map(() => undefined);
    const layoutOptions: FragmentLayoutOptions = { maxColumns: options.maxColumns, tabSize: options.tabSize, insertSpaces: options.insertSpaces };
    // A name, such as of a variable, is written the same by the formatter, so needs none
    const indices = fragments.map((_, index) => index).filter(index => !/^[\w$:~]*$/.test(fragments[index].trim()));
    if (!indices.length)
      return results;

    const source = this.findGenerator(context.uri);
    if (!source)
      return results;

    const directory = context.uri.scheme === 'file' ? path.dirname(context.uri.fsPath) : source.workspaceFolder.uri.fsPath;
    const stylePath = findStyleDocument(directory);
    this.watchStyles(directory, stylePath);
    const generation = this.generation;
    // A fragment with a NUL character can't be given to a format server
    useServer &&= !indices.some(index => fragments[index].includes('\0'));
    const serverScript = useServer && this.servers.isUsable(source.generator.formatServerScript) ? source.generator.formatServerScript : undefined;
    const keyPrefix = JSON.stringify(
      [serverScript ?? source.generator.formatFileScript ?? '', stylePath ?? '', layoutOptions.maxColumns, layoutOptions.tabSize, layoutOptions.insertSpaces]);

    const pending: { index: number; key: string; fragment: PreparedFragment; fits: boolean }[] = [];
    for (const index of indices) {
      const key = `${keyPrefix}\n${fragments[index]}`;
      if (this.cache.has(key)) {
        results[index] = this.cache.get(key);
        continue;
      }
      const fragment = prepareFragment(fragments[index]);
      if (fragment)
        pending.push({ index, key, fragment, fits: fitsColumns(fragments[index], layoutOptions) });
      else
        this.remember(key, undefined);
    }
    if (!pending.length)
      return results;

    const finish = (texts: ReadonlyMap<number, string | undefined>) => {
      pending.forEach(entry => {
        // Written as it already is, it's left as it is
        const text = texts.get(entry.index);
        const value = text === fragments[entry.index] ? undefined : text;
        results[entry.index] = value;
        if (generation === this.generation)
          this.remember(entry.key, value);
      });
      return results;
    };

    if (serverScript) {
      // A request that is cancelled is still answered, and a script that fails it has failed all the same
      const answers = await this.servers.request(serverScript, source.generator, source.workspaceFolder, buildFragmentRequests(pending.map(entry => entry.fragment), layoutOptions, directory));
      const laidOut = answers && parseFragmentAnswers(answers, pending.map(entry => entry.fragment));
      if (answers && !laidOut)
        this.servers.fail(serverScript, 'It answered fragments with neither a text nor an error');
      // No answer either when the provider registered again meanwhile, as its scripts changed: the editor asks again
      if (token.isCancellationRequested || (!laidOut && generation !== this.generation))
        return undefined;
      if (laidOut)
        return finish(new Map(pending.map((entry, i) => [entry.index, laidOut[i]])));
      // The server failed, so they are laid out the way an MTool without --server lays them out, which isn't remembered
      // under the server's key
      return this.layOut(context, fragments, options, token, false);
    }

    // A ConfigStore with only a FormatServer.sh, which failed, has nothing to lay them out with for now
    if (!scriptExists(source.generator.formatFileScript))
      return results;

    // A fragment that fits is written as the formatter writes code, on one line, which it would split within the width
    // left beside a wrapper on the same line, so it is formatted without a width. One that doesn't fit is laid out within
    // the width.
    const batches = [
      { entries: pending.filter(entry => entry.fits), options: { ...layoutOptions, maxColumns: MalterlibCodeFragmentFormattingProvider.unlimitedColumns } },
      { entries: pending.filter(entry => !entry.fits), options: layoutOptions },
    ].filter(batch => batch.entries.length);
    const formatted = await Promise.all(batches.map(batch => this.formatBatch(source, stylePath, batch.entries.map(entry => entry.fragment), batch.options, token)));
    // No answer, which the editor asks for again, such as once MTool is built, unlike fragments left as they are
    if (token.isCancellationRequested || formatted.some(texts => !texts))
      return undefined;
    const texts = new Map<number, string | undefined>();
    batches.forEach((batch, batchIndex) => batch.entries.forEach((entry, i) => texts.set(entry.index, formatted[batchIndex]![i])));

    // A fragment that fit can be wider once written with the spaces the formatter writes, and is then laid out within
    // the width after all
    const widened = pending.filter(entry => entry.fits && !fitsColumns(texts.get(entry.index) ?? '', layoutOptions));
    if (widened.length) {
      const laidOut = await this.formatBatch(source, stylePath, widened.map(entry => entry.fragment), layoutOptions, token);
      if (token.isCancellationRequested || !laidOut)
        return undefined;
      widened.forEach((entry, i) => texts.set(entry.index, laidOut[i]));
    }

    return finish(texts);
  }

  /** The fragments formatted, or undefined when formatting failed, which is reported */
  private async formatBatch(
    source: { generator: GeneratorInfo; workspaceFolder: vscode.WorkspaceFolder },
    stylePath: string | undefined,
    fragments: readonly PreparedFragment[],
    options: FragmentLayoutOptions,
    token: vscode.CancellationToken
  ): Promise<(string | undefined)[] | undefined> {
    let settingsDirectory: string;
    try {
      settingsDirectory = await this.getSettingsDirectory(stylePath, options);
    } catch (error) {
      this.output.appendLine(`Writing the settings to lay out code fragments with failed: ${error}`);
      return undefined;
    }
    if (token.isCancellationRequested)
      return undefined;

    const result = await runFormatFileScript(
      source.generator, source.workspaceFolder, [path.join(settingsDirectory, 'Fragments.cpp')], buildFragmentSource(fragments, options), token);
    if (token.isCancellationRequested)
      return undefined;

    // Exit code 1 is written with violations that have no automatic fix, such as a name longer than the width
    if (result.code !== 0 && result.code !== 1) {
      // Once per session, as the workbench asks again for each message
      if (!this.reportedFailure) {
        this.reportedFailure = true;
        this.output.appendLine(`Laying out code fragments failed${result.code !== null ? ` with exit code ${result.code}` : ''}:`);
        this.output.appendLine(result.stderr.trimEnd());
      }
      return undefined;
    }
    return extractFormattedFragments(result.stdout, fragments, options);
  }

  private remember(key: string, value: string | undefined) {
    if (this.cache.size >= MalterlibCodeFragmentFormattingProvider.maxCacheEntries)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, value);
  }

  /**
   * The ConfigStore whose scripts lay out the fragments: that of the workspace folder of the document they come from,
   * or for a document outside the Malterlib folders, the selected folder's, or the first folder's that has one.
   */
  private findGenerator(uri: vscode.Uri): { generator: GeneratorInfo; workspaceFolder: vscode.WorkspaceFolder } | undefined {
    const selectedWorkspaceFolder = this.getSelectedWorkspaceFolder();
    const candidates = [vscode.workspace.getWorkspaceFolder(uri), selectedWorkspaceFolder, ...vscode.workspace.workspaceFolders ?? []];
    for (const workspaceFolder of candidates) {
      if (!workspaceFolder || !MalterlibProjectDetector.isMalterlibProject(workspaceFolder))
        continue;
      const generator = getFormatGenerator(workspaceFolder, selectedWorkspaceFolder, this.getSelectedGenerator());
      if (generator)
        return { generator, workspaceFolder };
    }
    return undefined;
  }

  /**
   * The temporary directory whose .editorconfig and .malterlib-format hold the style and options. MTool Format reads
   * the settings of the source it formats from the directory the source's path names.
   */
  private getSettingsDirectory(stylePath: string | undefined, options: FragmentLayoutOptions): Promise<string> {
    const key = JSON.stringify([stylePath ?? '', options.maxColumns, options.tabSize, options.insertSpaces]);
    let directory = this.settingsDirectories.get(key);
    if (!directory) {
      this.temporaryRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'malterlib-fragments-'));
      const settingsDirectory = path.join(this.temporaryRoot, String(this.settingsDirectoryCount++));
      directory = (async () => {
        await fs.promises.mkdir(settingsDirectory, { recursive: true });
        await fs.promises.writeFile(path.join(settingsDirectory, '.editorconfig'), buildEditorConfig(options));
        await fs.promises.writeFile(path.join(settingsDirectory, '.malterlib-format'), buildStyleDocument(stylePath));
        return settingsDirectory;
      })();
      // Written again on the next request if it failed
      directory.catch(() => this.settingsDirectories.delete(key));
      this.settingsDirectories.set(key, directory);
    }
    return directory;
  }
}
