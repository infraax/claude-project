import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/commands/**', 'src/cli.ts', 'src/extension.ts'],
    },
  },
});
