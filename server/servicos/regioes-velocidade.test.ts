// Situação das regiões × velocidade da simulação: o índice mede a cidade no ritmo real, não no ritmo da demonstração.
// Cidade semeada completa + simulador com relógio de teste (cada passo avança 2 s, como o temporizador de produção).
import { beforeAll, describe, expect, it } from 'vitest';
import { semear, SEMENTE_PADRAO } from '../semente/semear';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { Simulador } from '../tempo-real/simulador';
import { calcularStatusRegioes } from './central';

const INICIO = '2026-10-16T21:00:00.000Z'; // sexta-feira, 18 h em São Paulo: o horário mais movimentado

function rodar(ctx: CtxDeTeste, sim: Simulador, passos: number): void {
  const relogio = ctx.relogio as RelogioDeTeste;
  for (let i = 0; i < passos; i++) {
    relogio.definir(new Date(relogio.agora().getTime() + 2000));
    sim.passo();
  }
}

describe('situação das regiões com a simulação acelerada', () => {
  let ctx: CtxDeTeste;
  let sim: Simulador;
  beforeAll(() => {
    ctx = criarCtxDeTeste({ agora: INICIO });
    semear(ctx.db, { agora: ctx.relogio.agora(), semente: SEMENTE_PADRAO, geo: ctx.geo });
    sim = new Simulador(ctx, { semente: 3 });
    ctx.simulador = sim;
  }, 120_000);

  it('10 minutos a 60× não deixam as 5 regiões críticas; um acidente injetado ainda muda o bairro e a região', () => {
    sim.definir({ velocidade: 60 });
    rodar(ctx, sim, 300); // 300 passos de 2 s = 10 minutos reais a 60×
    const ao_vivo = (ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE origem = 'tempo_real'").get() as { n: number }).n;
    expect(ao_vivo).toBeGreaterThan(500); // a cidade está mesmo agitada
    const regioes = calcularStatusRegioes(ctx.db, ctx.relogio.agora());
    expect(regioes.filter((r) => r.nivel === 'critico').length).toBeLessThan(5);

    // Acidente injetado perto de um equipamento de um bairro calmo: o alerta crítico e a ocorrência (peso cheio) aparecem.
    const calmo = regioes.flatMap((r) => r.bairros).filter((b) => b.indice < 40).map((b) => b.bairroId);
    const ref = ctx.db.prepare(`SELECT id, bairro_id FROM equipamentos WHERE situacao = 'operacional' AND tipo = 'camera' AND bairro_id IN (${calmo.join(',')}) LIMIT 1`).get() as { id: number; bairro_id: number };
    const antes = regioes.flatMap((r) => r.bairros).find((b) => b.bairroId === ref.bairro_id)!;
    const regiaoAntes = regioes.find((r) => r.bairros.some((b) => b.bairroId === ref.bairro_id))!;
    const [alerta] = sim.injetar('acidente', ref.id);
    expect(alerta).toMatchObject({ tipo: 'acidente', criticidade: 'critica' });
    const depois = calcularStatusRegioes(ctx.db, ctx.relogio.agora());
    const bairro = depois.flatMap((r) => r.bairros).find((b) => b.bairroId === ref.bairro_id)!;
    expect(bairro.indice).toBeGreaterThanOrEqual(antes.indice + 29); // 25 do alerta crítico + 4 da ocorrência
    const criticosDe = (motivos: string[]) => Number(/(\d+) alertas? críticos?/.exec(motivos.join(' | '))?.[1] ?? 0);
    const regiaoDepois = depois.find((r) => r.regiao === regiaoAntes.regiao)!;
    expect(criticosDe(regiaoDepois.motivos)).toBe(criticosDe(regiaoAntes.motivos) + 1);
  }, 60_000);

  it('de volta a 1×, ocorrências ao vivo continuam pesando no índice (no ritmo real)', () => {
    sim.definir({ velocidade: 1 });
    const desde = ctx.relogio.agora().toISOString();
    rodar(ctx, sim, 150); // 5 minutos a 1×
    const novas = ctx.db.prepare("SELECT COUNT(*) AS n, SUM(peso) AS s FROM ocorrencias WHERE origem = 'tempo_real' AND inicio > ?").get(desde) as { n: number; s: number };
    expect(novas.n).toBeGreaterThan(0);
    expect(novas.s).toBeCloseTo(novas.n / 8, 6); // a 1× cada ocorrência ao vivo pesa 1/8 (o fator de demonstração)
    const regioes = calcularStatusRegioes(ctx.db, ctx.relogio.agora());
    expect(regioes.some((r) => r.motivos.some((m) => /no ritmo real/.test(m)))).toBe(true);
  }, 60_000);
});
