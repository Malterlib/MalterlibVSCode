import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
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

export interface FormatResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * The ConfigStore to format with: the selected generator's in the selected workspace folder, or the one with the
 * highest priority, among those with a FormatServer.sh or a FormatFile.sh
 */
export function getFormatGenerator(
  workspaceFolder: vscode.WorkspaceFolder,
  selectedWorkspaceFolder: vscode.WorkspaceFolder | null,
  selectedGenerator: string | null
): GeneratorInfo | undefined {
  return selectGenerator(
    workspaceFolder, selectedWorkspaceFolder, selectedGenerator,
    generator => scriptExists(generator.formatServerScript) || scriptExists(generator.formatFileScript));
}

export function scriptExists(script: string | undefined): script is string {
  return !!script && fs.existsSync(script);
}

function selectGenerator(
  workspaceFolder: vscode.WorkspaceFolder,
  selectedWorkspaceFolder: vscode.WorkspaceFolder | null,
  selectedGenerator: string | null,
  usable: (generator: GeneratorInfo) => boolean
): GeneratorInfo | undefined {
  const generators = BuildSystemScanner.getGenerators(workspaceFolder).filter(usable);
  const selected = selectedWorkspaceFolder?.uri.fsPath === workspaceFolder.uri.fsPath ? selectedGenerator : null;
  return generators.find(generator => generator.name === selected) ?? generators[0];
}

/**
 * Calls the listener when the FormatFile.sh and FormatServer.sh scripts of the workspace's Malterlib projects can
 * have come or gone: when the build systems are scanned again, projects are detected, the workspace folders change, or a
 * script is created or deleted, which the scanner doesn't watch.
 */
/** A pattern that matches only a file, whose name can have characters of glob syntax, which ? matches */
export function singleFilePattern(file: string): vscode.RelativePattern {
  return new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file).replace(/[[\]{}*?]/g, '?'));
}

export function onDidChangeFormatFileScripts(listener: (changedScript: string | undefined) => void): vscode.Disposable {
  const scriptWatchers = new Map<string, vscode.Disposable>();
  // Notifies with the script that was created, deleted or changed, or without one when only which scripts there are can
  // have changed
  const update = (notify: boolean, changedScript?: string) => {
    const scripts = new Set((vscode.workspace.workspaceFolders ?? [])
      .filter(folder => MalterlibProjectDetector.isMalterlibProject(folder))
      .flatMap(folder => BuildSystemScanner.getGenerators(folder))
      .flatMap(generator => [generator.formatFileScript, generator.formatServerScript].flatMap(script => script ?? [])));
    for (const [script, watcher] of scriptWatchers) {
      if (!scripts.has(script)) {
        watcher.dispose();
        scriptWatchers.delete(script);
      }
    }
    for (const script of scripts) {
      if (scriptWatchers.has(script))
        continue;
      const watcher = vscode.workspace.createFileSystemWatcher(singleFilePattern(script));
      scriptWatchers.set(script, vscode.Disposable.from(
        watcher,
        watcher.onDidCreate(() => update(true, script)),
        watcher.onDidChange(() => update(true, script)),
        watcher.onDidDelete(() => update(true, script))));
    }
    if (notify)
      listener(changedScript);
  };
  update(false);
  return vscode.Disposable.from(
    BuildSystemScanner.onDidChangeScanningAsync(() => update(true)),
    MalterlibProjectDetector.onDidChangeDetectionAsync(() => update(true)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => update(true)),
    { dispose: () => scriptWatchers.forEach(watcher => watcher.dispose()) }
  );
}

/**
 * Runs the ConfigStore's FormatFile.sh <File> [<Offset> <Length>], which reads the source from stdin and writes it
 * formatted to stdout, with the selection's offset and length in UTF-8 bytes. It exits with 0 when it wrote the source,
 * 1 when it did but some violations have no automatic fix, and 3 when the file doesn't opt in to formatting.
 * Cancelling stops the script and the formatter it runs, and resolves with a null code.
 */
export function runFormatFileScript(generator: GeneratorInfo, workspaceFolder: vscode.WorkspaceFolder, args: string[], input: string, token: vscode.CancellationToken): Promise<FormatResult> {
  return runConfigStoreScript(generator.formatFileScript!, generator, workspaceFolder, args, input, token);
}

/**
 * Starts a script of the ConfigStore with the working directory and environment of its scripts. On Windows they run in
 * Git Bash, like the tasks. Elsewhere the script gets its own process group, so stopping it can stop what it runs too.
 */
export function spawnConfigStoreScript(script: string, generator: GeneratorInfo, workspaceFolder: vscode.WorkspaceFolder, args: string[]): ChildProcessWithoutNullStreams {
  const cwd = generator.buildSystemBasePath || workspaceFolder.uri.fsPath;
  const env = { ...process.env, MalterlibWorkspaceRoot: cwd };
  return process.platform === 'win32'
    ? spawn(findGitBash(), [vscode.Uri.file(script).path.replace(/^\/([a-z]):/, '/$1'), ...args], { cwd, env })
    : spawn(script, args, { cwd, env, detached: true });
}

/** Stops a script of the ConfigStore and the processes it runs */
export function stopConfigStoreScript(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined)
    return;
  try {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).on('error', () => { });
    else
      process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already exited
  }
}

/**
 * Runs a script of the ConfigStore that reads its input from stdin and writes its result to stdout, such as
 * FormatFile.sh. Cancelling stops the script and what it runs, and resolves with a null code.
 */
export function runConfigStoreScript(
  script: string,
  generator: GeneratorInfo,
  workspaceFolder: vscode.WorkspaceFolder,
  args: string[],
  input: string,
  token: vscode.CancellationToken
): Promise<FormatResult> {
  return new Promise(resolve => {
    const child = spawnConfigStoreScript(script, generator, workspaceFolder, args);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (data: Buffer) => stdout.push(data));
    child.stderr.on('data', (data: Buffer) => stderr.push(data));

    // The processes the script runs keep its output open, so don't wait for them to exit
    const cancellation = token.onCancellationRequested(() => {
      stopConfigStoreScript(child);
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
