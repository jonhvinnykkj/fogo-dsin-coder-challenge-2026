// Eixo de horas da telemetria: marcas a cada 6 h cheias de São Paulo, sempre iguais (não dependem de onde a janela começa).
import { describe, expect, it } from 'vitest';
import { horaEDia } from '../../util/datas';
import { marcasDoEixo } from './GraficoTelemetria';

const horas = (inicioIso: string, n: number) => Array.from({ length: n }, (_, i) => new Date(new Date(inicioIso).getTime() + i * 3_600_000).toISOString());

describe('marcasDoEixo', () => {
  it.each(['2026-10-20T14:00:00.000Z', '2026-10-20T17:00:00.000Z', '2026-10-20T23:00:00.000Z'])('janela de 48 h que começa em %s: marcas em 00h, 06h, 12h e 18h de São Paulo, a cada 6 h', (inicio) => {
    const marcas = marcasDoEixo(horas(inicio, 48));
    expect(marcas.length).toBeGreaterThanOrEqual(7);
    expect(marcas.length).toBeLessThanOrEqual(9);
    for (const m of marcas) expect(horaEDia(m).hora % 6).toBe(0);
    for (let i = 1; i < marcas.length; i++) expect(new Date(marcas[i]!).getTime() - new Date(marcas[i - 1]!).getTime()).toBe(6 * 3_600_000);
  });

  it('o rótulo traz hora e data (dia/mês) de São Paulo', () => {
    // 2026-10-21T03:00Z = 00h de 21/10 em São Paulo (UTC-3).
    expect(horaEDia('2026-10-21T03:00:00.000Z')).toEqual({ hora: 0, minuto: 0, dia: '21/10' });
  });
});
