// Ocorrência concluída pelo agente no Modo Campo, com o simulador rodando: ele precisa esquecer a ocorrência na hora,
// senão o agente fica preso ao local e fora dos próximos despachos até o fim que o simulador tinha sorteado.
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventoFogo } from '../../shared/modelos';
import { criarAppDeTeste } from '../test/app';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { Simulador } from './simulador';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Um radar e uma agente de trânsito (Ana, a única que atende congestionamento), no turno da tarde. */
function cenario(): { ctx: CtxDeTeste; sim: Simulador; ana: number } {
  const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' }); // 18h em Marília: turno da tarde
  inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0001', ultimoSinalEm: '2026-10-14T20:59:00.000Z' });
  const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  const r = ctx.db.prepare(`INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual,
      criado_em, atualizado_em)
    VALUES ('Ana', 'AT-1', 'agente_transito', 'Secretaria de Mobilidade Urbana', 'em_servico', 'tarde', 'Rua Paraíba', ?, ?, ?, ?, ?, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z')`)
    .run(b.id, b.lat, b.lng, b.lat, b.lng);
  const sim = new Simulador(ctx, { semente: 7 });
  ctx.simulador = sim;
  return { ctx, sim, ana: Number(r.lastInsertRowid) };
}

const ocorrenciaDaAna = (ctx: CtxDeTeste, ana: number) =>
  ctx.db.prepare('SELECT id FROM ocorrencias WHERE agente_id = ? AND fim IS NULL ORDER BY id DESC').get(ana) as { id: number } | undefined;

describe('Modo Campo × simulador', () => {
  it('depois de "concluída", o agente volta aos despachos na hora e o fim sorteado da ocorrência não acontece de novo', async () => {
    const { ctx, sim, ana } = cenario();
    app = await criarAppDeTeste(ctx);
    sim.passo();
    sim.injetar('congestionamento');
    const primeira = ocorrenciaDaAna(ctx, ana);
    expect(primeira).toBeDefined();
    expect(ctx.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(ana)).toEqual({ situacao: 'em_ocorrencia' });

    await app.inject({ method: 'POST', url: `/api/campo/agentes/${ana}/despachos/${primeira!.id}/chegada` });
    const r = await app.inject({ method: 'POST', url: `/api/campo/agentes/${ana}/despachos/${primeira!.id}/conclusao` });
    expect(r.statusCode).toBe(200);
    sim.passo();
    expect(ctx.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(ana)).toEqual({ situacao: 'em_servico' });

    // Livre de verdade: o próximo congestionamento já é dela.
    sim.injetar('congestionamento');
    const segunda = ocorrenciaDaAna(ctx, ana);
    expect(segunda).toBeDefined();
    expect(segunda!.id).not.toBe(primeira!.id);

    // Passado o tempo máximo de qualquer ocorrência, a primeira não é "encerrada" de novo (nenhum evento com o id dela).
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    (ctx.relogio as RelogioDeTeste).definir('2026-10-14T21:45:00.000Z');
    sim.passo();
    expect(eventos.some((e) => e.tipo === 'ocorrencia' && e.dados.id === primeira!.id)).toBe(false);
    expect(eventos.some((e) => e.tipo === 'ocorrencia' && e.dados.id === segunda!.id && e.dados.fim !== undefined)).toBe(true);
    expect(ctx.db.prepare('SELECT fim FROM ocorrencias WHERE id = ?').get(primeira!.id)).toEqual({ fim: '2026-10-14T21:00:00.000Z' });
  });

  it('esquecerOcorrencia com id desconhecido não faz nada', () => {
    const { sim } = cenario();
    sim.passo();
    expect(() => sim.esquecerOcorrencia(12345)).not.toThrow();
  });
});
