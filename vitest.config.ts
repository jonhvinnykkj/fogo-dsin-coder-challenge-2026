import { configDefaults, defineConfig } from 'vitest/config';

// Padrão: ambiente 'node' (servidor, shared). Testes de interface (web/**/*.test.tsx)
// rodam em 'jsdom' via test.projects (environmentMatchGlobs foi removido no Vitest 4+).
//
// Projeto 'preditivo': os testes do motor preditivo (e das rotas /api/previsoes) usam a cidade semeada completa
// (~1,5 s para criar). Eles rodam num só processo, um arquivo depois do outro e sem isolar módulos, para que
// `server/preditivo/test-helpers.ts` semeie UMA vez e todos reaproveitem o mesmo banco.
const TESTES_PREDITIVO = ['server/preditivo/**/*.test.ts', 'server/rotas/previsoes.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...TESTES_PREDITIVO],
        },
      },
      {
        test: {
          name: 'preditivo',
          environment: 'node',
          include: TESTES_PREDITIVO,
          isolate: false,
          fileParallelism: false,
          maxWorkers: 1,
          // Projetos com número de processos diferente precisam de grupos diferentes: este roda depois dos outros.
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['web/**/*.test.{ts,tsx}'],
          // Matchers do jest-dom (toHaveStyle, toBeInTheDocument) e limpeza do DOM entre testes.
          setupFiles: ['web/src/test/setup.ts'],
        },
      },
    ],
  },
});
