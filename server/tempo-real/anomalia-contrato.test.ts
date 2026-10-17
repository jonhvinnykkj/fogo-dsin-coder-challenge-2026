// Contrato entre as duas pontas do "esperado × medido": o servidor escreve a descrição do alerta de anomalia
// (detectarAnomalia + motor de alertas) e a tela de Previsões a lê com `lerAnomalia` (web/src/util/anomalia.ts). Se a frase
// do servidor mudar, este teste quebra aqui, em vez de a tela cair em silêncio para a descrição inteira.
import { describe, expect, it } from 'vitest';
import { formatarNumero } from '../../shared/formato';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { lerAnomalia } from '../../web/src/util/anomalia';
import { criarCtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste, inserirTelemetriaDeTeste } from '../test/fabricas';
import { detectarAnomalia, type BaseHoraria } from './anomalias';
import { alvoPorCodigo } from './motor-alertas';

/** Mesma regra de casas do servidor (`fmt` em anomalias.ts): inteiro ou ≥ 100 sem casa, senão 1 casa. */
const comoOServidor = (n: number) => formatarNumero(n, n >= 100 || Number.isInteger(n) ? 0 : 1);
const unidade = (tipo: TipoEquipamentoId, chave: string) => METRICAS_POR_TIPO[tipo].find((m) => m.chave === chave)!.unidade;

describe('descrição da anomalia → lerAnomalia', () => {
  const casos: { tipo: TipoEquipamentoId; base: BaseHoraria; leitura: Record<string, number | boolean>; sentido: 'abaixo' | 'acima' }[] = [
    { tipo: 'radar', base: { media: { fluxo: 258, velocidadeMedia: 41, infracoes: 1.3 }, desvio: { fluxo: 11, velocidadeMedia: 4, infracoes: 0.9 }, amostras: 8 }, leitura: { fluxo: 0, velocidadeMedia: 41, infracoes: 1 }, sentido: 'abaixo' },
    { tipo: 'radar', base: { media: { fluxo: 258, velocidadeMedia: 41, infracoes: 1.3 }, desvio: { fluxo: 11, velocidadeMedia: 4, infracoes: 0.9 }, amostras: 8 }, leitura: { fluxo: 258, velocidadeMedia: 41, infracoes: 7 }, sentido: 'acima' },
    { tipo: 'patinete', base: { media: { bateria: 38.4, emUso: 20 }, desvio: { bateria: 8.7, emUso: 5 }, amostras: 6 }, leitura: { bateria: 6.9, emUso: 20 }, sentido: 'abaixo' },
    { tipo: 'transporte', base: { media: { velocidade: 30.5, kmRodados: 5.8 }, desvio: { velocidade: 5.6, kmRodados: 1.2 }, amostras: 8 }, leitura: { velocidade: 30.5, kmRodados: 10.4 }, sentido: 'acima' },
    { tipo: 'camera', base: { media: { online: 100, fps: 25 }, desvio: { online: 0, fps: 2 }, amostras: 7 }, leitura: { online: 25, fps: 25 }, sentido: 'abaixo' },
  ];

  for (const c of casos) {
    it(`${c.tipo}: ${c.sentido} do normal`, () => {
      const a = detectarAnomalia(c.base, c.leitura, c.tipo);
      expect(a).not.toBeNull();
      const descricao = `Equipamento FOGO-XXX-0001 (Rua Bahia, Centro). ${a!.explicacao}.`; // prefixo como o motor escreve
      expect(lerAnomalia(descricao)).toMatchObject({
        medido: comoOServidor(a!.valor),
        esperado: comoOServidor(a!.esperado),
        unidade: unidade(c.tipo, a!.metrica),
        sentido: c.sentido,
        dias: c.base.amostras,
      });
    });
  }

  it('o alerta de verdade do motor (radar zerado no pico) é lido com esperado, medido e unidade', () => {
    const quarta18h = '2026-10-14T21:20:00.000Z';
    const ctx = criarCtxDeTeste({ agora: quarta18h });
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0012', ultimoSinalEm: '2026-10-14T21:19:00.000Z' });
    ['2026-10-13', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-02', '2026-10-01'].forEach((d, i) => {
      inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: i % 2 ? 440 : 360, velocidadeMedia: 38, infracoes: 3 });
    });
    const [alerta] = ctx.motor.avaliarLeitura(alvoPorCodigo(ctx.db, 'FOGO-RAD-0012')!, { fluxo: 0, velocidadeMedia: 0, infracoes: 0 }, new Date(quarta18h));
    expect(alerta?.tipo).toBe('anomalia_leitura');
    expect(lerAnomalia(alerta!.descricao)).toMatchObject({ metrica: 'Fluxo de veículos', medido: '0', esperado: '400', unidade: 'veículos/h', sentido: 'abaixo', dias: 8 });
  });
});
