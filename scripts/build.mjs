import { build } from 'esbuild';
import { cpSync } from 'node:fs';

// Renderer собирается esbuild-бандлом: TS + импортированный CSS
// складываются в dist/renderer (renderer.js + renderer.css + index.html).
await build({
  entryPoints: ['src/renderer/renderer.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/renderer/renderer.js',
});

cpSync('src/renderer/index.html', 'dist/renderer/index.html');
