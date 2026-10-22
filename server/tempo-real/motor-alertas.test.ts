import { describe, expect, it } from 'vitest';
import { resolverAlerta } from '../repositorios/alertas';
import { criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste, inserirTelemetriaDeTeste } from '../test/fabricas';
import { alvoPorCodigo } from './motor-alertas';
import type { EventoFogo } from '../../shared/modelos';

// Quarta-feira 14/10/2026, 18 h em Marília (21 h UTC): pico da tarde.
const QUARTA_18H = '2026-10-14T21:20:00.000Z';

function cidadeComRadar(): { ctx: CtxDeTeste; id: number } {
  const ctx = criarCtxDeTeste({ agora: QUARTA_18H });
  const id = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0012', ultimoSinalEm: '2026-10-14T21:19:00.000Z' });
  // Histórico das 18 h nos dias úteis anteriores: fluxo entre 360 e 440 (média 400).
  ['2026-10-13', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-02', '2026-10-01'].forEach((d, i) => {
    inserirTelemetriaDeTeste(ctx, id, `${d}T21:00:00.000Z`, { fluxo: i % 2 ? 440 : 360, velocidadeMedia: 38, infracoes: 3 });
  });
  return { ctx, id };
}

const alvo = (ctx: CtxDeTeste, codigo: string) => alvoPorCodigo(ctx.db, codigo)!;
const abertos = (ctx: CtxDeTeste, tipo: string) =>
  (ctx.db.prepare('SELECT COUNT(*) AS n FROM alertas WHERE tipo = ? AND resolvido_em IS NULL').get(tipo) as { n: number }).n;

describe('MotorAlertas.avaliarLeitura', () => {
  it('duas leituras anômalas seguidas do mesmo radar geram um só alerta aberto (dedup)', () => {
    const { ctx } = cidadeComRadar();
    const em = new Date(QUARTA_18H);
    const primeira = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0, velocidadeMedia: 0, infracoes: 0 }, em);
    const segunda = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0, velocidadeMedia: 0, infracoes: 0 }, em);
    expect(primeira).toHaveLength(1);
    expect(segunda).toHaveLength(0);
    expect(abertos(ctx, 'anomalia_leitura')).toBe(1);

    // Radar zerado no pico: criticidade alta, e o texto diz o quê, onde e por quê.
    const a = primeira[0]!;
    expect(a.criticidade).toBe('alta');
    expect(a.titulo).toContain('FOGO-RAD-0012');
    expect(a.titulo).toContain('sem leituras às 18h');
    expect(a.descricao).toContain('400');
    expect(a.descricao).toContain('veículos/h');
    expect(a.descricao).toContain('Avenida Sampaio Vidal');
    expect(a.equipamentoId).toBeDefined();
  });

  it('depois de resolvido, uma nova anomalia abre um novo alerta', () => {
    const { ctx } = cidadeComRadar();
    const em = new Date(QUARTA_18H);
    const [a] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0 }, em);
    resolverAlerta(ctx.db, a!.id, QUARTA_18H);
    const nova = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0 }, em);
    expect(nova).toHaveLength(1);
    expect(nova[0]!.id).not.toBe(a!.id);
    expect(abertos(ctx, 'anomalia_leitura')).toBe(1);
  });

  it('leitura normal não gera nada; queda sem zerar, ou fora do pico, é de criticidade média', () => {
    const { ctx } = cidadeComRadar();
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 405, velocidadeMedia: 38, infracoes: 3 }, new Date(QUARTA_18H))).toHaveLength(0);
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 40 }, new Date(QUARTA_18H))).toHaveLength(0); // moderada: espera a confirmação
    const [a] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 40 }, new Date(QUARTA_18H));
    expect(a!.criticidade).toBe('media'); // 40 contra 400 é queda forte, mas só zerado no pico vira alta
    const ctx2 = criarCtxDeTeste({ agora: QUARTA_18H });
    const id2 = inserirEquipamentoDeTeste(ctx2, { tipo: 'radar', codigo: 'FOGO-RAD-0002' });
    ['2026-10-13', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'].forEach((d, i) =>
      inserirTelemetriaDeTeste(ctx2, id2, `${d}T18:00:00.000Z`, { fluxo: i % 2 ? 44 : 36 })); // 15 h local
    const [b] = ctx2.motor.avaliarLeitura(alvoPorCodigo(ctx2.db, 'FOGO-RAD-0002')!, { fluxo: 200 }, new Date('2026-10-14T18:20:00.000Z'));
    expect(b!.criticidade).toBe('media');
  });

  it('desvio moderado (3 a 6 sigmas) só alerta na segunda leitura seguida; leitura normal no meio zera a contagem', () => {
    const { ctx } = cidadeComRadar();
    const em = new Date(QUARTA_18H);
    const a = alvo(ctx, 'FOGO-RAD-0012');
    // média 400; o desvio usado é no mínimo 20% da média (80): 650 está a ~3 desvios.
    expect(ctx.motor.avaliarLeitura(a, { fluxo: 650 }, em)).toHaveLength(0);
    expect(ctx.motor.avaliarLeitura(a, { fluxo: 400 }, em)).toHaveLength(0); // voltou ao normal: zera
    expect(ctx.motor.avaliarLeitura(a, { fluxo: 650 }, em)).toHaveLength(0);
    const [alerta] = ctx.motor.avaliarLeitura(a, { fluxo: 655 }, em);
    expect(alerta).toMatchObject({ tipo: 'anomalia_leitura', criticidade: 'media' });
    expect(alerta!.descricao).toContain('acima do normal');
    expect(ctx.motor.avaliarLeitura(a, { fluxo: 660 }, em)).toHaveLength(0); // dedup
  });

  it('desvio forte (6 sigmas ou mais) alerta na primeira leitura', () => {
    const { ctx } = cidadeComRadar();
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 900 }, new Date(QUARTA_18H))).toHaveLength(1);
  });

  it('equipamento já em mau funcionamento não abre "leitura fora do normal" (a falha já é conhecida)', () => {
    const { ctx } = cidadeComRadar();
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'mau_funcionamento' WHERE codigo = 'FOGO-RAD-0012'").run();
    const a = alvo(ctx, 'FOGO-RAD-0012');
    expect(ctx.motor.avaliarLeitura(a, { fluxo: 0, velocidadeMedia: 0, infracoes: 0 }, new Date(QUARTA_18H))).toHaveLength(0);
    expect(abertos(ctx, 'anomalia_leitura')).toBe(0);
    // Operacional, a mesma leitura continua sendo anomalia.
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'operacional' WHERE codigo = 'FOGO-RAD-0012'").run();
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0 }, new Date(QUARTA_18H))).toHaveLength(1);
  });

  it('sem histórico suficiente não inventa anomalia', () => {
    const ctx = criarCtxDeTeste({ agora: QUARTA_18H });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0003' });
    expect(ctx.motor.avaliarLeitura(alvoPorCodigo(ctx.db, 'FOGO-RAD-0003')!, { fluxo: 0 }, new Date(QUARTA_18H))).toHaveLength(0);
  });

  it('patinete com posição fora de Marília gera furto_suspeito crítico, uma vez só', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'patinete', codigo: 'FOGO-PAT-0007' });
    const fora = { lat: -22.4, lng: -49.5 };
    const [a, ...resto] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-PAT-0007'), { bateria: 70, emUso: 0 }, new Date('2026-10-17T15:00:00.000Z'), fora);
    expect(resto).toHaveLength(0);
    expect(a).toMatchObject({ tipo: 'furto_suspeito', criticidade: 'critica' });
    expect(a!.titulo).toContain('FOGO-PAT-0007');
    expect(a!.descricao).toMatch(/fora d[eo] (limite|município)/i);
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-PAT-0007'), { bateria: 70 }, new Date('2026-10-17T15:00:30.000Z'), fora)).toHaveLength(0);
  });

  it('sensor acima da altura de alerta gera alagamento crítico e resolve quando a água baixa', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'sensor_alagamento', codigo: 'FOGO-ALG-0001', caracteristicas: { alturaAlertaCm: 30 } });
    const em = new Date('2026-10-17T15:00:00.000Z');
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 12 }, em)).toHaveLength(0);
    const [a] = ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 41 }, em);
    expect(a).toMatchObject({ tipo: 'alagamento', criticidade: 'critica' });
    expect(a!.descricao).toContain('41');
    expect(a!.descricao).toContain('30');
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 45 }, em)).toHaveLength(0);
    expect(abertos(ctx, 'alagamento')).toBe(1);
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0001'), { nivelCm: 5 }, em);
    expect(abertos(ctx, 'alagamento')).toBe(0);
  });

  it('não avalia equipamento que não está operando (em manutenção)', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'sensor_alagamento', codigo: 'FOGO-ALG-0002', situacao: 'em_manutencao', caracteristicas: { alturaAlertaCm: 30 } });
    expect(ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-ALG-0002'), { nivelCm: 99 }, new Date('2026-10-17T15:00:00.000Z'))).toHaveLength(0);
  });
});

describe('MotorAlertas.varrer', () => {
  it('equipamento operacional sem sinal há 20 min gera sem_sinal (alta); com sinal há 5 min não', () => {
    const ctx = criarCtxDeTeste(); // 15:00 UTC
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0100', ultimoSinalEm: '2026-10-17T14:40:00.000Z' });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0101', ultimoSinalEm: '2026-10-17T14:55:00.000Z' });
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0102', situacao: 'desativado', ultimoSinalEm: '2026-10-10T14:40:00.000Z' });
    const alertas = ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    const semSinal = alertas.filter((a) => a.tipo === 'sem_sinal');
    expect(semSinal).toHaveLength(1);
    expect(semSinal[0]).toMatchObject({ criticidade: 'alta' });
    expect(semSinal[0]!.titulo).toContain('FOGO-RAD-0100');
    expect(semSinal[0]!.descricao).toContain('20 min');
    expect(ctx.motor.varrer(new Date('2026-10-17T15:00:10.000Z')).filter((a) => a.tipo === 'sem_sinal')).toHaveLength(0); // dedup
  });

  it('o sinal que volta resolve o alerta sem_sinal', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0100', ultimoSinalEm: '2026-10-17T14:40:00.000Z' });
    ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(abertos(ctx, 'sem_sinal')).toBe(1);
    ctx.db.prepare("UPDATE equipamentos SET ultimo_sinal_em = '2026-10-17T15:01:00.000Z'").run();
    ctx.motor.varrer(new Date('2026-10-17T15:02:00.000Z'));
    expect(abertos(ctx, 'sem_sinal')).toBe(0);
  });

  it('manutenção com data vencida gera manutencao_atrasada (média) e para de alertar quando for feita', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0200', ultimoSinalEm: '2026-10-17T14:59:00.000Z', proximaManutencao: '2026-10-10' });
    const [a] = ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(a).toMatchObject({ tipo: 'manutencao_atrasada', criticidade: 'media' });
    expect(a!.descricao).toContain('7 dias');
    expect(a!.descricao).toContain('10/10/2026');
    ctx.db.prepare("UPDATE equipamentos SET proxima_manutencao = '2027-01-10'").run();
    ctx.motor.varrer(new Date('2026-10-17T15:01:00.000Z'));
    expect(abertos(ctx, 'manutencao_atrasada')).toBe(0);
  });

  it('equipamento furtado ou desativado não gera manutencao_atrasada, e o alerta já aberto se fecha', () => {
    const ctx = criarCtxDeTeste();
    const furtado = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0201', ultimoSinalEm: '2026-10-17T14:59:00.000Z', proximaManutencao: '2026-10-10' });
    const desativado = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0202', ultimoSinalEm: '2026-10-17T14:59:00.000Z', proximaManutencao: '2026-10-10' });
    ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(abertos(ctx, 'manutencao_atrasada')).toBe(2);
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'furtado' WHERE id = ?").run(furtado);
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'desativado' WHERE id = ?").run(desativado);
    ctx.motor.varrer(new Date('2026-10-17T15:01:00.000Z'));
    expect(abertos(ctx, 'manutencao_atrasada')).toBe(0);
    // E um furtado que nasce com a data vencida nem chega a abrir alerta.
    const novo = inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0203', ultimoSinalEm: '2026-10-17T14:59:00.000Z', proximaManutencao: '2026-10-01' });
    ctx.db.prepare("UPDATE equipamentos SET situacao = 'furtado' WHERE id = ?").run(novo);
    ctx.motor.varrer(new Date('2026-10-17T15:02:00.000Z'));
    expect(abertos(ctx, 'manutencao_atrasada')).toBe(0);
  });

  it('patinete com posição atual fora de Marília gera furto_suspeito crítico', () => {
    const ctx = criarCtxDeTeste();
    const id = inserirEquipamentoDeTeste(ctx, { tipo: 'patinete', codigo: 'FOGO-PAT-0300', ultimoSinalEm: '2026-10-17T14:59:00.000Z' });
    ctx.db.prepare('UPDATE equipamentos SET lat_atual = -22.6, lng_atual = -49.0 WHERE id = ?').run(id);
    const alertas = ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    expect(alertas.find((a) => a.tipo === 'furto_suspeito')).toMatchObject({ criticidade: 'critica', equipamentoId: id });
  });

  it('anomalia que não se repete há 30 min é resolvida sozinha', () => {
    const { ctx } = cidadeComRadar();
    ctx.motor.avaliarLeitura(alvo(ctx, 'FOGO-RAD-0012'), { fluxo: 0 }, new Date(QUARTA_18H));
    expect(abertos(ctx, 'anomalia_leitura')).toBe(1);
    ctx.motor.varrer(new Date('2026-10-14T21:40:00.000Z'));
    expect(abertos(ctx, 'anomalia_leitura')).toBe(1);
    ctx.motor.varrer(new Date('2026-10-14T22:00:00.000Z'));
    expect(abertos(ctx, 'anomalia_leitura')).toBe(0);
  });

  it('emite o alerta no barramento ao criar e ao resolver', () => {
    const ctx = criarCtxDeTeste();
    inserirEquipamentoDeTeste(ctx, { tipo: 'radar', codigo: 'FOGO-RAD-0100', ultimoSinalEm: '2026-10-17T14:40:00.000Z' });
    const eventos: EventoFogo[] = [];
    ctx.barramento.assinar((e) => eventos.push(e));
    ctx.motor.varrer(new Date('2026-10-17T15:00:00.000Z'));
    ctx.db.prepare("UPDATE equipamentos SET ultimo_sinal_em = '2026-10-17T15:01:00.000Z'").run();
    ctx.motor.varrer(new Date('2026-10-17T15:02:00.000Z'));
    const alertas = eventos.filter((e) => e.tipo === 'alerta');
    expect(alertas).toHaveLength(2);
    expect((alertas[0] as { dados: { resolvidoEm?: string } }).dados.resolvidoEm).toBeUndefined();
    expect((alertas[1] as { dados: { resolvidoEm?: string } }).dados.resolvidoEm).toBeDefined();
  });
});
