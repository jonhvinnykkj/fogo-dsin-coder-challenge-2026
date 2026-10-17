// Tarefa 11b: alertas que se resolvem sozinhos quando a causa termina (e anotam que foi automático).
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Alerta, EventoFogo } from '../../shared/modelos';
import { criarApp } from '../app';
import { inserirAlerta } from '../repositorios/alertas';
import { inserirOcorrencia } from '../repositorios/ocorrencias';
import { criarCtxDeTeste, type CtxDeTeste, type RelogioDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste, inserirTelemetriaDeTeste } from '../test/fabricas';
import { ingerirTelemetria } from './ingestao';
import { alvoPorCodigo } from './motor-alertas';
import { Simulador } from './simulador';

const MIN = 60_000;
const HORA = 60 * MIN;
const QUARTA_18H = '2026-10-14T21:20:00.000Z';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const avancar = (ctx: CtxDeTeste, ms: number) => {
  const r = ctx.relogio as RelogioDeTeste;
  r.definir(new Date(r.agora().getTime() + ms));
};
const alertaDe = (ctx: CtxDeTeste, id: number) =>
  ctx.db.prepare('SELECT id, tipo, resolvido_em AS resolvidoEm, resolucao FROM alertas WHERE id = ?').get(id) as { id: number; tipo: string; resolvidoEm: string | null; resolucao: string | null };
const abertos = (ctx: CtxDeTeste, tipo?: string) =>
  (ctx.db.prepare(`SELECT COUNT(*) AS n FROM alertas WHERE resolvido_em IS NULL${tipo ? ' AND tipo = ?' : ''}`).get(...(tipo ? [tipo] : [])) as { n: number }).n;
const alvo = (ctx: CtxDeTeste, codigo: string) => alvoPorCodigo(ctx.db, codigo)!;

function cidadezinha(): CtxDeTeste {
  const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' });
  for (const [tipo, codigo] of [['radar', 'FOGO-RAD-0001'], ['semaforo', 'FOGO-SEM-0001'], ['patinete', 'FOGO-PAT-0001'], ['viatura', 'FOGO-VIA-0001'], ['moto_agente', 'FOGO-MOT-0001']] as const) {
    inserirEquipamentoDeTeste(ctx, { tipo, codigo, ultimoSinalEm: '2026-10-14T20:59:00.000Z' });
  }
  inserirEquipamentoDeTeste(ctx, { tipo: 'sensor_alagamento', codigo: 'FOGO-ALG-0001', caracteristicas: { alturaAlertaCm: 30 }, ultimoSinalEm: '2026-10-14T20:59:00.000Z' });
  const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  const ins = ctx.db.prepare(`INSERT INTO agentes (nome, matricula, categoria, orgao, situacao, turno, base_logradouro, base_bairro_id, lat, lng, lat_atual, lng_atual, equipamento_id, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'Secretaria de Mobilidade Urbana', 'em_servico', 'tarde', 'Rua Paraíba', ?, ?, ?, ?, ?, (SELECT id FROM equipamentos WHERE codigo = ?), '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z')`);
  ins.run('Ana', 'AT-1', 'agente_transito', b.id, b.lat, b.lng, b.lat, b.lng, 'FOGO-MOT-0001');
  ins.run('Bia', 'GM-1', 'guarda_municipal', b.id, b.lat, b.lng, b.lat, b.lng, 'FOGO-VIA-0001');
  return ctx;
}

function cidadeComRadar(): { ctx: CtxDeTeste; id: number } {
  const ctx = criarCtxDeTeste({ agora: QUARTA_18H });
  const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0012', ultimoSinalEm: '2026-10-14T21:19:00.000Z' });
  ['2026-10-13', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-02', '2026-10-01'].forEach((d, i) => {
    inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: i % 2 ? 440 : 360, velocidadeMedia: 38, infracoes: 3 });
  });
  return { ctx, id };
}

describe('regra 1: alerta de ocorrência fecha quando a ocorrência recebe fim', () => {
  it.each(['acidente', 'congestionamento'] as const)('%s injetado → alerta aberto; ocorrência encerrada → resolvido (automática) + evento', (tipo) => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    sim.passo();
    const [alerta] = sim.injetar(tipo);
    expect(alerta).toMatchObject({ tipo });
    expect(abertos(ctx, tipo)).toBe(1);
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    avancar(ctx, 45 * MIN); // além da duração máxima (40 min a 1×)
    sim.passo();
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM ocorrencias WHERE fim IS NULL AND origem = 'injetado'").get()).toEqual({ n: 0 });
    const linha = alertaDe(ctx, alerta!.id);
    expect(linha.resolvidoEm).not.toBeNull();
    expect(linha.resolucao).toBe('automatica');
    const emitido = eventos.find((e) => e.tipo === 'alerta' && e.dados.id === alerta!.id && e.dados.resolvidoEm);
    expect(emitido).toBeDefined();
    expect((emitido as { dados: Alerta }).dados.resolucao).toBe('automatica');
  });

  it('alagamento de ocorrência (sem sensor) também fecha com a ocorrência', () => {
    const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' });
    const sim = new Simulador(ctx, { semente: 5 });
    sim.passo();
    const [alerta] = sim.injetar('alagamento');
    avancar(ctx, 100 * MIN); // alagamento dura até 80 min a 1×
    sim.passo();
    expect(alertaDe(ctx, alerta!.id)).toMatchObject({ resolucao: 'automatica' });
  });
});

describe('regra 2: sem_sinal fecha na próxima leitura do equipamento', () => {
  it('leitura nova resolve o sem_sinal', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0100', ultimoSinalEm: '2026-10-17T14:40:00.000Z' });
    ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(abertos(ctx, 'sem_sinal')).toBe(1);
    ingerirTelemetria(ctx, { codigo: 'FOGO-RAD-0100', metricas: { fluxo: 100 } });
    expect(abertos(ctx, 'sem_sinal')).toBe(0);
    expect(ctx.db.prepare("SELECT resolucao FROM alertas WHERE tipo = 'sem_sinal'").get()).toEqual({ resolucao: 'automatica' });
  });
});

describe('regra 3: anomalia fecha com 3 leituras normais seguidas (|z| < 2) ou ao entrar em manutenção', () => {
  const abrir = () => {
    const { ctx, id } = cidadeComRadar();
    const em = new Date(QUARTA_18H);
    const [a] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 900 }, em);
    expect(a).toBeDefined();
    return { ctx, id, em, a: a! };
  };

  it('2 leituras normais: ainda aberta; 3: resolvida (automática)', () => {
    const { ctx, em, a } = abrir();
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 405 }, em);
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 395 }, em);
    expect(alertaDe(ctx, a.id).resolvidoEm).toBeNull();
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 410 }, em);
    expect(alertaDe(ctx, a.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, a.id).resolvidoEm).not.toBeNull();
  });

  it('leitura ainda esquisita (2 ≤ |z| < 3) no meio zera a contagem', () => {
    const { ctx, em, a } = abrir();
    const r = alvo(ctx, 'FOGO-RAD-0012');
    ctx.motor.avaliarLeitura(r, { fluxo: 400 }, em);
    ctx.motor.avaliarLeitura(r, { fluxo: 400 }, em);
    ctx.motor.avaliarLeitura(r, { fluxo: 600 }, em); // z = 2,5: não é normal
    ctx.motor.avaliarLeitura(r, { fluxo: 400 }, em);
    ctx.motor.avaliarLeitura(r, { fluxo: 400 }, em);
    expect(alertaDe(ctx, a.id).resolvidoEm).toBeNull();
    ctx.motor.avaliarLeitura(r, { fluxo: 400 }, em);
    expect(alertaDe(ctx, a.id).resolvidoEm).not.toBeNull();
  });

  it('equipamento em manutenção resolve a anomalia na varredura', () => {
    const { ctx, id, a } = abrir();
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'em_manutencao' WHERE id = ?").run(id);
    ctx.motor.varrer(new Date(QUARTA_18H));
    expect(alertaDe(ctx, a.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, a.id).resolvidoEm).not.toBeNull();
  });
});

describe('regra 4: falha_equipamento fecha no reparo concluído', () => {
  it('POST de manutenção concluída em equipamento com falha resolve o alerta de falha', async () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0300', situacao: 'mau_funcionamento' });
    const falha = ctx.motor.alertarFalha(alvo(ctx, 'FOGO-RAD-0300'), ctx.relogio.agora(), 'lente suja')!;
    app = await criarApp(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/equipamentos/${id}/manutencoes`, payload: { tipo: 'corretiva', descricao: 'Troca da lente', concluidaEm: ctx.relogio.agora().toISOString() } });
    expect(r.statusCode).toBe(201);
    expect(alertaDe(ctx, falha.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, falha.id).resolvidoEm).not.toBeNull();
  });

  it('o ciclo do simulador (falha → equipe → reparo) resolve como automática', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    sim.passo();
    const id = (ctx.db.prepare("SELECT id FROM equipamentos WHERE codigo = 'FOGO-RAD-0001'").get() as { id: number }).id;
    const [falha] = sim.injetar('falha', id);
    avancar(ctx, 6 * MIN);
    sim.passo();
    avancar(ctx, 7 * MIN);
    sim.passo();
    expect(alertaDe(ctx, falha!.id)).toMatchObject({ resolucao: 'automatica' });
  });
});

describe('regra 5: alagamento de sensor fecha quando o nível cai abaixo de 80% da altura de alerta', () => {
  it('acima → alerta; entre 80% e 100% continua aberto; abaixo de 80% resolve', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'sensor_alagamento', codigo: 'FOGO-ALG-0001', caracteristicas: { alturaAlertaCm: 30 } });
    const em = new Date('2026-10-17T15:00:00.000Z');
    const [a] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 41 }, em);
    expect(a).toMatchObject({ tipo: 'alagamento' });
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 27 }, em); // 90%: ainda perto
    expect(alertaDe(ctx, a!.id).resolvidoEm).toBeNull();
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 23 }, em); // 77%
    expect(alertaDe(ctx, a!.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, a!.id).resolvidoEm).not.toBeNull();
  });
});

describe('regra 6: furto e manutenção atrasada precisam de humano (manutenção atrasada: salvo a manutenção registrada)', () => {
  it('furto_suspeito segue aberto depois de 1 hora de simulação', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 5 });
    sim.passo();
    const [furto] = sim.injetar('furto');
    expect(furto).toMatchObject({ tipo: 'furto_suspeito' });
    for (let i = 0; i < 30; i++) {
      avancar(ctx, 2 * MIN);
      sim.passo();
    }
    expect(alertaDe(ctx, furto!.id).resolvidoEm).toBeNull();
  });

  it('POST de manutenção concluída resolve manutencao_atrasada', async () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0200', ultimoSinalEm: '2026-10-17T14:59:00.000Z', proximaManutencao: '2026-10-10' });
    const [atrasada] = ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(atrasada).toMatchObject({ tipo: 'manutencao_atrasada' });
    // Ainda sem manutenção: uma nova varredura não fecha.
    ctx.motor.varrer(new Date('2026-10-17T15:01:00.000Z'));
    expect(alertaDe(ctx, atrasada!.id).resolvidoEm).toBeNull();
    app = await criarApp(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/equipamentos/${id}/manutencoes`, payload: { tipo: 'preventiva', descricao: 'Revisão periódica', concluidaEm: ctx.relogio.agora().toISOString() } });
    expect(r.statusCode).toBe(201);
    expect(alertaDe(ctx, atrasada!.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, atrasada!.id).resolvidoEm).not.toBeNull();
  });
});

describe('regra 7: origem da resolução', () => {
  it('PATCH /api/alertas/:id/resolver grava "manual" e emite o evento', async () => {
    const ctx = criarCtxDeTeste();
    const a = inserirAlerta(ctx.db, { tipo: 'furto_suspeito', criticidade: 'critica', titulo: 't', descricao: 'd', criadoEm: '2026-10-17T14:00:00.000Z' });
    app = await criarApp(ctx);
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    const r = await app.inject({ method: 'PATCH', url: `/api/alertas/${a.id}/resolver` });
    expect(r.json()).toMatchObject({ resolucao: 'manual' });
    expect(alertaDe(ctx, a.id).resolucao).toBe('manual');
    expect(eventos.some((e) => e.tipo === 'alerta' && e.dados.id === a.id && e.dados.resolucao === 'manual')).toBe(true);
  });

  it('migração é idempotente e acrescenta a coluna a bancos antigos', async () => {
    const { abrirBanco } = await import('../db/conexao');
    const { migrar } = await import('../db/migrar');
    const db = abrirBanco(':memory:');
    migrar(db);
    db.exec('ALTER TABLE alertas DROP COLUMN resolucao'); // banco criado antes da 11b
    migrar(db);
    migrar(db);
    const colunas = (db.prepare("PRAGMA table_info('alertas')").all() as { name: string }[]).filter((c) => c.name === 'resolucao');
    expect(colunas).toHaveLength(1);
  });
});

describe('regra 9: limpeza de legado', () => {
  it('alerta de ocorrência cuja ocorrência já tem fim é resolvido na partida (simulador) como automática', () => {
    const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' });
    const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
    const o = inserirOcorrencia(ctx.db, { tipo: 'acidente', gravidade: 3, bairroId: b.id, lat: b.lat, lng: b.lng, inicio: '2026-10-10T10:00:00.000Z', descricao: 'Colisão', chuva: false, origem: 'tempo_real' });
    ctx.db.prepare('UPDATE ocorrencias SET fim = ? WHERE id = ?').run('2026-10-10T10:30:00.000Z', o.id);
    const a = inserirAlerta(ctx.db, { tipo: 'acidente', criticidade: 'alta', titulo: 'Acidente', descricao: 'd', criadoEm: '2026-10-10T10:00:00.000Z', chaveDedup: `ocorrencia:${o.id}` });
    new Simulador(ctx, { semente: 1 }).passo();
    expect(alertaDe(ctx, a.id)).toMatchObject({ resolucao: 'automatica' });
    expect(alertaDe(ctx, a.id).resolvidoEm).not.toBeNull();
  });

  it('o motor expõe a limpeza para ser chamada direto no start', () => {
    const ctx = criarCtxDeTeste();
    const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
    const o = inserirOcorrencia(ctx.db, { tipo: 'congestionamento', gravidade: 2, bairroId: b.id, lat: b.lat, lng: b.lng, inicio: '2026-10-10T10:00:00.000Z', descricao: 'Fila', chuva: false, origem: 'tempo_real' });
    ctx.db.prepare('UPDATE ocorrencias SET fim = ? WHERE id = ?').run('2026-10-10T10:30:00.000Z', o.id);
    inserirAlerta(ctx.db, { tipo: 'congestionamento', criticidade: 'media', titulo: 'Cong', descricao: 'd', criadoEm: '2026-10-10T10:00:00.000Z', chaveDedup: `ocorrencia:${o.id}` });
    expect(ctx.motor.resolverAlertasDeOcorrenciasEncerradas()).toBe(1);
    expect(abertos(ctx)).toBe(0);
  });
});

describe('equilíbrio', () => {
  it('2 horas a 60× (passos de 2 s, sem timers) terminam com menos de 40 alertas abertos', () => {
    const ctx = cidadezinha();
    const sim = new Simulador(ctx, { semente: 31 });
    sim.definir({ velocidade: 60 });
    for (let i = 0; i < (2 * HORA) / 2000; i++) {
      sim.passo();
      avancar(ctx, 2000);
    }
    const total = (ctx.db.prepare('SELECT COUNT(*) AS n FROM alertas').get() as { n: number }).n;
    expect(total).toBeGreaterThan(20); // houve movimento de verdade
    expect(abertos(ctx)).toBeLessThan(40);
  }, 120_000);
});
