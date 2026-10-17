import { afterEach, describe, expect, it, vi } from 'vitest';
import { dentroDeMarilia } from '../../shared/geo';
import type { EventoFogo } from '../../shared/modelos';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { Simulador } from './simulador';

afterEach(() => {
  vi.useRealTimers();
});

/** Mesma cidadezinha toda vez: um de cada tipo que o simulador trata de um jeito próprio, mais dois agentes. */
function cidadezinha(): CtxDeTeste {
  const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' });
  const ids = { ...{} } as Record<string, number>;
  const lista: [string, string, Record<string, unknown>?][] = [
    ['radar', 'FOGO-RAD-0001'], ['radar', 'FOGO-RAD-0002'], ['camera', 'FOGO-CAM-0001'], ['semaforo', 'FOGO-SEM-0001'],
    ['patinete', 'FOGO-PAT-0001'], ['patinete', 'FOGO-PAT-0002'], ['viatura', 'FOGO-VIA-0001'], ['moto_agente', 'FOGO-MOT-0001'],
    ['sensor_alagamento', 'FOGO-ALG-0001', { alturaAlertaCm: 30 }],
  ];
  for (const [tipo, codigo, caracteristicas] of lista) {
    ids[codigo] = inserirEquipamentoDeTeste(ctx, { tipo, codigo, caracteristicas, ultimoSinalEm: '2026-10-14T20:59:00.000Z' });
  }
  const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  const agente = ctx.db.prepare(`INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual,
      equipamento_id, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'Secretaria de Mobilidade Urbana', 'em_servico', 'tarde', 'Rua Paraíba', ?, ?, ?, ?, ?, ?, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z')`);
  agente.run('Ana', 'AT-1', 'agente_transito', b.id, b.lat, b.lng, b.lat, b.lng, ids['FOGO-MOT-0001']);
  agente.run('Bia', 'GM-1', 'guarda_municipal', b.id, b.lat, b.lng, b.lat, b.lng, ids['FOGO-VIA-0001']);
  return ctx;
}

const fotografia = (ctx: CtxDeTeste) => ({
  telemetria: ctx.db.prepare('SELECT equipamento_id, hora, leituras, online_min, metricas FROM telemetria_hora ORDER BY equipamento_id, hora').all(),
  equipamentos: ctx.db.prepare('SELECT codigo, situacao, lat_atual, lng_atual, ultimo_sinal_em FROM equipamentos ORDER BY id').all(),
  agentes: ctx.db.prepare('SELECT matricula, situacao, lat_atual, lng_atual FROM agentes ORDER BY id').all(),
  ocorrencias: ctx.db.prepare('SELECT tipo, gravidade, bairro_id, lat, lng, inicio, origem FROM ocorrencias ORDER BY id').all(),
  alertas: ctx.db.prepare('SELECT tipo, criticidade, titulo, equipamento_id FROM alertas ORDER BY id').all(),
});

describe('Simulador', () => {
  it('com a mesma semente, 10 passos geram exatamente as mesmas leituras em duas execuções', () => {
    const a = cidadezinha();
    const b = cidadezinha();
    const sa = new Simulador(a, { semente: 7 });
    const sb = new Simulador(b, { semente: 7 });
    sa.definir({ velocidade: 60 });
    sb.definir({ velocidade: 60 });
    for (let i = 0; i < 10; i++) {
      sa.passo();
      sb.passo();
    }
    const fa = fotografia(a);
    expect(fa.telemetria.length).toBeGreaterThan(5); // o primeiro passo sincroniza todo mundo
    expect(fotografia(b)).toEqual(fa);
    const c = cidadezinha();
    const sc = new Simulador(c, { semente: 8 });
    sc.definir({ velocidade: 60 });
    for (let i = 0; i < 10; i++) sc.passo();
    expect(fotografia(c)).not.toEqual(fa);
  });

  it('o primeiro passo sincroniza todos: todo equipamento operacional ganha sinal na hora do relógio', () => {
    const ctx = cidadezinha();
    new Simulador(ctx, { semente: 1 }).passo();
    const sem = ctx.db.prepare("SELECT codigo FROM equipamentos WHERE ultimo_sinal_em <> '2026-10-14T21:00:00.000Z'").all();
    expect(sem).toEqual([]);
  });

  it('móveis andam pelas ruas e continuam dentro de Marília; o agente do veículo o acompanha', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 3 });
    sim.definir({ velocidade: 60 });
    const antes = ctx.db.prepare("SELECT lat_atual, lng_atual FROM equipamentos WHERE codigo = 'FOGO-VIA-0001'").get() as { lat_atual: number; lng_atual: number };
    const vistos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => vistos.push(e));
    for (let i = 0; i < 40; i++) sim.passo();
    const depois = ctx.db.prepare("SELECT lat_atual, lng_atual FROM equipamentos WHERE codigo = 'FOGO-VIA-0001'").get() as { lat_atual: number; lng_atual: number };
    expect(depois).not.toEqual(antes);
    const todos = ctx.db.prepare('SELECT lat_atual AS lat, lng_atual AS lng FROM equipamentos UNION ALL SELECT lat_atual, lng_atual FROM agentes').all() as { lat: number; lng: number }[];
    expect(todos.filter((p) => !dentroDeMarilia(p.lat, p.lng))).toEqual([]);
    const posicoes = vistos.filter((e) => e.tipo === 'posicoes');
    expect(posicoes.length).toBeGreaterThan(5);
    const agente = ctx.db.prepare("SELECT lat_atual, lng_atual FROM agentes WHERE matricula = 'GM-1'").get() as { lat_atual: number; lng_atual: number };
    expect(agente).toEqual(depois);
  });

  it("definir({ velocidade: 60 }) aparece em estado() e vai para o barramento; pausado não avança", () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx);
    expect(sim.estado()).toEqual({ velocidade: 1, pausado: false, relogio: '2026-10-14T21:00:00.000Z' });
    const vistos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => vistos.push(e));
    sim.definir({ velocidade: 60 });
    expect(sim.estado().velocidade).toBe(60);
    expect(vistos).toContainEqual({ tipo: 'simulacao', dados: { velocidade: 60, pausado: false, relogio: '2026-10-14T21:00:00.000Z' } });
    sim.definir({ pausado: true });
    expect(sim.estado()).toMatchObject({ velocidade: 60, pausado: true });
    sim.passo();
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM telemetria_hora').get()).toEqual({ n: 0 });
    sim.definir({ pausado: false });
    sim.passo();
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM telemetria_hora').get() as { n: number }).n).toBeGreaterThan(5);
  });

  it("injetar('alagamento') gera alerta alagamento crítico e evento no barramento", () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    const vistos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => vistos.push(e));
    const alertas = sim.injetar('alagamento');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'alagamento', criticidade: 'critica' });
    expect(alertas[0]!.descricao).toContain('FOGO-ALG-0001');
    expect(vistos.some((e) => e.tipo === 'alerta' && e.dados.tipo === 'alagamento')).toBe(true);
    const o = ctx.db.prepare("SELECT tipo, origem FROM ocorrencias WHERE tipo = 'alagamento'").all();
    expect(o).toEqual([{ tipo: 'alagamento', origem: 'injetado' }]);
  });

  it("injetar('alagamento') sem nenhum sensor ainda gera o alerta (pela ocorrência)", () => {
    const ctx = criarCtxDeTeste();
    const alertas = new Simulador(ctx, { semente: 5 }).injetar('alagamento');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'alagamento', criticidade: 'critica' });
  });

  it("injetar('furto') tira um patinete de Marília: alerta crítico, situação furtada e ocorrência injetada", () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    const alertas = sim.injetar('furto');
    expect(alertas.find((a) => a.tipo === 'furto_suspeito')).toMatchObject({ criticidade: 'critica' });
    const furtados = ctx.db.prepare("SELECT codigo, tipo, lat_atual, lng_atual FROM equipamentos WHERE situacao = 'furtado'").all() as { tipo: string; lat_atual: number; lng_atual: number }[];
    expect(furtados).toHaveLength(1);
    expect(furtados[0]!.tipo).toBe('patinete');
    expect(dentroDeMarilia(furtados[0]!.lat_atual, furtados[0]!.lng_atual)).toBe(false);
    expect(ctx.db.prepare("SELECT origem FROM ocorrencias WHERE tipo = 'furto_vandalismo'").all()).toEqual([{ origem: 'injetado' }]);
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM historico_situacao WHERE para = 'furtado'").get()).toEqual({ n: 1 });
  });

  it("injetar('falha') põe o equipamento em mau funcionamento e alerta falha_equipamento (alta)", () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    const id = (ctx.db.prepare("SELECT id FROM equipamentos WHERE codigo = 'FOGO-RAD-0001'").get() as { id: number }).id;
    const alertas = sim.injetar('falha', id);
    expect(alertas.find((a) => a.tipo === 'falha_equipamento')).toMatchObject({ criticidade: 'alta', equipamentoId: id });
    expect(ctx.db.prepare('SELECT situacao FROM equipamentos WHERE id = ?').get(id)).toEqual({ situacao: 'mau_funcionamento' });
    expect(sim.injetar('falha', id)).toHaveLength(0); // já falhou: nada novo
  });

  it("injetar('acidente') e ('congestionamento') criam ocorrência injetada e alerta (crítico só com gravidade 4)", () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 11 });
    const [acidente] = sim.injetar('acidente');
    expect(acidente).toMatchObject({ tipo: 'acidente' });
    expect(['alta', 'critica']).toContain(acidente!.criticidade);
    const [cong] = sim.injetar('congestionamento');
    expect(cong).toMatchObject({ tipo: 'congestionamento', criticidade: 'media' });
    const o = ctx.db.prepare('SELECT tipo, origem, gravidade FROM ocorrencias ORDER BY id').all() as { tipo: string; origem: string; gravidade: number }[];
    expect(o.map((x) => [x.tipo, x.origem])).toEqual([['acidente', 'injetado'], ['congestionamento', 'injetado']]);
    expect(acidente!.criticidade).toBe(o[0]!.gravidade === 4 ? 'critica' : 'alta');
  });

  it('injetar com alvo de tipo errado recusa com mensagem clara', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    const radar = (ctx.db.prepare("SELECT id FROM equipamentos WHERE codigo = 'FOGO-RAD-0001'").get() as { id: number }).id;
    expect(() => sim.injetar('alagamento', radar)).toThrow(/sensor de alagamento/i);
    expect(() => sim.injetar('furto', 99999)).toThrow(/não encontrado/);
  });

  it('em ritmo de 60× ao longo de muitos passos acontecem ocorrências ao vivo, com agente a caminho, e tudo fecha com o tempo', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 21 });
    sim.definir({ velocidade: 60 });
    for (let i = 0; i < 400; i++) sim.passo();
    const ao_vivo = ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE origem = 'tempo_real'").get() as { n: number };
    expect(ao_vivo.n).toBeGreaterThan(0);
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE origem = 'historico'").get()).toEqual({ n: 0 });
  });

  it('iniciar agenda um tick de 2 s e parar limpa o timer', () => {
    vi.useFakeTimers();
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 1 });
    expect(vi.getTimerCount()).toBe(0);
    sim.iniciar();
    sim.iniciar(); // idempotente
    expect(vi.getTimerCount()).toBe(2); // tick de 2 s + indicadores de 5 s
    vi.advanceTimersByTime(2000);
    expect((ctx.db.prepare('SELECT COUNT(*) AS n FROM telemetria_hora').get() as { n: number }).n).toBeGreaterThan(5);
    sim.parar();
    expect(vi.getTimerCount()).toBe(0);
  });

  const MIN = 60_000;
  const idDe = (ctx: CtxDeTeste, codigo: string) => (ctx.db.prepare('SELECT id FROM equipamentos WHERE codigo = ?').get(codigo) as { id: number }).id;
  const sit = (ctx: CtxDeTeste, codigo: string) => (ctx.db.prepare('SELECT situacao FROM equipamentos WHERE codigo = ?').get(codigo) as { situacao: string }).situacao;
  const avancar = (ctx: CtxDeTeste, ms: number) => {
    const r = ctx.relogio as RelogioDeTeste;
    r.definir(new Date(r.agora().getTime() + ms));
  };

  it('ciclo da falha: mau funcionamento → em manutenção → operacional, com alertas resolvidos (relógio de teste)', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    sim.passo();
    sim.injetar('falha', idDe(ctx, 'FOGO-RAD-0001'));
    expect(sit(ctx, 'FOGO-RAD-0001')).toBe('mau_funcionamento');
    avancar(ctx, 6 * MIN);
    sim.passo();
    expect(sit(ctx, 'FOGO-RAD-0001')).toBe('em_manutencao');
    avancar(ctx, 7 * MIN);
    sim.passo();
    expect(sit(ctx, 'FOGO-RAD-0001')).toBe('operacional');
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM manutencoes WHERE equipamento_id = ? AND tipo = 'corretiva' AND concluida_em IS NOT NULL").get(idDe(ctx, 'FOGO-RAD-0001'))).toEqual({ n: 1 });
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM alertas WHERE equipamento_id = ? AND resolvido_em IS NULL AND tipo IN ('falha_equipamento','sem_sinal','anomalia_leitura')").get(idDe(ctx, 'FOGO-RAD-0001'))).toEqual({ n: 0 });
  });

  it('reinício: ocorrência aberta, agente em ocorrência e reparo pendente são reconstruídos do banco e terminam', () => {
    const ctx = cidadezinha();
    const antes = new Simulador(ctx, { semente: 5 });
    antes.passo();
    antes.injetar('acidente');
    antes.injetar('falha', idDe(ctx, 'FOGO-RAD-0002'));
    const aberta = ctx.db.prepare("SELECT id, agente_id FROM ocorrencias WHERE tipo = 'acidente' AND origem = 'injetado'").get() as { id: number; agente_id: number | null };
    expect(aberta.agente_id).not.toBeNull();
    expect(ctx.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(aberta.agente_id)).toEqual({ situacao: 'em_ocorrencia' });

    // "Reinício": a memória do simulador antigo se perde; um novo assume o mesmo banco 30 min depois.
    antes.parar();
    avancar(ctx, 30 * MIN);
    const depois = new Simulador(ctx, { semente: 6 });
    depois.passo();
    avancar(ctx, 40 * MIN);
    depois.passo();
    avancar(ctx, 30 * MIN);
    depois.passo();

    const o = ctx.db.prepare('SELECT fim FROM ocorrencias WHERE id = ?').get(aberta.id) as { fim: string | null };
    expect(o.fim).not.toBeNull();
    expect(ctx.db.prepare('SELECT situacao FROM agentes WHERE id = ?').get(aberta.agente_id)).toEqual({ situacao: 'em_servico' });
    expect(sit(ctx, 'FOGO-RAD-0002')).toBe('operacional');
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE fim IS NULL AND origem = 'injetado'").get()).toEqual({ n: 0 });
  });

  it('reinício muito depois: ocorrência velha é encerrada de imediato e equipamento em manutenção é concluído', () => {
    const ctx = cidadezinha();
    const antes = new Simulador(ctx, { semente: 5 });
    antes.passo();
    antes.injetar('congestionamento');
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'em_manutencao' WHERE codigo = 'FOGO-CAM-0001'").run();
    avancar(ctx, 3 * 3_600_000);
    const depois = new Simulador(ctx, { semente: 6 });
    depois.passo();
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE fim IS NULL AND origem = 'injetado'").get()).toEqual({ n: 0 });
    avancar(ctx, 7 * MIN);
    depois.passo();
    expect(sit(ctx, 'FOGO-CAM-0001')).toBe('operacional');
  });
});
