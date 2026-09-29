import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: ({ entry }) => {
    if (entry === 'cli') {
      return { js: '#!/usr/bin/env node\n' };
    }
    return {};
  },
});
