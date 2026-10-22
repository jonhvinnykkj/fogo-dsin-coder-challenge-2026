// Apaga o banco temporário do E2E (data/e2e.db e os arquivos -wal/-shm do SQLite). Roda em dois momentos:
// antes de subir o servidor do E2E (sobra de uma execução anterior) e no globalTeardown (e2e/limpeza.ts).
// No Windows não dá para apagar arquivo aberto, e o Playwright só derruba o servidor DEPOIS do globalTeardown: lá a remoção
// pode falhar com EBUSY/EPERM. Por isso aqui nada derruba o processo: tenta de novo com espera, devolve o que sobrou
// e quem chama avisa; o próximo `npm run e2e` apaga a sobra antes de começar.
// JavaScript puro e sem dependências, como scripts/checar-node.mjs: roda com `node scripts/apagar-banco-e2e.mjs`.
import { rmSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const BANCO_E2E = 'data/e2e.db';
const SUFIXOS = ['', '-wal', '-shm'];

/**
 * Tenta apagar os três arquivos até `tentativas` vezes, esperando `intervaloMs` entre elas (a espera libera o laço de
 * eventos, ao contrário do `retryDelay` do rmSync). Devolve os caminhos que não foi possível apagar; nunca lança.
 * `remover` e `pausa` existem para o teste simular o EBUSY do Windows.
 */
export async function apagarBancoE2e({
  caminho = BANCO_E2E,
  tentativas = 10,
  intervaloMs = 300,
  remover = (arquivo) => rmSync(arquivo, { force: true }),
  pausa = esperar,
} = {}) {
  let pendentes = SUFIXOS.map((sufixo) => `${caminho}${sufixo}`);
  for (let tentativa = 1; tentativa <= tentativas && pendentes.length > 0; tentativa++) {
    const restantes = [];
    for (const arquivo of pendentes) {
      try {
        remover(arquivo);
      } catch {
        restantes.push(arquivo);
      }
    }
    pendentes = restantes;
    if (pendentes.length > 0 && tentativa < tentativas) await pausa(intervaloMs);
  }
  return pendentes;
}

// Rodado direto (antes do servidor do E2E subir): se algo não sair, avisa e segue; o app abre o banco de qualquer jeito.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pendentes = await apagarBancoE2e({ tentativas: 5 });
  if (pendentes.length > 0) console.warn(`Aviso: não foi possível apagar ${pendentes.join(', ')} (em uso por outro programa?). O E2E segue com o que já está lá.`);
}
