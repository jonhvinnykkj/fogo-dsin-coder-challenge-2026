import { describe, expect, it } from 'vitest';
import { apagarBancoE2e } from './apagar-banco-e2e.mjs';

const erro = (code: string) => Object.assign(new Error(`${code}: resource busy or locked`), { code });

describe('apagarBancoE2e', () => {
  it('apaga o banco e os arquivos -wal e -shm', async () => {
    const apagados: string[] = [];
    const pendentes = await apagarBancoE2e({ remover: (a) => void apagados.push(a), pausa: async () => {} });
    expect(pendentes).toEqual([]);
    expect(apagados).toEqual(['data/e2e.db', 'data/e2e.db-wal', 'data/e2e.db-shm']);
  });

  it('tenta de novo, com espera, quando o Windows devolve EBUSY', async () => {
    let falhasRestantes = 3;
    const esperas: number[] = [];
    const apagados: string[] = [];
    const pendentes = await apagarBancoE2e({
      intervaloMs: 250,
      remover: (arquivo) => {
        if (arquivo.endsWith('.db') && falhasRestantes-- > 0) throw erro('EBUSY');
        apagados.push(arquivo);
      },
      pausa: async (ms) => void esperas.push(ms),
    });
    expect(pendentes).toEqual([]);
    expect(apagados).toContain('data/e2e.db');
    expect(esperas).toEqual([250, 250, 250]);
  });

  it('não lança se o arquivo continuar preso: devolve o que sobrou', async () => {
    let tentativasNoBanco = 0;
    const pendentes = await apagarBancoE2e({
      tentativas: 4,
      remover: (arquivo) => {
        if (arquivo === 'data/e2e.db') {
          tentativasNoBanco++;
          throw erro('EBUSY');
        }
      },
      pausa: async () => {},
    });
    expect(pendentes).toEqual(['data/e2e.db']);
    expect(tentativasNoBanco).toBe(4);
  });
});
