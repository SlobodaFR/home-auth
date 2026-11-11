import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles NestJS decorators with their metadata (esbuild cannot emit it).
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'] },
});
