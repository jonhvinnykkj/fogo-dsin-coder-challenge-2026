import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { REGIOES, TURNOS } from '../../shared/dominio';
import { dentroDeMarilia } from '../../shared/geo';
import { schemaCaracteristicas, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { AGORA_PADRAO, criarCtxDeTeste, type CtxDeTeste } from '../test/ctx';
import { gerarCidade } from './cidade';
import { preencherLacuna, semear, SEMENTE_PADRAO } from './semear';

const AGORA = new Date(AGORA_PADRAO);
const HORA = 3_600_000;

const n = (db: Database, sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;

function hashCidade(db: Database): string {
  const linhas = db.prepare('SELECT codigo, numero_serie, lat, lng FROM equipamentos ORDER BY codigo').all() as {
    codigo: string; numero_serie: string; lat: number; lng: number;
  }[];
  return createHash('sha256').update(linhas.map((l) => `${l.codigo}|${l.numero_serie}|${l.lat}|${l.lng}`).join('\n')).digest('hex');
}

function hashOcorrencias(db: Database): string {
  const linhas = db.prepare('SELECT tipo, bairro_id, inicio, gravidade, agente_id FROM ocorrencias ORDER BY inicio, bairro_id, tipo').all();
  return createHash('sha256').update(JSON.stringify(linhas)).digest('hex');
}

// Dois bancos com a mesma semente: o primeiro serve aos testes de cidade, o segundo ao hash e à lacuna.
let a: CtxDeTeste;
let b: CtxDeTeste;
let resultado: ReturnType<typeof semear>;

beforeAll(() => {
  a = criarCtxDeTeste();
  resultado = semear(a.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: a.geo });
  b = criarCtxDeTeste();
  semear(b.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: b.geo });
}, 120_000);

describe('semear', () => {
  it('cria a cidade num banco vazio: 300 a 400 equipamentos e 60 a 100 agentes', () => {
    expect(resultado.criado).toBe(true);
    const equipamentos = n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos');
    const agentes = n(a.db, 'SELECT COUNT(*) AS n FROM agentes');
    expect(equipamentos).toBeGreaterThanOrEqual(300);
    expect(equipamentos).toBeLessThanOrEqual(400);
    expect(agentes).toBeGreaterThanOrEqual(60);
    expect(agentes).toBeLessThanOrEqual(100);
    expect(n(a.db, 'SELECT COUNT(DISTINCT tipo) AS n FROM equipamentos')).toBe(13);
    expect(n(a.db, 'SELECT COUNT(*) AS n FROM ocorrencias')).toBeGreaterThan(10_000);
  });

  it('põe toda coordenada (base, atual e de ocorrência) dentro de Marília', () => {
    const pontos = [
      ...(a.db.prepare('SELECT lat, lng FROM equipamentos UNION ALL SELECT lat_atual, lng_atual FROM equipamentos').all() as { lat: number; lng: number }[]),
      ...(a.db.prepare('SELECT lat, lng FROM agentes UNION ALL SELECT lat_atual, lng_atual FROM agentes').all() as { lat: number; lng: number }[]),
      ...(a.db.prepare('SELECT lat, lng FROM ocorrencias').all() as { lat: number; lng: number }[]),
    ];
    const fora = pontos.filter((p) => !dentroDeMarilia(p.lat, p.lng));
    expect(fora).toEqual([]);
  });

  it('gera números de série e códigos únicos, no formato FOGO-<SIGLA>-0000', () => {
    expect(n(a.db, 'SELECT COUNT(DISTINCT numero_serie) AS n FROM equipamentos')).toBe(n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos'));
    const codigos = (a.db.prepare('SELECT codigo FROM equipamentos').all() as { codigo: string }[]).map((l) => l.codigo);
    expect(codigos.every((c) => /^FOGO-[A-Z]{3}-\d{4}$/.test(c))).toBe(true);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM equipamentos WHERE codigo = 'FOGO-RAD-0001'")).toBe(1);
  });

  it('gera características que passam no schema de cada tipo e CEP de Marília', () => {
    const linhas = a.db.prepare('SELECT tipo, caracteristicas, cep FROM equipamentos').all() as { tipo: TipoEquipamentoId; caracteristicas: string; cep: string }[];
    for (const l of linhas) {
      const r = schemaCaracteristicas(l.tipo).safeParse(JSON.parse(l.caracteristicas));
      expect(r.success, `${l.tipo}: ${l.caracteristicas}`).toBe(true);
      expect(l.cep >= '17500-000' && l.cep <= '17539-999', l.cep).toBe(true);
    }
  });

  it('segue a distribuição de situações (~82% operacional) e põe equipamento em todo bairro', () => {
    const total = n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos');
    const pct = (s: string) => (100 * n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos WHERE situacao = ?', s)) / total;
    expect(pct('operacional')).toBeGreaterThan(78);
    expect(pct('operacional')).toBeLessThan(86);
    for (const s of ['mau_funcionamento', 'em_manutencao', 'nao_instalado', 'desativado', 'furtado']) {
      expect(pct(s), s).toBeGreaterThan(0.5);
      expect(pct(s), s).toBeLessThan(9);
    }
    expect(n(a.db, 'SELECT COUNT(*) AS n FROM bairros WHERE id NOT IN (SELECT bairro_id FROM equipamentos)')).toBe(0);
  });

  it('tem manutenções atrasadas e imediatas, e o mau funcionamento pede manutenção imediata', () => {
    const hoje = '2026-10-17';
    expect(n(a.db, `SELECT COUNT(*) AS n FROM equipamentos WHERE situacao NOT IN ('desativado','nao_instalado')
      AND manutencao_necessidade <> 'imediata' AND proxima_manutencao < ?`, hoje)).toBeGreaterThan(5);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM equipamentos WHERE manutencao_necessidade = 'imediata'")).toBeGreaterThan(5);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM equipamentos WHERE situacao = 'mau_funcionamento' AND manutencao_necessidade <> 'imediata'")).toBe(0);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM equipamentos WHERE manutencao_necessidade = 'periodica' AND (proxima_manutencao IS NULL OR manutencao_periodicidade_dias IS NULL)")).toBe(0);
  });

  it('tem agentes das 3 categorias em toda região e todo turno, e só quem está no turno trabalha', () => {
    expect(n(a.db, 'SELECT COUNT(DISTINCT categoria) AS n FROM agentes')).toBe(3);
    for (const regiao of REGIOES) {
      for (const turno of TURNOS) {
        const qtd = n(a.db, 'SELECT COUNT(*) AS n FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id WHERE b.regiao = ? AND a.turno = ?', regiao, turno);
        expect(qtd, `${regiao} × ${turno}`).toBeGreaterThan(0);
      }
    }
    // AGORA_PADRAO = 12 h em Marília: turno da manhã trabalha, noite e madrugada estão fora.
    expect(n(a.db, "SELECT COUNT(*) AS n FROM agentes WHERE turno IN ('noite','madrugada','tarde') AND situacao <> 'fora_de_servico'")).toBe(0);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM agentes WHERE turno = 'manha' AND situacao = 'fora_de_servico'")).toBe(0);
  });

  it('vincula motos a agentes de trânsito e viaturas a guardas/PM', () => {
    const vinculos = a.db.prepare(
      'SELECT a.categoria, e.tipo FROM agentes a JOIN equipamentos e ON e.id = a.equipamento_id',
    ).all() as { categoria: string; tipo: string }[];
    expect(vinculos.length).toBeGreaterThan(15);
    for (const v of vinculos) {
      if (v.tipo === 'moto_agente') expect(v.categoria).toBe('agente_transito');
      else expect(v.tipo === 'viatura' && v.categoria !== 'agente_transito').toBe(true);
    }
  });

  it('liga boa parte das ocorrências a um agente de turno da mesma região', () => {
    const total = n(a.db, 'SELECT COUNT(*) AS n FROM ocorrencias');
    const comAgente = n(a.db, 'SELECT COUNT(*) AS n FROM ocorrencias WHERE agente_id IS NOT NULL');
    expect(comAgente / total).toBeGreaterThan(0.5);
    const outraRegiao = n(a.db, `SELECT COUNT(*) AS n FROM ocorrencias o JOIN agentes a ON a.id = o.agente_id
      JOIN bairros bo ON bo.id = o.bairro_id JOIN bairros ba ON ba.id = a.base_bairro_id WHERE bo.regiao <> ba.regiao`);
    expect(outraRegiao).toBe(0);
  });

  it('grava telemetria horária com hora ISO UTC de minutos zerados até a hora anterior a agora', () => {
    expect(n(a.db, "SELECT COUNT(*) AS n FROM telemetria_hora WHERE hora NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:00:00.000Z'")).toBe(0);
    const max = (a.db.prepare('SELECT MAX(hora) AS m FROM telemetria_hora').get() as { m: string }).m;
    expect(max).toBe(new Date(AGORA.getTime() - HORA).toISOString());
    const min = (a.db.prepare('SELECT MIN(hora) AS m FROM telemetria_hora').get() as { m: string }).m;
    expect(min).toBe(new Date(AGORA.getTime() - 60 * 24 * HORA).toISOString());
    expect(n(a.db, 'SELECT COUNT(*) AS n FROM telemetria_hora WHERE online_min < 0 OR online_min > 60')).toBe(0);
    expect(n(a.db, "SELECT COUNT(*) AS n FROM telemetria_hora t JOIN equipamentos e ON e.id = t.equipamento_id WHERE e.situacao = 'nao_instalado'")).toBe(0);
  });

  it('marca em meta.historico_ate a última hora de histórico gerada', () => {
    const marca = (a.db.prepare("SELECT valor FROM meta WHERE chave = 'historico_ate'").get() as { valor: string }).valor;
    expect(marca).toBe(new Date(AGORA.getTime() - HORA).toISOString());
  });

  it('não faz nada na segunda chamada', () => {
    const antes = [n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos'), n(a.db, 'SELECT COUNT(*) AS n FROM agentes'), n(a.db, 'SELECT COUNT(*) AS n FROM ocorrencias')];
    const segunda = semear(a.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: a.geo });
    expect(segunda.criado).toBe(false);
    const depois = [n(a.db, 'SELECT COUNT(*) AS n FROM equipamentos'), n(a.db, 'SELECT COUNT(*) AS n FROM agentes'), n(a.db, 'SELECT COUNT(*) AS n FROM ocorrencias')];
    expect(depois).toEqual(antes);
    expect(preencherLacuna(a.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: a.geo }).horasGeradas).toBe(0);
  });

  it('é determinística: mesma semente em dois bancos dá o mesmo hash', () => {
    expect(hashCidade(b.db)).toBe(hashCidade(a.db));
    expect(hashOcorrencias(b.db)).toBe(hashOcorrencias(a.db));
    const tokens = (db: Database) => (db.prepare('SELECT token_dispositivo AS t FROM equipamentos ORDER BY id').all() as { t: string }[]).map((l) => l.t);
    expect(tokens(b.db)).toEqual(tokens(a.db));
    expect(tokens(a.db).every((t) => /^[0-9a-f]{32}$/.test(t))).toBe(true);
  });

  it('gera a mesma cidade (códigos, modelos, posições e situações) a qualquer hora em que for semeada', () => {
    const ids = new Map((a.db.prepare('SELECT id, nome FROM bairros').all() as { id: number; nome: string }[]).map((l) => [l.nome, l.id]));
    const resumo = (agora: Date) =>
      gerarCidade(a.geo, ids, { semente: SEMENTE_PADRAO, agora }).equipamentos.map((e) => `${e.codigo}|${e.marca}|${e.modelo}|${e.lat}|${e.lng}|${e.situacao}`);
    // 12 h e 19 h em Marília: turnos diferentes em serviço.
    expect(resumo(new Date(AGORA.getTime() + 7 * HORA))).toEqual(resumo(AGORA));
  });
});

describe('preencherLacuna', () => {
  it('três dias depois gera ~72 horas sem duplicar ocorrências e estende a previsão do tempo', () => {
    const depois = new Date(AGORA.getTime() + 72 * HORA);
    const ocorrenciasAntes = n(b.db, 'SELECT COUNT(*) AS n FROM ocorrencias');
    const r = preencherLacuna(b.db, { agora: depois, semente: SEMENTE_PADRAO, geo: b.geo });
    expect(r.horasGeradas).toBeGreaterThanOrEqual(71);
    expect(r.horasGeradas).toBeLessThanOrEqual(73);
    expect(n(b.db, 'SELECT COUNT(*) AS n FROM ocorrencias')).toBeGreaterThan(ocorrenciasAntes + 300);

    const duplicadas = n(b.db, 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM ocorrencias GROUP BY inicio, bairro_id, tipo HAVING COUNT(*) > 1)');
    expect(duplicadas).toBe(0);
    const max = (b.db.prepare('SELECT MAX(hora) AS m FROM telemetria_hora').get() as { m: string }).m;
    expect(max).toBe(new Date(depois.getTime() - HORA).toISOString());
    // Sem buraco: toda hora entre o fim da semente e o fim da lacuna tem telemetria.
    expect(n(b.db, 'SELECT COUNT(DISTINCT hora) AS n FROM telemetria_hora WHERE hora >= ?', AGORA.toISOString())).toBe(72);

    // A previsão de 7 dias anda junto e os dias que passaram deixam de ser previsão.
    expect(n(b.db, 'SELECT COUNT(*) AS n FROM clima_dia WHERE previsto = 1')).toBe(7);
    expect(n(b.db, "SELECT COUNT(*) AS n FROM clima_dia WHERE previsto = 1 AND data <= '2026-10-20'")).toBe(0);

    expect((b.db.prepare("SELECT valor FROM meta WHERE chave = 'historico_ate'").get() as { valor: string }).valor).toBe(new Date(depois.getTime() - HORA).toISOString());

    // Rodar de novo no mesmo instante não gera nada.
    expect(preencherLacuna(b.db, { agora: depois, semente: SEMENTE_PADRAO, geo: b.geo }).horasGeradas).toBe(0);
    expect(n(b.db, 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM ocorrencias GROUP BY inicio, bairro_id, tipo HAVING COUNT(*) > 1)')).toBe(0);
  });

  it('em banco antigo, sem a marca em meta, recomeça da última hora de telemetria', () => {
    const antigo = criarCtxDeTeste();
    semear(antigo.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: antigo.geo });
    antigo.db.prepare("DELETE FROM meta WHERE chave = 'historico_ate'").run();
    const r = preencherLacuna(antigo.db, { agora: new Date(AGORA.getTime() + 5 * HORA), semente: SEMENTE_PADRAO, geo: antigo.geo });
    expect(r.horasGeradas).toBe(5);
    expect(n(antigo.db, 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM ocorrencias GROUP BY inicio, bairro_id, tipo HAVING COUNT(*) > 1)')).toBe(0);
  }, 60_000);

  it('em banco vazio não gera nada', () => {
    const vazio = criarCtxDeTeste();
    expect(preencherLacuna(vazio.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: vazio.geo }).horasGeradas).toBe(0);
  });
});
