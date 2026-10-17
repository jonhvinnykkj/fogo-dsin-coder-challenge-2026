// E2E de fumaça: sobe o app de verdade com um banco só dele (data/e2e.db) numa porta própria, sem tocar em data/fogo.db.
import { defineConfig, devices } from '@playwright/test';

const PORTA = 3399;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/limpeza.ts',
  use: { baseURL: `http://localhost:${PORTA}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORTA}/api/saude`,
    // Build do Vite + semear a cidade (~2 s) + subir: folga para máquina lenta.
    timeout: 180_000,
    reuseExistingServer: false,
    env: { FOGO_DB: './data/e2e.db', PORT: String(PORTA) },
  },
});
