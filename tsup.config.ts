import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  dts: true,
  format: ['esm'],
  minify: false,
  shims: false,
  sourcemap: true,
  target: 'node22'
});
