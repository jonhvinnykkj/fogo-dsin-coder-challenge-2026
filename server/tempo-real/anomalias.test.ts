import { describe, expect, it } from 'vitest';
import { calcularBaseHoraria, detectarAnomalia, type BaseHoraria } from './anomalias';
import { inserirEquipamentoDeTeste, inserirTelemetriaDeTeste } from '../test/fabricas';
import { criarCtxDeTeste } from '../test/ctx';

const base = (amostras: number): BaseHoraria => ({ media: { fluxo: 400, velocidadeMedia: 50, infracoes: 3 }, desvio: { fluxo: 40, velocidadeMedia: 4, infracoes: 1.5 }, amostras });

describe('detectarAnomalia', () => {
  it('leitura zerada contra média 400 (desvio 40, 10 amostras) é anomalia e a explicação diz o esperado', () => {
    const a = detectarAnomalia(base(10), { fluxo: 0, velocidadeMedia: 50, infracoes: 3 }, 'radar');
    expect(a).not.toBeNull();
    expect(a!.metrica).toBe('fluxo');
    expect(a!.valor).toBe(0);
    expect(a!.esperado).toBe(400);
    expect(a!.z).toBeLessThanOrEqual(-3);
    expect(a!.explicacao).toContain('400');
    expect(a!.explicacao).toContain('veículos/h');
  });

  it('leitura 410 é normal', () => {
    expect(detectarAnomalia(base(10), { fluxo: 410, velocidadeMedia: 51, infracoes: 4 }, 'radar')).toBeNull();
  });

  it('com 3 amostras não decide (null)', () => {
    expect(detectarAnomalia(base(3), { fluxo: 0 }, 'radar')).toBeNull();
  });

  it('radar zerado em horário de média ≥ 50 é anomalia mesmo com desvio enorme', () => {
    const larga: BaseHoraria = { media: { fluxo: 60 }, desvio: { fluxo: 400 }, amostras: 10 };
    expect(detectarAnomalia(larga, { fluxo: 0 }, 'radar')).not.toBeNull();
    // fora de radar a regra não vale
    expect(detectarAnomalia({ media: { pesagens: 60 }, desvio: { pesagens: 400 }, amostras: 10 }, { pesagens: 0 }, 'balanca')).toBeNull();
  });

  it('desvio zero não gera falso positivo para variação pequena (câmera sempre 100% conectada)', () => {
    const camera: BaseHoraria = { media: { online: 100, fps: 24 }, desvio: { online: 0, fps: 0 }, amostras: 20 };
    expect(detectarAnomalia(camera, { online: 100, fps: 24.5 }, 'camera')).toBeNull();
    expect(detectarAnomalia(camera, { online: 25, fps: 2 }, 'camera')).not.toBeNull();
  });

  it('aceita booleano (online: false vira 0%)', () => {
    const camera: BaseHoraria = { media: { online: 100 }, desvio: { online: 0 }, amostras: 20 };
    expect(detectarAnomalia(camera, { online: false }, 'camera')?.metrica).toBe('online');
  });

  it('ignora métrica que o tipo não tem', () => {
    expect(detectarAnomalia({ media: { nada: 10 }, desvio: { nada: 1 }, amostras: 20 }, { nada: 999 }, 'radar')).toBeNull();
  });
});

describe('calcularBaseHoraria', () => {
  it('junta só a mesma hora local e o mesmo tipo de dia, ignora horas com queda de sinal', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    // 18 h local = 21 h UTC. Quarta 14/10 e dias úteis anteriores: fluxo 380 e 420 alternados.
    const diasUteis = ['2026-10-14', '2026-10-13', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06'];
    diasUteis.forEach((d, i) => inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: i % 2 ? 420 : 380 }));
    inserirTelemetriaDeTeste(ctx, id, '2026-10-10T21:00:00.000Z', { fluxo: 100 }); // sábado: outro perfil
    inserirTelemetriaDeTeste(ctx, id, '2026-10-05T21:00:00.000Z', { fluxo: 0 }, 10); // hora com queda de sinal
    inserirTelemetriaDeTeste(ctx, id, '2026-10-14T20:00:00.000Z', { fluxo: 999 }); // outra hora

    const util = calcularBaseHoraria(ctx.db, id, true, 18);
    expect(util.amostras).toBe(6);
    expect(util.media.fluxo).toBe(400);
    expect(util.desvio.fluxo).toBeGreaterThan(20);
    expect(util.desvio.fluxo).toBeLessThan(30);
    const fim = calcularBaseHoraria(ctx.db, id, false, 18);
    expect(fim.amostras).toBe(1);
    expect(fim.media.fluxo).toBe(100);
    expect(calcularBaseHoraria(ctx.db, id, true, 3).amostras).toBe(0);
  });

  it('fora dos dias úteis, diaSemana compara sábado com sábado e domingo com domingo', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    ['2026-10-10', '2026-10-03', '2026-09-26'].forEach((d) => inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: 300 })); // sábados
    ['2026-10-11', '2026-10-04', '2026-09-27'].forEach((d) => inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: 100 })); // domingos
    expect(calcularBaseHoraria(ctx.db, id, false, 18).media.fluxo).toBe(200);
    expect(calcularBaseHoraria(ctx.db, id, false, 18, { diaSemana: 6 }).media.fluxo).toBe(300);
    expect(calcularBaseHoraria(ctx.db, id, false, 18, { diaSemana: 0 }).media.fluxo).toBe(100);
  });

  it('o parâmetro "antes" deixa de fora a hora que está sendo gravada', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001' });
    inserirTelemetriaDeTeste(ctx, id, '2026-10-14T21:00:00.000Z', { fluxo: 400 });
    inserirTelemetriaDeTeste(ctx, id, '2026-10-15T21:00:00.000Z', { fluxo: 10 });
    expect(calcularBaseHoraria(ctx.db, id, true, 18, { antes: new Date('2026-10-15T21:00:00.000Z') }).amostras).toBe(1);
  });
});
