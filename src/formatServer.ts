import * as fs from 'fs';
import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { GeneratorInfo } from './buildSystemScanner';
import { onDidChangeFormatFileScripts, scriptExists, spawnConfigStoreScript, stopConfigStoreScript } from './formatFileScript';

/** A request to a format server: a JSON object, which the server answers with one */
export type FormatRequest = Record<string, unknown>;
export type FormatAnswer = Record<string, unknown>;

/**
 * The text as it is written in UTF-8, as to the stdin of a script: an unpaired surrogate, which UTF-8 has none for, is
 * the replacement character
 */
export function toUtf8Text(text: string): string {
  return Buffer.from(text, 'utf8').toString('utf8');
}

/** What tells a file from another one put in its place, or undefined without the file */
function identifyFile(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    return `${stat.ino} ${stat.size} ${stat.mtimeMs}`;
  } catch {
    return undefined;
  }
}

/** Requests that were written together, whose answers haven't all been read */
interface PendingRequests {
  // The ids of the requests, in the order they were written, which is the order of the answers
  ids: number[];
  answers: FormatAnswer[];
  finish: (answers: FormatAnswer[] | undefined) => void;
  // The requests couldn't be written: the process had ended, and never got them
  unwritten: boolean;
}

/** A started FormatServer.sh */
interface RunningScript {
  child: ChildProcessWithoutNullStreams;
  // What was read behind the last line end
  unread: string;
  pending: PendingRequests[];
  // The executable the script runs, and what its file was when the script started, if there was one
  executable?: { path: string; identity: string | undefined };
  // No more requests are written to it
  ended: boolean;
  // It was stopped, for not answering or with the server, and hasn't ended by itself
  stopped: boolean;
  // Stops it when it has requests to answer and answers none of them in time
  unanswered?: ReturnType<typeof setTimeout>;
}

/**
 * A ConfigStore's FormatServer.sh kept running. The MTool Format --server it runs answers each line of its stdin, a
 * request, with a line on its stdout, in their order, until its stdin ends, so one process formats request after
 * request, without starting MTool, and writing a log, for each.
 *
 * It is started again once the executable it runs is another one, such as after MTool is built: the process tells the
 * path of its executable, whose file is compared before each request.
 */
class FormatServerProcess {
  // How long a process with requests to answer can take for the next answer before it is given up
  private static readonly answerTimeoutMilliseconds = 30_000;
  // How long a process whose stdin ended gets to exit before it is stopped
  private static readonly exitTimeoutMilliseconds = 2000;
  private static readonly maxErrorOutput = 4000;
  // What a file's times can be behind the clock
  private static readonly fileTimeSlackMilliseconds = 2000;
  // The identity of an executable whose file can have been another one when the script started: it is none a file has,
  // so the next request starts the script again
  private static readonly unknownIdentity = 'unknown';

  // The script that takes requests, also while it starts
  private running: Promise<RunningScript | undefined> | undefined;
  // The scripts before it, which answer the requests they were given until they exit
  private readonly draining = new Set<RunningScript>();
  // The path the last process told, where the executable of the next is looked at before it starts
  private executablePath: string | undefined;
  private errorOutput = '';
  // It was stopped, and starts no process again
  private stopped = false;
  private nextId = 1;

  constructor(
    private readonly script: string,
    private readonly generator: GeneratorInfo,
    private readonly workspaceFolder: vscode.WorkspaceFolder
  ) { }

  /** Why the last process failed: the end of what it wrote to stderr, or how it ended */
  get lastErrorOutput(): string {
    return this.errorOutput.trimEnd();
  }

  /**
   * Writes the requests and resolves with the answer to each, or with undefined when the process fails, ends or doesn't
   * answer, after which the next request starts it again, or when it was stopped.
   */
  async request(requests: readonly FormatRequest[]): Promise<FormatAnswer[] | undefined> {
    if (!requests.length)
      return [];
    // Again for a process that had ended since it answered, which is no failure of a request, or whose executable is
    // another one now
    let written = false;
    for (let attempt = 0; attempt < 4 && !this.stopped; ++attempt) {
      const starting = this.running ??= this.start();
      const running = await starting;
      // Stopped meanwhile, which gives up the process that was starting
      if (this.stopped)
        break;
      if (running && !running.ended && !FormatServerProcess.isReplaced(running)) {
        const answered = await this.write(running, requests);
        // That a process had ended since it answered can show only when it is written to. The requests it never got
        // go to the process started in its place, once.
        if (answered.answers || written || !answered.endedBefore)
          return answered.answers;
        written = true;
      }
      if (this.running === starting)
        this.running = undefined;
      if (!running)
        return undefined;
      // The requests it has been given are still answered
      this.drain(running);
    }
    return undefined;
  }

  /** Ends the process for good, and gives up the requests it hasn't answered */
  stop(): void {
    this.stopped = true;
    const starting = this.running;
    this.running = undefined;
    void this.giveUpStarted(starting);
    for (const running of this.draining) {
      running.stopped = true;
      this.giveUp(running);
    }
  }

  /** Ends a process another one takes the place of, which is still stopped with this server until it has exited */
  private drain(running: RunningScript) {
    if (running.child.exitCode === null && running.child.signalCode === null) {
      this.draining.add(running);
      running.child.once('close', () => this.draining.delete(running));
    }
    this.end(running);
  }

  private async giveUpStarted(starting: Promise<RunningScript | undefined> | undefined) {
    const running = await starting;
    if (running) {
      running.stopped = true;
      this.giveUp(running);
    }
  }

  /** Whether the file can have been put there, or written, since the time */
  private static isChangedSince(file: string, time: number): boolean {
    try {
      const stat = fs.statSync(file);
      return Math.max(stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs) >= time - FormatServerProcess.fileTimeSlackMilliseconds;
    } catch {
      return false;
    }
  }

  private static isReplaced(running: RunningScript): boolean {
    return !!running.executable && identifyFile(running.executable.path) !== running.executable.identity;
  }

  private async start(): Promise<RunningScript | undefined> {
    // The identity is to be that of the file the script runs, not of one put there while it starts
    const startTime = Date.now();
    const knownPath = this.executablePath;
    const knownIdentity = knownPath === undefined ? undefined : identifyFile(knownPath);
    const child = spawnConfigStoreScript(this.script, this.generator, this.workspaceFolder, []);
    const running: RunningScript = { child, unread: '', pending: [], ended: false, stopped: false };
    this.errorOutput = '';
    let errorOutput = '';
    const failed = (reason: string) => {
      // Of a process that ended as asked, the reason is none
      if (!running.ended || running.pending.length)
        this.errorOutput = errorOutput || reason;
      this.giveUp(running);
    };
    child.on('error', error => failed(String(error)));
    // It has exited before its output closes, which what it started can keep open: nothing more is written to it, and
    // what it wrote is still read
    child.on('exit', () => {
      running.ended = true;
    });
    child.on('close', code => failed(code === null ? 'It was stopped' : `It exited with code ${code}`));
    child.stdin.on('error', error => failed(String(error)));
    // A character can come in two parts
    const errorDecoder = new StringDecoder('utf8');
    child.stderr.on('data', (data: Buffer) => {
      errorOutput = (errorOutput + errorDecoder.write(data)).slice(-FormatServerProcess.maxErrorOutput);
    });
    const decoder = new StringDecoder('utf8');
    child.stdout.on('data', (data: Buffer) => this.read(running, decoder.write(data)));

    // An MTool that has no --server ends here
    const answer = (await this.write(running, [{ request: 'executable' }])).answers?.[0];
    if (!answer)
      return undefined;
    const path = answer.executable;
    if (typeof path === 'string') {
      this.executablePath = path;
      // A path that isn't the one looked at before the script started has the file it has now, unless that is new
      const identity = path === knownPath
        ? knownIdentity
        : FormatServerProcess.isChangedSince(path, startTime) ? FormatServerProcess.unknownIdentity : identifyFile(path);
      running.executable = { path, identity };
    }
    return running;
  }

  /** The answers to the requests, or without them whether the process had ended by itself before it got the requests */
  private write(running: RunningScript, requests: readonly FormatRequest[]): Promise<{ answers?: FormatAnswer[]; endedBefore?: boolean }> {
    if (running.ended)
      return Promise.resolve({});
    return new Promise(resolve => {
      const ids = requests.map(() => this.nextId++);
      const pending: PendingRequests = {
        ids,
        answers: [],
        finish: answers => resolve({ answers, endedBefore: !answers && !running.stopped && pending.unwritten }),
        unwritten: false
      };
      if (!running.pending.length)
        this.expectAnswer(running);
      running.pending.push(pending);
      // Told before the error of stdin, which gives the requests up
      // Their strings as UTF-8 has them, which the server reads
      const lines = requests.map((request, index) => JSON.stringify({ ...request, id: ids[index] }, (_key, value: unknown) => typeof value === 'string' ? toUtf8Text(value) : value));
      running.child.stdin.write(lines.join('\n') + '\n', 'utf8', error => {
        if (error)
          pending.unwritten = true;
      });
    });
  }

  /** Stops the process unless it answers in time */
  private expectAnswer(running: RunningScript) {
    clearTimeout(running.unanswered);
    running.unanswered = setTimeout(() => this.fail(running, 'It did not answer in time'), FormatServerProcess.answerTimeoutMilliseconds);
  }

  /** Stops a process that doesn't answer as a format server does */
  private fail(running: RunningScript, reason: string) {
    this.errorOutput = reason;
    running.stopped = true;
    stopConfigStoreScript(running.child);
    this.giveUp(running);
  }

  private read(running: RunningScript, text: string) {
    const lines = (running.unread + text).split('\n');
    running.unread = lines.pop()!;
    for (const line of lines) {
      const pending = running.pending[0];
      if (!pending)
        continue;
      // Each answer is an object with the id of the request it answers, in the order of the requests
      let answer: unknown;
      try {
        answer = JSON.parse(line);
      } catch {
        answer = undefined;
      }
      if (typeof answer !== 'object' || answer === null || (answer as FormatAnswer).id !== pending.ids[pending.answers.length]) {
        this.fail(running, `It answered with what is no answer to the request: ${line.slice(0, 200)}`);
        return;
      }
      pending.answers.push(answer as FormatAnswer);
      if (pending.answers.length === pending.ids.length) {
        running.pending.shift();
        pending.finish(pending.answers);
      }
      if (running.pending.length)
        this.expectAnswer(running);
      else
        clearTimeout(running.unanswered);
    }
  }

  /** Ends the process by ending its stdin: it answers the requests it has been given, and exits */
  private end(running: RunningScript) {
    if (running.ended)
      return;
    running.ended = true;
    running.child.stdin.end();
    // The requests have their own time to be answered in, after which the process is stopped
    const waitForExit = () => {
      if (running.child.exitCode !== null || running.child.signalCode !== null)
        return;
      if (running.pending.length)
        stopped = setTimeout(waitForExit, FormatServerProcess.exitTimeoutMilliseconds);
      else
        stopConfigStoreScript(running.child);
    };
    let stopped = setTimeout(waitForExit, FormatServerProcess.exitTimeoutMilliseconds);
    running.child.once('close', () => clearTimeout(stopped));
  }

  private giveUp(running: RunningScript) {
    clearTimeout(running.unanswered);
    for (const pending of running.pending.splice(0))
      pending.finish(undefined);
    this.end(running);
  }
}

/**
 * The format servers of the ConfigStores: a FormatServer.sh is started when it is first asked, and kept running for
 * what formats with it, documents and the code shown outside editors alike.
 *
 * A script that fails, as with an MTool that has no --server yet, is left alone for a minute, while what formats does
 * so the way it does without the script.
 */
export class FormatServers implements vscode.Disposable {
  // How long a script that failed is left alone, until its MTool can have been built with --server
  private static readonly retryMilliseconds = 60_000;

  // The servers by their scripts, each with what its script's file was when it was created
  private readonly servers = new Map<string, { process: FormatServerProcess; identity: string | undefined }>();
  // The scripts that failed, which are left alone until each is tried again, with what the script's file was
  private readonly failed = new Map<string, { retry: ReturnType<typeof setTimeout>; identity: string | undefined }>();
  // Those whose failure the output has, once per session, as a script is tried again every minute
  private readonly reported = new Set<string>();
  private readonly onDidRetryEmitter = new vscode.EventEmitter<void>();
  private readonly scripts: vscode.Disposable;

  /** A script that failed is tried again, so what was formatted without it can be formatted again */
  readonly onDidRetry = this.onDidRetryEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {
    // A script created again or changed where one was is another one
    this.scripts = onDidChangeFormatFileScripts(changedScript => {
      if (changedScript !== undefined)
        this.reset(changedScript);
    });
  }

  dispose(): void {
    this.scripts.dispose();
    this.onDidRetryEmitter.dispose();
    for (const script of new Set([...this.servers.keys(), ...this.failed.keys()]))
      this.reset(script);
  }

  /** Whether the ConfigStore has the script, and it hasn't failed since it was last tried */
  isUsable(script: string | undefined): script is string {
    if (!scriptExists(script))
      return false;
    this.forgetReplaced(script);
    return !this.failed.has(script);
  }

  /**
   * The answers of the script's server to the requests, or undefined when the script failed, or was stopped as it
   * changed
   */
  async request(
    script: string,
    generator: GeneratorInfo,
    workspaceFolder: vscode.WorkspaceFolder,
    requests: readonly FormatRequest[]
  ): Promise<FormatAnswer[] | undefined> {
    this.forgetReplaced(script);
    let server = this.servers.get(script);
    if (!server) {
      server = { process: new FormatServerProcess(script, generator, workspaceFolder), identity: identifyFile(script) };
      this.servers.set(script, server);
    }
    const answers = await server.process.request(requests);
    // One that was stopped meanwhile hasn't failed
    if (!answers && this.servers.get(script) === server)
      this.fail(script, server.process.lastErrorOutput);
    return answers;
  }

  /** Leaves a script alone that failed, or whose answers aren't those of a format server, until it is tried again */
  fail(script: string, reason: string): void {
    if (!this.reported.has(script)) {
      this.reported.add(script);
      this.output.appendLine(`Formatting with ${script} failed, so it is done without it:`);
      this.output.appendLine(reason);
    }
    // One that was stopped starts no more, so the script is run anew when it is tried again
    const identity = this.servers.get(script)?.identity ?? identifyFile(script);
    this.servers.get(script)?.process.stop();
    this.servers.delete(script);
    if (this.failed.has(script))
      return;
    const retry = setTimeout(() => {
      this.failed.delete(script);
      this.onDidRetryEmitter.fire();
    }, FormatServers.retryMilliseconds);
    this.failed.set(script, { retry, identity });
  }

  /**
   * Forgets the server and the failure of a script whose file is another one now, which the watchers don't tell of a
   * script whose directory was put there again
   */
  private forgetReplaced(script: string) {
    const known = this.servers.get(script) ?? this.failed.get(script);
    if (known && known.identity !== identifyFile(script))
      this.reset(script);
  }

  /** Stops the script's server, and forgets that it failed */
  private reset(script: string) {
    clearTimeout(this.failed.get(script)?.retry);
    this.failed.delete(script);
    this.servers.get(script)?.process.stop();
    this.servers.delete(script);
  }
}
