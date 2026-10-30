import * as vscode from 'vscode';
import { lstatSync, readlinkSync, statSync } from 'fs';
import * as path from 'path';

/**
 * The identity of a directory, which another directory that replaces it doesn't have. For a link it's also of the link
 * and where it points, so retargeting it changes it also when neither directory exists.
 */
export function getDirectoryIdentity(directory: string): string | undefined {
  let link = '';
  try {
    const linkStat = lstatSync(directory);
    if (linkStat.isSymbolicLink())
      link = `${linkStat.dev}:${linkStat.ino}>${readlinkSync(directory)}|`;
  } catch {
    return undefined;
  }
  try {
    const stat = statSync(directory);
    return `${link}${stat.dev}:${stat.ino}`;
  } catch {
    return link || undefined;
  }
}

/**
 * The file a path names with its symbolic links resolved, also when the file or directory a link points to doesn't
 * exist yet
 */
export function getLinkTarget(filePath: string, links: string[]): string {
  const absolutePath = path.resolve(filePath);
  let resolved = path.parse(absolutePath).root;
  const components = absolutePath.slice(resolved.length).split(path.sep).filter(component => component);
  while (components.length) {
    const next = path.join(resolved, components.shift()!);
    let link: string | undefined;
    try {
      if (links.length < 40 && lstatSync(next).isSymbolicLink())
        link = readlinkSync(next);
    } catch {
      // Doesn't exist (yet)
    }
    if (link === undefined) {
      resolved = next;
      continue;
    }
    // Resolve the link's target, followed by the rest of the path
    links.push(next);
    const target = path.resolve(resolved, link);
    resolved = path.parse(target).root;
    components.unshift(...target.slice(resolved.length).split(path.sep).filter(component => component));
  }
  return resolved;
}

/**
 * Watch for a directory, or a directory it's in, being created, deleted, moved or replaced, which can be reported for
 * that directory only, by the watcher of its parent. A replacement can be reported as a change, which a directory also
 * gets when its entries change, so it's told apart by its identity. The directories it's in stop below the root, as
 * those aren't moved, but the directory itself can be in the root.
 */
export function watchDirectoryAndAncestors(directory: string, listener: () => void): vscode.Disposable {
  const caseSensitive = process.platform === 'linux';
  const disposables: vscode.Disposable[] = [];
  const directories: string[] = [];
  if (path.dirname(directory) !== directory)
    directories.push(directory);
  for (let current = path.dirname(directory); path.dirname(path.dirname(current)) !== path.dirname(current); current = path.dirname(current))
    directories.push(current);
  for (const watched of directories) {
    const name = path.basename(watched);
    const isWatched = (uri: vscode.Uri) => {
      const eventName = path.basename(uri.fsPath);
      return caseSensitive ? eventName === name : eventName.toLowerCase() === name.toLowerCase();
    };
    let identity = getDirectoryIdentity(watched);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(watched)), name.replace(/[[\]{}*?]/g, '?')));
    const onEvent = (uri: vscode.Uri, bChange: boolean) => {
      if (!isWatched(uri))
        return;
      const now = getDirectoryIdentity(watched);
      if (bChange && now === identity)
        return;
      identity = now;
      listener();
    };
    disposables.push(
      watcher,
      watcher.onDidCreate(uri => onEvent(uri, false)),
      watcher.onDidChange(uri => onEvent(uri, true)),
      watcher.onDidDelete(uri => onEvent(uri, false))
    );
  }
  return vscode.Disposable.from(...disposables);
}
