import { defineConfig } from 'vitest/config';

// Padrão: ambiente 'node' (servidor, shared). Testes de interface (web/**/*.test.tsx)
// rodam em 'jsdom' via test.projects (environmentMatchGlobs foi removido no Vitest 4+).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['web/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
