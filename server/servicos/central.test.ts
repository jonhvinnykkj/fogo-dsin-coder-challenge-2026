import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarAppDeTeste } from '../test/app';
import { inserirAlerta } from '../repositorios/alertas';
import { semear, SEMENTE_PADRAO } from '../semente/semear';
import { AGORA_PADRAO, criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { Simulador } from '../tempo-real/simulador';
import { calcularIndicadores, calcularStatusRegioes, listarOcorrenciasRecentes, listarParaMapa } from './central';

const AGORA = new Date(AGORA_PADRAO); // 2026-10-17 12:00 em São Paulo

function bairros(ctx: CtxDeTeste): { id: number; lat: number; lng: number; regiao: string }[] {
  return ctx.db.prepare('SELECT id, lat, lng, regiao FROM bairros ORDER BY id').all() as { id: number; lat: number; lng: number; regiao: string }[];
}

function inserirOcorrencia(ctx: CtxDeTeste, bairroId: number, inicio: string): void {
  ctx.db.prepare(
    "INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, descricao, chuva, origem) VALUES ('acidente', 2, ?, -22.2, -49.9, ?, '', 0, 'tempo_real')",
  ).run(bairroId, inicio);
}

/** 10 equipamentos: 6 operacionais (3 câmeras, 3 radares), 1 mau funcionamento (câmera), 1 furtado (radar), 1 não instalado, 1 desativado. */
function montarDez(ctx: CtxDeTeste): void {
  const lista: [string, string][] = [
    ['camera', 'operacional'], ['camera', 'operacional'], ['camera', 'operacional'],
    ['radar', 'operacional'], ['radar', 'operacional'], ['radar', 'operacional'],
    ['camera', 'mau_funcionamento'], ['radar', 'furtado'], ['radar', 'nao_instalado'], ['radar', 'desativado'],
  ];
  lista.forEach(([tipo, situacao], i) => inserirEquipamentoDeTeste(ctx, { tipo, situacao, codigo: `T-${i}` }));
}

describe('calcularIndicadores', () => {
  it('disponibilidade = operacionais / (total - não instalados - desativados)', () => {
    const ctx = criarCtxDeTeste();
    montarDez(ctx);
    const ind = calcularIndicadores(ctx.db, undefined, AGORA);
    expect(ind).toMatchObject({ totalEquipamentos: 10, operacionais: 6, indisponiveis: 2, naoInstalados: 1, desativados: 1, disponibilidadePct: 75 });
  });

  it('filtro por tipo muda os totais', () => {
    const ctx = criarCtxDeTeste();
    montarDez(ctx);
    const ind = calcularIndicadores(ctx.db, { tipo: ['camera'] }, AGORA);
    expect(ind).toMatchObject({ totalEquipamentos: 4, operacionais: 3, indisponiveis: 1, disponibilidadePct: 75 });
  });

  it('sem equipamento ativo a disponibilidade é 0, sem dividir por zero', () => {
    const ctx = criarCtxDeTeste();
    expect(calcularIndicadores(ctx.db, undefined, AGORA).disponibilidadePct).toBe(0);
  });

  it('conta agentes, alertas abertos e manutenção (hoje é a data de São Paulo)', () => {
    const ctx = criarCtxDeTeste();
    const [b] = bairros(ctx);
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'M-1', proximaManutencao: '2026-10-20' }); // em 3 dias
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'M-2', proximaManutencao: '2026-10-30' }); // longe
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'M-3', proximaManutencao: '2026-10-10' }); // atrasada, não é "próxima"
    ctx.db.prepare("UPDATE equipamentos SET manutencao_necessidade = 'imediata' WHERE codigo = 'M-2'").run();
    for (const s of ['em_servico', 'em_ocorrencia', 'pausa']) {
      ctx.db.prepare(
        `INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual, criado_em, atualizado_em)
         VALUES ('A', ?, 'agente_transito', 'Secretaria de Mobilidade Urbana', ?, 'manha', 'Rua', ?, ?, ?, ?, ?, 'x', 'x')`,
      ).run(`M-${s}`, s, b!.id, b!.lat, b!.lng, b!.lat, b!.lng);
    }
    inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'critica', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'baixa', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    const ind = calcularIndicadores(ctx.db, undefined, AGORA);
    expect(ind).toMatchObject({ agentesEmAtividade: 2, agentesTotal: 3, alertasAbertos: 2, alertasCriticosAbertos: 1, manutencaoImediata: 1, manutencaoProxima7d: 1 });
  });
});

describe('listarParaMapa', () => {
  it('marca manutenção atrasada, imediata, próxima e ok', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'A-1', proximaManutencao: '2026-10-16' }); // ontem
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'A-2', proximaManutencao: '2026-10-24' });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'A-3' });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'A-4' });
    ctx.db.prepare("UPDATE equipamentos SET manutencao_necessidade = 'imediata' WHERE codigo = 'A-4'").run();
    const { equipamentos } = listarParaMapa(ctx.db, undefined, AGORA);
    const por = (c: string) => equipamentos.find((e) => e.codigo === c)!.manutencao;
    expect([por('A-1'), por('A-2'), por('A-3'), por('A-4')]).toEqual(['atrasada', 'proxima', 'ok', 'imediata']);
  });

  it('equipamento fixo usa lat/lng cadastrados; móvel usa a posição atual (ou o cadastro se nula)', () => {
    const ctx = criarCtxDeTeste();
    const id1 = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'F-1', lat: -22.21, lng: -49.94 });
    const id2 = inserirEquipamentoDeTeste(ctx, { tipo: 'patinete', codigo: 'F-2', lat: -22.21, lng: -49.94 });
    ctx.db.prepare('UPDATE equipamentos SET lat_atual = -22.25, lng_atual = -49.95 WHERE id IN (?, ?)').run(id1, id2);
    const { equipamentos } = listarParaMapa(ctx.db, undefined, AGORA);
    expect(equipamentos.find((e) => e.id === id1)).toMatchObject({ lat: -22.21, lng: -49.94 });
    expect(equipamentos.find((e) => e.id === id2)).toMatchObject({ lat: -22.25, lng: -49.95 });
  });

  it('agente usa a posição atual e os filtros de tipo e situação aceitam vários valores', () => {
    const ctx = criarCtxDeTeste();
    const [b] = bairros(ctx);
    ctx.db.prepare(
      `INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual, criado_em, atualizado_em)
       VALUES ('Ana', 'X-1', 'guarda_municipal', 'Guarda Civil Municipal', 'em_servico', 'manha', 'Rua', ?, -22.2, -49.9, -22.3, -49.8, 'x', 'x')`,
    ).run(b!.id);
    montarDez(ctx);
    const todos = listarParaMapa(ctx.db, undefined, AGORA);
    expect(todos.agentes).toEqual([{ id: 1, nome: 'Ana', categoria: 'guarda_municipal', situacao: 'em_servico', lat: -22.3, lng: -49.8, bairroId: b!.id }]);
    const f = listarParaMapa(ctx.db, { tipo: ['camera', 'radar'], situacao: ['furtado', 'mau_funcionamento'] }, AGORA);
    expect(f.equipamentos.map((e) => e.codigo).sort()).toEqual(['T-6', 'T-7']);
  });
});

describe('calcularStatusRegioes', () => {
  it('1 alerta crítico + 2 indisponíveis = índice 49, nível atenção, com motivos', () => {
    const ctx = criarCtxDeTeste();
    const [b] = bairros(ctx);
    inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'C-1', situacao: 'mau_funcionamento' });
    inserirEquipamentoDeTeste(ctx, { tipo: 'camera', codigo: 'C-2', situacao: 'furtado' });
    inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'critica', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    const regioes = calcularStatusRegioes(ctx.db, AGORA);
    const bairro = regioes.flatMap((r) => r.bairros).find((x) => x.bairroId === b!.id)!;
    expect(bairro.indice).toBe(49);
    expect(bairro.nivel).toBe('atencao');
    expect(bairro.motivos).toContain('1 alerta crítico aberto');
    expect(bairro.motivos).toContain('2 câmeras indisponíveis');
    const regiao = regioes.find((r) => r.regiao === b!.regiao)!;
    expect(regiao.indice).toBe(49);
    expect(regiao.nivel).toBe('atencao');
    expect(regioes.map((r) => r.regiao).sort()).toEqual(['Centro', 'Leste', 'Norte', 'Oeste', 'Sul']);
  });

  it('singular e plural, alerta alto, ocorrências só nas últimas 3 h, teto de 100 e nível crítico', () => {
    const ctx = criarCtxDeTeste();
    const [b, b2] = bairros(ctx);
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'R-1', situacao: 'em_manutencao' });
    inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'alta', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'alta', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    inserirOcorrencia(ctx, b!.id, '2026-10-17T14:00:00.000Z'); // 1 h atrás: conta
    inserirOcorrencia(ctx, b!.id, '2026-10-17T10:00:00.000Z'); // 5 h atrás: não conta
    const bairro = calcularStatusRegioes(ctx.db, AGORA).flatMap((r) => r.bairros).find((x) => x.bairroId === b!.id)!;
    expect(bairro.indice).toBe(12 + 20 + 4);
    expect(bairro.motivos).toEqual(['2 alertas altos abertos', '1 radar indisponível', '1 ocorrência nas últimas 3 h']);
    expect(bairro.nivel).toBe('atencao');

    for (let i = 0; i < 4; i++) inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'critica', titulo: 't', descricao: 'd', bairroId: b2!.id, criadoEm: AGORA_PADRAO });
    const b2s = calcularStatusRegioes(ctx.db, AGORA).flatMap((r) => r.bairros).find((x) => x.bairroId === b2!.id)!;
    expect(b2s.indice).toBe(100);
    expect(b2s.nivel).toBe('critico');
  });

  it('ocorrência ao vivo conta pelo peso guardado nela (ritmo real): 8 a 1× valem 1 ocorrência do histórico', () => {
    const ctx = criarCtxDeTeste();
    const [b, b2] = bairros(ctx);
    const ins = ctx.db.prepare(
      "INSERT INTO ocorrencias (tipo, gravidade, bairro_id, lat, lng, inicio, descricao, chuva, origem, peso) VALUES ('acidente', 2, ?, -22.2, -49.9, ?, '', 0, ?, ?)",
    );
    for (let i = 0; i < 8; i++) ins.run(b!.id, '2026-10-17T14:30:00.000Z', 'tempo_real', 1 / 8);
    ins.run(b2!.id, '2026-10-17T14:30:00.000Z', 'injetado', 1); // evento injetado: peso cheio
    const lista = calcularStatusRegioes(ctx.db, AGORA).flatMap((r) => r.bairros);
    const bairro = lista.find((x) => x.bairroId === b!.id)!;
    expect(bairro.indice).toBe(4);
    expect(bairro.motivos).toEqual(['8 ocorrências nas últimas 3 h (contam como 1 no ritmo real)']);
    expect(lista.find((x) => x.bairroId === b2!.id)).toMatchObject({ indice: 4, motivos: ['1 ocorrência nas últimas 3 h'] });
  });

  it('bairro sem problemas fica normal, índice 0 e sem motivos; alerta resolvido não conta', () => {
    const ctx = criarCtxDeTeste();
    const [b] = bairros(ctx);
    const a = inserirAlerta(ctx.db, { tipo: 'x', criticidade: 'critica', titulo: 't', descricao: 'd', bairroId: b!.id, criadoEm: AGORA_PADRAO });
    ctx.db.prepare('UPDATE alertas SET resolvido_em = ? WHERE id = ?').run(AGORA_PADRAO, a.id);
    const bairro = calcularStatusRegioes(ctx.db, AGORA).flatMap((r) => r.bairros).find((x) => x.bairroId === b!.id)!;
    expect(bairro).toMatchObject({ indice: 0, nivel: 'normal', motivos: [] });
  });
});

describe('listarOcorrenciasRecentes', () => {
  it('traz só as ocorrências dentro da janela', () => {
    const ctx = criarCtxDeTeste();
    const [b] = bairros(ctx);
    inserirOcorrencia(ctx, b!.id, '2026-10-17T14:00:00.000Z');
    inserirOcorrencia(ctx, b!.id, '2026-10-16T10:00:00.000Z'); // 29 h atrás
    expect(listarOcorrenciasRecentes(ctx.db, 24, AGORA)).toHaveLength(1);
    expect(listarOcorrenciasRecentes(ctx.db, 48, AGORA)).toHaveLength(2);
    expect(listarOcorrenciasRecentes(ctx.db, 24, AGORA)[0]).toMatchObject({ bairroId: b!.id, tipo: 'acidente', gravidade: 2, inicio: '2026-10-17T14:00:00.000Z' });
  });
});

describe('com a cidade semeada', () => {
  let ctx: CtxDeTeste;
  let app: FastifyInstance;
  beforeAll(async () => {
    ctx = criarCtxDeTeste();
    semear(ctx.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: ctx.geo });
    ctx.simulador = new Simulador(ctx, { semente: 1 });
    app = await criarAppDeTeste(ctx);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  const medir = (fn: () => unknown): number => {
    fn(); // aquece o cache de statements
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it('mapa em menos de 100 ms e regiões em menos de 200 ms', () => {
    const mapa = listarParaMapa(ctx.db, undefined, AGORA);
    expect(mapa.equipamentos.length).toBeGreaterThanOrEqual(300);
    expect(mapa.agentes.length).toBeGreaterThanOrEqual(60);
    expect(medir(() => listarParaMapa(ctx.db, undefined, AGORA))).toBeLessThan(100);
    expect(medir(() => calcularStatusRegioes(ctx.db, AGORA))).toBeLessThan(200);
    expect(medir(() => calcularIndicadores(ctx.db, undefined, AGORA))).toBeLessThan(100);
  });

  it('rotas: indicadores, mapa com filtros repetidos ou separados por vírgula, regiões e ocorrências', async () => {
    const ind = (await app.inject('/api/central/indicadores')).json();
    expect(ind.totalEquipamentos).toBeGreaterThan(300);
    const a = (await app.inject('/api/central/mapa?tipo=radar&tipo=camera')).json();
    const b = (await app.inject('/api/central/mapa?tipo=radar,camera')).json();
    expect(a.equipamentos.length).toBeGreaterThan(0);
    expect(a.equipamentos.every((e: { tipo: string }) => ['radar', 'camera'].includes(e.tipo))).toBe(true);
    expect(b.equipamentos).toEqual(a.equipamentos);
    const filtrado = (await app.inject('/api/central/indicadores?tipo=radar')).json();
    expect(filtrado.totalEquipamentos).toBeLessThan(ind.totalEquipamentos);
    const regioes = (await app.inject('/api/central/regioes')).json();
    expect(regioes).toHaveLength(5);
    const oc = (await app.inject('/api/central/ocorrencias?horas=24')).json();
    expect(Array.isArray(oc)).toBe(true);
  });

  it('valores inválidos viram 400 em português', async () => {
    for (const url of ['/api/central/mapa?tipo=foguete', '/api/central/indicadores?situacao=quebrado', '/api/central/ocorrencias?horas=0', '/api/central/ocorrencias?horas=169']) {
      const r = await app.inject(url);
      expect(r.statusCode, url).toBe(400);
      expect(r.json().erro).toBe('Dados inválidos');
    }
    const campos = (await app.inject('/api/central/mapa?tipo=foguete')).json().campos;
    expect(campos['tipo.0']).toBe('Tipo: valor inválido'); // o caminho leva o índice do item da lista
  });
});
