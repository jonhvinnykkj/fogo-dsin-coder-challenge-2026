// Depois do E2E: apaga o banco temporário (e os arquivos -wal/-shm do SQLite).
// No Windows o servidor ainda segura o arquivo neste momento (o Playwright o derruba depois do globalTeardown): se não
// der para apagar, só avisa. O próximo E2E apaga a sobra antes de subir o servidor (scripts/apagar-banco-e2e.mjs).
import { apagarBancoE2e } from '../scripts/apagar-banco-e2e.mjs';

export default async function limpeza(): Promise<void> {
  const pendentes = await apagarBancoE2e({ tentativas: 5, intervaloMs: 200 });
  if (pendentes.length > 0) {
    console.warn(`Aviso: ${pendentes.join(', ')} ainda em uso pelo servidor do teste. Sem problema: o próximo "npm run e2e" apaga.`);
  }
}
