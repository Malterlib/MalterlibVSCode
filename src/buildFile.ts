import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { BuildSystemScanner, WorkspaceInfo } from './buildSystemScanner';
import { MalterlibTaskProvider } from './malterlibTaskProvider';

/**
 * An object file that a target of the selected workspace compiles, from the target's compile_commands.json
 */
interface CompiledSource {
  targetName: string;
  file: string;
  object: string;
  // The object as a Ninja target: as spelled in the compile commands when absolute, and otherwise relative to the
  // directory Ninja runs in, as Ninja only knows its outputs by their spelling in the ninjaFile, see getNinjaTarget
  ninjaTarget: string;
}

interface CompiledSources {
  // By the keys of the source file as spelled and with its symbolic links resolved, see getCanonicalKey
  byFile: Map<string, CompiledSource[]>;
  // By the key of the object file, see getCanonicalKey
  byObject: Map<string, CompiledSource[]>;
  realPaths: Map<string, Promise<string>>;
}

// Files that are compiled rather than included, which only build when a configuration compiles them
const sourceExtensions = /\.(c|cc|cpp|cxx|c\+\+|m|mm)$/i;

/**
 * Expand the variable references and escapes in a Ninja value: $name, ${name}, $$, $  and $:
 */
function expandNinjaVariables(value: string, variables: Map<string, string>): string {
  return value.replace(/\$(?:([$: ])|\{([A-Za-z0-9_.-]+)\}|([A-Za-z0-9_-]+))/g,
    (_, escaped: string | undefined, braced: string | undefined, plain: string | undefined) =>
      escaped ?? variables.get((braced ?? plain)!) ?? '');
}

function getPathKey(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === 'linux' ? normalized : normalized.toLowerCase();
}

/**
 * The real path of a file, or of a file that doesn't exist yet in its directory, such as an object that isn't built
 */
function getRealPath(filePath: string, realPaths: Map<string, Promise<string>>): Promise<string> {
  let realPath = realPaths.get(filePath);
  if (!realPath) {
    const directory = path.dirname(filePath);
    realPath = fsp.realpath(filePath).catch(async () =>
      directory === filePath ? filePath : path.join(await getRealPath(directory, realPaths), path.basename(filePath)));
    realPaths.set(filePath, realPath);
  }
  return realPath;
}

/**
 * The key of a path with its symbolic links resolved, as the compile commands and the deps log can name a file through a
 * link and the editor through its real path, or the other way around
 */
async function getCanonicalKey(filePath: string, realPaths: Map<string, Promise<string>>): Promise<string> {
  return getPathKey(await getRealPath(path.resolve(filePath), realPaths));
}

/**
 * Builds the object file of the active document, in a workspace configuration that names the build.ninja that builds it
 * (ninjaFile in its ConfigStore JSON). A source file builds its own object. A header,
 * or a source file the selected configuration doesn't compile, builds the object of a source file that includes it
 * according to Ninja's deps log: the source file used most recently, then one open in the editor, then one of the
 * selected target.
 */
export class BuildFileCommand implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  // Path key of a document to when its editor was last active
  private lastActive = new Map<string, number>();
  private activeCount = 0;

  /**
   * @param initialSelection Settles once the initial scans have restored or auto-selected the selection
   */
  constructor(
    private initialSelection: Promise<void>,
    private getSelectionSnapshot: () => { generator: string | null; workspace: string | null; configuration: string | null; target: string | null },
    private getSelectedWorkspaceFolder: () => vscode.WorkspaceFolder | null,
    private taskProvider: MalterlibTaskProvider,
    private output: vscode.OutputChannel
  ) {
    this.onDidActivate(vscode.window.activeTextEditor);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => this.onDidActivate(editor)),
      vscode.commands.registerCommand('malterlib.buildCurrentFile', () => this.buildCurrentFile())
    );
  }

  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }

  private onDidActivate(editor: vscode.TextEditor | undefined): void {
    if (editor?.document.uri.scheme === 'file')
      this.lastActive.set(getPathKey(editor.document.uri.fsPath), ++this.activeCount);
  }

  private async buildCurrentFile(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.uri.scheme !== 'file') {
      vscode.window.showWarningMessage('Open the file to build first.');
      return;
    }

    // The command can activate the extension, or run while it scans
    await this.initialSelection;
    const workspaceFolder = this.getSelectedWorkspaceFolder();
    const selection = this.getSelectionSnapshot();
    if (!workspaceFolder || !selection.generator || !selection.workspace || !selection.configuration) {
      vscode.window.showWarningMessage('Please select generator, workspace, and configuration first.');
      return;
    }

    const generator = BuildSystemScanner.getGenerators(workspaceFolder).find(candidate => candidate.name === selection.generator);
    const workspace = generator && BuildSystemScanner.getWorkspaces(generator.path).find(candidate => candidate.name === selection.workspace);
    const workspaceConfig = workspace && BuildSystemScanner.getWorkspaceConfiguration(workspace.path, selection.configuration);
    if (!generator || !workspace || !workspaceConfig)
      return;

    const ninjaFile = workspaceConfig.ninjaFile;
    if (!ninjaFile) {
      vscode.window.showWarningMessage(`Building a single file needs a build.ninja, and ${workspace.name} ${selection.configuration} doesn't name one.`);
      return;
    }

    const fileName = path.basename(document.uri.fsPath);
    const documentKeys = await this.getDocumentKeys(document.uri.fsPath);
    const sources = await this.readCompiledSources(workspace, selection.configuration, path.dirname(ninjaFile));

    let compiled = await this.pick(documentKeys.flatMap(key => sources.byFile.get(key) ?? []), selection.target, sources.realPaths);
    if (!compiled) {
      // A header, or a file the configuration doesn't compile: the objects that include it
      let objects: string[] = [];
      let bNothingBuilt = false;
      try {
        objects = await this.findIncludingObjects(ninjaFile, new Set(documentKeys), sources.realPaths);
      } catch (error) {
        // Ninja writes the deps log with the first build
        bNothingBuilt = (error as NodeJS.ErrnoException).code === 'ENOENT';
        if (!bNothingBuilt)
          this.output.appendLine(`Build File: Could not read the Ninja deps log of ${ninjaFile}: ${error}`);
      }

      const objectKeys = await Promise.all(objects.map(object => getCanonicalKey(object, sources.realPaths)));
      const candidates = objectKeys.flatMap(key => sources.byObject.get(key) ?? []);
      compiled = await this.pick(candidates, selection.target, sources.realPaths);
      if (!compiled) {
        const configurationName = `${workspace.name} ${selection.configuration}`;
        if (sourceExtensions.test(fileName))
          vscode.window.showWarningMessage(`${fileName} isn't compiled in ${configurationName}.`);
        else if (bNothingBuilt)
          vscode.window.showWarningMessage(`Nothing has been built in ${configurationName} yet, so it isn't known which source file includes ${fileName}. Build the workspace or a source file that includes it first.`);
        else
          vscode.window.showWarningMessage(`No source file built so far in ${configurationName} includes ${fileName}. Build one that includes it first.`);
        return;
      }

      this.output.appendLine(`Build File: Building ${path.basename(compiled.file)} of ${compiled.targetName}, which includes ${fileName}`);
    }

    const task = this.taskProvider.createBuildFileTask(
      workspaceFolder,
      { generator: generator.name, workspace: workspace.name, configuration: selection.configuration },
      compiled.targetName,
      compiled.ninjaTarget,
      document.uri.fsPath
    );
    if (!task) {
      vscode.window.showWarningMessage(`${fileName} can't be built with ${generator.label}.`);
      return;
    }

    await vscode.tasks.executeTask(task);
  }

  /**
   * The keys of a document's path as opened and with symbolic links resolved, as the compile commands and the deps log
   * can use either
   */
  private async getDocumentKeys(filePath: string): Promise<string[]> {
    const keys = [getPathKey(filePath)];
    try {
      const realKey = getPathKey(await fsp.realpath(filePath));
      if (realKey !== keys[0])
        keys.push(realKey);
    } catch {
      // A document that isn't saved yet
    }
    return keys;
  }

  /**
   * Pick the source to build: the most recently active source file, then one open in the editor, then one of the
   * selected target, then the first
   */
  private async pick(candidates: CompiledSource[], selectedTarget: string | null, realPaths: Map<string, Promise<string>>): Promise<CompiledSource | undefined> {
    if (candidates.length <= 1)
      return candidates[0];

    // The editors and the compile commands can spell a path through different links
    const canonical = (filePath: string) => getCanonicalKey(filePath, realPaths);
    const recency = new Map<string, number>();
    await Promise.all([...this.lastActive].map(async ([key, order]) => {
      const canonicalKey = await canonical(key);
      recency.set(canonicalKey, Math.max(recency.get(canonicalKey) ?? 0, order));
    }));
    const openPaths = vscode.window.tabGroups.all.flatMap(group => group.tabs)
      .flatMap(tab => tab.input instanceof vscode.TabInputText ? [tab.input.uri.fsPath] : []);
    const openKeys = new Set(await Promise.all(openPaths.map(canonical)));

    const ranked = await Promise.all(candidates.map(async candidate => {
      const key = await canonical(candidate.file);
      return { candidate, rank: [recency.get(key) ?? 0, openKeys.has(key) ? 1 : 0, candidate.targetName === selectedTarget ? 1 : 0] };
    }));
    return ranked
      .reduce((best, current) => {
        for (let i = 0; i < best.rank.length; i++) {
          if (current.rank[i] !== best.rank[i])
            return current.rank[i] > best.rank[i] ? current : best;
        }
        return best;
      })
      .candidate;
  }

  /**
   * Read the compile commands of the workspace's targets in a configuration, built by Ninja in ninjaDirectory
   */
  private async readCompiledSources(workspace: WorkspaceInfo, configurationName: string, ninjaDirectory: string): Promise<CompiledSources> {
    const sources: CompiledSources = { byFile: new Map(), byObject: new Map(), realPaths: new Map() };
    const realNinjaDirectory = await getRealPath(path.resolve(ninjaDirectory), sources.realPaths);
    for (const target of BuildSystemScanner.getTargets(workspace.path)) {
      const compileCommandsPath = target.configurations?.get(configurationName)?.compileCommands;
      if (!compileCommandsPath)
        continue;

      let entries: { directory: string; file: string; output?: string }[];
      try {
        entries = JSON.parse(await fsp.readFile(compileCommandsPath, 'utf8'));
      } catch {
        continue; // Not generated yet
      }

      const compiled = await Promise.all(entries.filter(entry => entry.output).map(async entry => {
        const object = path.resolve(entry.directory, entry.output!);
        const source: CompiledSource = {
          targetName: target.name,
          file: path.resolve(entry.directory, entry.file),
          object,
          ninjaTarget: await this.getNinjaTarget(entry.directory, entry.output!, ninjaDirectory, realNinjaDirectory, sources.realPaths)
        };
        const [fileKey, objectKey] = await Promise.all([source.file, source.object].map(filePath => getCanonicalKey(filePath, sources.realPaths)));
        return { source, fileKey, objectKey };
      }));
      for (const { source, fileKey, objectKey } of compiled) {
        for (const key of new Set([getPathKey(source.file), fileKey]))
          sources.byFile.set(key, [...(sources.byFile.get(key) ?? []), source]);
        sources.byObject.set(objectKey, [...(sources.byObject.get(objectKey) ?? []), source]);
      }
    }
    return sources;
  }

  /**
   * The Ninja target of a compile command's output: an absolute one as is, and a relative one relative to the directory
   * Ninja runs in, from the compile command's directory. Either can be named through links, while the output's
   * spelling within the build is the target's, so it's relative to the closest directory of the compile command's that
   * is Ninja's directory, of its directory as named, or else with its links resolved, as when it's a link into the
   * build.
   */
  private async getNinjaTarget(directory: string, output: string, ninjaDirectory: string, realNinjaDirectory: string, realPaths: Map<string, Promise<string>>): Promise<string> {
    if (path.isAbsolute(output))
      return output;
    const resolvedDirectory = path.resolve(directory);
    for (const start of [resolvedDirectory, await getRealPath(resolvedDirectory, realPaths)]) {
      for (let ancestor = start; ; ancestor = path.dirname(ancestor)) {
        if (await getRealPath(ancestor, realPaths) === realNinjaDirectory)
          return path.relative(ancestor, path.resolve(start, output));
        if (path.dirname(ancestor) === ancestor)
          break;
      }
    }
    return path.relative(ninjaDirectory, path.resolve(resolvedDirectory, output));
  }

  /**
   * Find the outputs whose recorded dependencies include a file, in the .ninja_deps of a build.ninja's builddir, as
   * absolute paths. Ninja's relative paths are relative to the directory it runs in, the build.ninja's. The log is a sequence of records, each a uint32 size with the high bit set for a dependency record. A
   * path record is the path padded with NULs to four bytes followed by a checksum, and its index is its id. A
   * dependency record is the output's id, an 8 byte mtime and the ids of the inputs; a later record for an output
   * replaces an earlier one.
   */
  private async findIncludingObjects(ninjaFile: string, fileKeys: Set<string>, realPaths: Map<string, Promise<string>>): Promise<string[]> {
    const ninjaDirectory = path.dirname(ninjaFile);
    const depsPath = path.join(await this.getNinjaBuildDirectory(ninjaFile), '.ninja_deps');
    const runDirectory = await fsp.realpath(ninjaDirectory).catch(() => ninjaDirectory);
    const data = await fsp.readFile(depsPath);
    if (data.length < 16 || data.toString('latin1', 0, 12) !== '# ninjadeps\n' || data.readUInt32LE(12) !== 4)
      throw new Error(`${depsPath} isn't a version 4 Ninja deps log`);

    const paths: string[] = [];
    const fileIds = new Set<number>();
    // Paths with the file's name, which can name it through a linked directory
    const fileNames = new Set([...fileKeys].map(key => path.basename(key)));
    const candidateIds = new Set<number>();
    const dependencies = new Map<number, Set<number>>();
    for (let position = 16; position + 4 <= data.length;) {
      const header = data.readUInt32LE(position);
      const size = header & 0x7fffffff;
      position += 4;
      if (position + size > data.length)
        break; // A record cut short by an interrupted build

      if (header >>> 31) {
        const ids = new Set<number>();
        for (let idPosition = position + 12; idPosition + 4 <= position + size; idPosition += 4)
          ids.add(data.readInt32LE(idPosition));
        dependencies.set(data.readInt32LE(position), ids);
      } else {
        let end = position + size - 4;
        while (end > position && data[end - 1] === 0)
          end--;
        const recordPath = path.resolve(runDirectory, data.toString('utf8', position, end));
        const recordKey = getPathKey(recordPath);
        if (fileKeys.has(recordKey))
          fileIds.add(paths.length);
        else if (fileNames.has(path.basename(recordKey)))
          candidateIds.add(paths.length);
        paths.push(recordPath);
      }
      position += size;
    }

    const matchIds = async (ids: number[], isCandidate: (recordPath: string) => Promise<boolean>) => {
      // In batches, as a deps log can name hundreds of thousands of files
      for (let start = 0; start < ids.length; start += 256) {
        await Promise.all(ids.slice(start, start + 256).map(async id => {
          if (await isCandidate(paths[id]) && fileKeys.has(await getCanonicalKey(paths[id], realPaths)))
            fileIds.add(id);
        }));
      }
    };
    await matchIds([...candidateIds], async () => true);
    // A path with another name only names the file if it's a link itself. Those are only looked for when no other path
    // names the file, as checking every path takes a while.
    if (!fileIds.size) {
      await matchIds(paths.map((_, id) => id).filter(id => !candidateIds.has(id)),
        async recordPath => !!(await fsp.lstat(recordPath).catch(() => undefined))?.isSymbolicLink());
    }

    const objects: string[] = [];
    for (const [outputId, ids] of dependencies) {
      if ([...fileIds].some(id => ids.has(id)) && paths[outputId] !== undefined)
        objects.push(paths[outputId]);
    }
    return objects;
  }

  /**
   * The directory Ninja keeps its logs in: the builddir of a build.ninja, its last top-level binding, which can also be
   * in a file it includes, as included files share its bindings. A binding can refer to the variables bound before it,
   * such as `builddir = $outdir`. The paths of builddir and included files are relative to the directory Ninja runs in,
   * the build.ninja's.
   */
  private async getNinjaBuildDirectory(ninjaFile: string): Promise<string> {
    const ninjaDirectory = path.dirname(ninjaFile);
    const variables = new Map<string, string>();
    const including = new Set<string>();
    const readBindings = async (file: string): Promise<void> => {
      // A line that ends with an unescaped $ continues on the next, without its leading whitespace
      const text = (await fsp.readFile(file, 'utf8')).replace(/(?<!\$)((?:\$\$)*)\$\r?\n[ \t]*/g, '$1');
      for (const line of text.split(/\r?\n/)) {
        // Top-level statements are unindented, while indented bindings belong to a rule or build statement
        const include = /^include[ \t]+(.*)$/.exec(line);
        if (include) {
          const includePath = path.resolve(ninjaDirectory, expandNinjaVariables(include[1].trimEnd(), variables));
          if (including.has(includePath))
            continue;
          including.add(includePath);
          // Ninja fails to load a build.ninja that includes a file it can't read
          await readBindings(includePath).catch(() => undefined);
          including.delete(includePath);
          continue;
        }
        const binding = /^([A-Za-z0-9_.-]+)[ \t]*=[ \t]*(.*)$/.exec(line);
        if (binding)
          variables.set(binding[1], expandNinjaVariables(binding[2].trimEnd(), variables));
      }
    };
    await readBindings(ninjaFile);
    const buildDirectory = variables.get('builddir');
    return buildDirectory ? path.resolve(ninjaDirectory, buildDirectory) : ninjaDirectory;
  }
}
