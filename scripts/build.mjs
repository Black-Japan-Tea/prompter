import { build } from 'esbuild';
import { cpSync } from 'node:fs';

// Preload обязателен единым файлом: sandbox-преж-load не умеет requirить
// локальные модули, поэтому бандлим с electron как external.
await build({
  entryPoints: ['src/preload/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: 'dist/preload/preload.js',
});

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
