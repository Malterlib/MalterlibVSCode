import { promises as fsp } from 'fs';
import * as path from 'path';

/**
 * The output directories of the generated build systems of a checkout, as absolute paths, that
 * `BuildSystem/BuildSystems.json` lists. An MTool of MToolVersion 6 or later writes it; the keys of `BuildSystems` are the
 * output directories, relative to the checkout when they are in it, and absolute otherwise. A listed directory can be
 * gone until the next command that updates repositories, so a build system is only one when its directory has a
 * ConfigStore. Without the file there are none, and the build systems are found by scanning `BuildSystem/*` instead.
 */
export async function readListedBuildSystems(checkout: string): Promise<string[]> {
  let listing: unknown;
  try {
    listing = JSON.parse(await fsp.readFile(path.join(checkout, 'BuildSystem', 'BuildSystems.json'), 'utf8'));
  } catch {
    return []; // No listing, or one being replaced
  }
  const buildSystems = (listing as { BuildSystems?: unknown } | null)?.BuildSystems;
  if (!buildSystems || typeof buildSystems !== 'object')
    return [];
  return Object.keys(buildSystems).map(outputDir => path.resolve(checkout, outputDir));
}

/**
 * Whether an output directory is directly in the checkout's BuildSystem directory, where scanning `BuildSystem/*` also
 * finds it
 */
export function isInBuildSystemDirectory(checkout: string, outputDir: string): boolean {
  const parent = path.dirname(path.resolve(outputDir));
  const buildSystemPath = path.join(path.resolve(checkout), 'BuildSystem');
  return process.platform === 'linux' ? parent === buildSystemPath : parent.toLowerCase() === buildSystemPath.toLowerCase();
}
