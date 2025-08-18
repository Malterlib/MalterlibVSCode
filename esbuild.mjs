import path from 'node:path';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [path.join(import.meta.dirname, 'src/extension.ts')],
		bundle: true,
		format: 'cjs',
		minify: false,
		sourcemap: true,
		sourcesContent: false,
		platform: 'node',
		outfile: path.join(import.meta.dirname, 'dist/extension.js'),
		external: ['vscode'],
		logLevel: 'warning',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin
		]
	});
	if (watch)
		await ctx.watch();
	else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd(result => {
			result.errors.forEach(({ text, location }) => {
				if (location)
					console.error(`> ${location.file}:${location.line}:${location.column}: error: ${text}`);
				else
					console.error(`> unknown: error: ${text}`);
			});
			console.error('[watch] build finished');
		});
	}
};

main().catch(e => {
	console.error(e);
	process.exit(1);
});
