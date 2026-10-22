// Os padrões plantados no histórico precisam aparecer nos dados com folga: o motor preditivo (Tarefa 8)
// vai redescobri-los. Um banco semeado uma vez é compartilhado por todos os testes.
import type { Database } from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { distanciaMetros } from '../../shared/geo';
import { METRICA_PRINCIPAL, METRICAS_POR_TIPO } from '../../shared/telemetria';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { AGORA_PADRAO, criarCtxDeTeste } from '../test/ctx';
import { criarRng } from './aleatorio';
import { MODELO_POUCO_CONFIAVEL } from './catalogo-marcas';
import { BAIRROS_FURTO_PATINETE } from './historico';
import { gerarLeituraHora } from './perfis';
import { semear, SEMENTE_PADRAO } from './semear';

const AGORA = new Date(AGORA_PADRAO);
const HORA = 3_600_000;
const DIA = 24 * HORA;
const FUSO = 3 * HORA; // Marília: UTC-3

let db: Database;

beforeAll(() => {
  const ctx = criarCtxDeTeste();
  semear(ctx.db, { agora: AGORA, semente: SEMENTE_PADRAO, geo: ctx.geo });
  db = ctx.db;
}, 120_000);

interface Oc {
  tipo: string;
  inicio: string;
  bairro_id: number;
  regiao: string;
  gravidade: number;
  lat: number;
  lng: number;
}

const ocorrencias = (filtro = '1 = 1', ...p: unknown[]) =>
  db.prepare(`SELECT o.tipo, o.inicio, o.bairro_id, b.regiao, o.gravidade, o.lat, o.lng FROM ocorrencias o
    JOIN bairros b ON b.id = o.bairro_id WHERE ${filtro}`).all(...p) as Oc[];

/** Hora e dia da semana locais (0 = domingo). */
function local(iso: string) {
  const d = new Date(Date.parse(iso) - FUSO);
  return { hora: d.getUTCHours(), minuto: d.getUTCMinutes(), dia: d.getUTCDay(), data: d.toISOString().slice(0, 10) };
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('padrões plantados no histórico de ocorrências', () => {
  it('dias úteis têm picos às 7–9 h e 17–19 h (> 1,5× as outras horas do dia)', () => {
    const porHora = new Array<number>(24).fill(0);
    for (const o of ocorrencias()) {
      const l = local(o.inicio);
      if (l.dia >= 1 && l.dia <= 5) porHora[l.hora]! += 1;
    }
    const picos = [7, 8, 17, 18];
    const outras = [6, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21];
    const razao = media(picos.map((h) => porHora[h]!)) / media(outras.map((h) => porHora[h]!));
    expect(razao).toBeGreaterThan(1.5);
  });

  it('dia de chuva tem ≥ 1,5× os acidentes de um dia seco', () => {
    // Só dias inteiros do histórico (o primeiro e o de hoje estão pela metade).
    const dias = db.prepare("SELECT data, chuva_mm FROM clima_dia WHERE previsto = 0 AND data > '2026-08-18' AND data < '2026-10-17' ORDER BY data")
      .all() as { data: string; chuva_mm: number }[];
    const porDia = new Map<string, number>();
    for (const o of ocorrencias("o.tipo = 'acidente'")) porDia.set(local(o.inicio).data, (porDia.get(local(o.inicio).data) ?? 0) + 1);
    const chuva = dias.filter((d) => d.chuva_mm > 0).map((d) => porDia.get(d.data) ?? 0);
    const seco = dias.filter((d) => d.chuva_mm === 0).map((d) => porDia.get(d.data) ?? 0);
    expect(chuva.length).toBeGreaterThan(5);
    expect(media(chuva) / media(seco)).toBeGreaterThanOrEqual(1.5);
  });

  it('o Centro tem ≥ 2× ocorrências de segurança nas noites de sexta e sábado (20 h–2 h) que nas de segunda a quinta', () => {
    const inicio = AGORA.getTime() - 60 * DIA;
    const fim = AGORA.getTime() - HORA;
    // Noite = 20 h de um dia até 2 h do seguinte; conta só noites inteiras dentro do histórico.
    const noites = { fimDeSemana: 0, semana: 0 };
    const eventos = { fimDeSemana: 0, semana: 0 };
    const grupo = (dia: number) => (dia === 5 || dia === 6 ? 'fimDeSemana' : dia >= 1 && dia <= 4 ? 'semana' : null);
    for (let t = inicio - (inicio % DIA) - DIA; t < fim; t += DIA) {
      const comeco = t + 20 * HORA + FUSO; // 20 h local em UTC
      if (comeco < inicio || comeco + 6 * HORA > fim) continue;
      const g = grupo(new Date(t).getUTCDay());
      if (g) noites[g] += 1;
    }
    for (const o of ocorrencias("o.tipo = 'seguranca' AND b.regiao = 'Centro'")) {
      const l = local(o.inicio);
      if (l.hora < 20 && l.hora >= 2) continue;
      const diaDaNoite = l.hora >= 20 ? l.dia : (l.dia + 6) % 7;
      const g = grupo(diaDaNoite);
      if (g) eventos[g] += 1;
    }
    expect(noites.fimDeSemana).toBeGreaterThan(10);
    const razao = eventos.fimDeSemana / noites.fimDeSemana / (eventos.semana / noites.semana);
    expect(razao).toBeGreaterThanOrEqual(2);
  });

  it('horário escolar tem mais acidentes leves perto dos transportes escolares', () => {
    const escolas = (db.prepare("SELECT lat, lng FROM equipamentos WHERE tipo = 'transporte' AND caracteristicas LIKE '%escolar%'").all() as { lat: number; lng: number }[]);
    expect(escolas.length).toBeGreaterThan(4);
    const minutoDoDia = (l: ReturnType<typeof local>) => l.hora * 60 + l.minuto;
    const janelas = [[390, 450], [690, 810], [1020, 1080]]; // 6:30–7:30, 11:30–13:30, 17–18 h
    const naJanela = (m: number) => janelas.some(([a, b]) => m >= a! && m < b!);
    let dentro = 0;
    let fora = 0;
    for (const o of ocorrencias("o.tipo = 'acidente' AND o.gravidade = 1")) {
      const l = local(o.inicio);
      const m = minutoDoDia(l);
      if (l.dia < 1 || l.dia > 5 || m < 360 || m >= 1200) continue; // dias úteis, 6 h às 20 h
      if (!escolas.some((e) => distanciaMetros(e, o) < 400)) continue;
      if (naJanela(m)) dentro += 1;
      else fora += 1;
    }
    // 4 h de janela contra 10 h fora dela: a taxa por hora dentro precisa ser bem maior.
    expect(dentro / 4).toBeGreaterThan((3 * fora) / 10);
  });

  it(`dois bairros (${BAIRROS_FURTO_PATINETE.join(' e ')}) têm ≥ 2× furtos de patinete por patinete que o resto`, () => {
    const patinetes = db.prepare("SELECT b.nome, COUNT(*) AS n FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id WHERE e.tipo = 'patinete' GROUP BY b.nome")
      .all() as { nome: string; n: number }[];
    const furtos = db.prepare(`SELECT b.nome, COUNT(*) AS n FROM ocorrencias o JOIN equipamentos e ON e.id = o.equipamento_id
      JOIN bairros b ON b.id = o.bairro_id WHERE o.tipo = 'furto_vandalismo' AND e.tipo = 'patinete' GROUP BY b.nome`).all() as { nome: string; n: number }[];
    const soma = (ls: { nome: string; n: number }[], quente: boolean) =>
      ls.filter((l) => BAIRROS_FURTO_PATINETE.includes(l.nome) === quente).reduce((s, l) => s + l.n, 0);
    const taxaQuente = soma(furtos, true) / soma(patinetes, true);
    const taxaResto = soma(furtos, false) / soma(patinetes, false);
    expect(soma(furtos, true)).toBeGreaterThan(5);
    expect(taxaQuente).toBeGreaterThanOrEqual(2 * taxaResto);
  });

  it('cerca de 25% dos dias têm chuva e há 7 dias de previsão', () => {
    const passados = db.prepare('SELECT chuva_mm FROM clima_dia WHERE previsto = 0').all() as { chuva_mm: number }[];
    expect(passados.length).toBeGreaterThanOrEqual(60);
    const fracao = passados.filter((d) => d.chuva_mm > 0).length / passados.length;
    expect(fracao).toBeGreaterThan(0.15);
    expect(fracao).toBeLessThan(0.4);
    expect((db.prepare('SELECT COUNT(*) AS n FROM clima_dia WHERE previsto = 1').get() as { n: number }).n).toBe(7);
  });
});

describe('telemetria', () => {
  it('usa exatamente as métricas de shared/telemetria.ts em cada tipo (normal e falhando)', () => {
    const rng = criarRng(1);
    for (const tipo of Object.keys(METRICAS_POR_TIPO) as TipoEquipamentoId[]) {
      const esperado = METRICAS_POR_TIPO[tipo].map((m) => m.chave).sort();
      for (const falhando of [false, true]) {
        const leitura = gerarLeituraHora(tipo, AGORA, rng, { chuva: false, falhando, bairroFator: 1 });
        expect(Object.keys(leitura).sort(), `${tipo} falhando=${falhando}`).toEqual(esperado);
        expect(Object.values(leitura).every((v) => Number.isFinite(v) && v >= 0), tipo).toBe(true);
      }
      expect(METRICAS_POR_TIPO[tipo].some((m) => m.chave === METRICA_PRINCIPAL[tipo]), tipo).toBe(true);
    }
    const linhas = db.prepare(`SELECT e.tipo, t.metricas FROM telemetria_hora t JOIN equipamentos e ON e.id = t.equipamento_id
      WHERE t.hora = ?`).all(new Date(AGORA.getTime() - 5 * HORA).toISOString()) as { tipo: TipoEquipamentoId; metricas: string }[];
    expect(linhas.length).toBeGreaterThan(250);
    for (const l of linhas) expect(Object.keys(JSON.parse(l.metricas)).sort()).toEqual(METRICAS_POR_TIPO[l.tipo].map((m) => m.chave).sort());
  });
});

describe('padrões plantados nas falhas de equipamento', () => {
  it(`o modelo pouco confiável (${MODELO_POUCO_CONFIAVEL.marca} ${MODELO_POUCO_CONFIAVEL.modelo}) falha ≥ 2× a média dos demais do mesmo tipo`, () => {
    const linhas = db.prepare(`SELECT e.marca, e.modelo,
        (SELECT COUNT(*) FROM historico_situacao h WHERE h.equipamento_id = e.id AND h.para = 'mau_funcionamento') AS falhas
      FROM equipamentos e WHERE e.tipo = ? AND e.instalado_em IS NOT NULL AND e.situacao <> 'desativado'`)
      .all(MODELO_POUCO_CONFIAVEL.tipo) as { marca: string; modelo: string; falhas: number }[];
    const ruim = linhas.filter((l) => l.marca === MODELO_POUCO_CONFIAVEL.marca && l.modelo === MODELO_POUCO_CONFIAVEL.modelo);
    const demais = linhas.filter((l) => !(l.marca === MODELO_POUCO_CONFIAVEL.marca && l.modelo === MODELO_POUCO_CONFIAVEL.modelo));
    expect(ruim.length).toBeGreaterThan(8);
    expect(demais.length).toBeGreaterThan(20);
    expect(media(ruim.map((l) => l.falhas))).toBeGreaterThanOrEqual(2 * media(demais.map((l) => l.falhas)));
  });

  it('toda falha vira manutenção corretiva e a telemetria cai nas horas antes dela', () => {
    const falhas = (db.prepare("SELECT COUNT(*) AS n FROM historico_situacao WHERE para = 'mau_funcionamento'").get() as { n: number }).n;
    const corretivas = (db.prepare("SELECT COUNT(*) AS n FROM manutencoes WHERE tipo = 'corretiva'").get() as { n: number }).n;
    expect(falhas).toBeGreaterThan(50);
    expect(corretivas).toBeGreaterThanOrEqual(falhas);

    const antes = db.prepare(`SELECT AVG(t.online_min) AS m FROM historico_situacao h
      JOIN telemetria_hora t ON t.equipamento_id = h.equipamento_id
       AND t.hora >= strftime('%Y-%m-%dT%H:00:00.000Z', h.em, '-24 hours') AND t.hora < strftime('%Y-%m-%dT%H:00:00.000Z', h.em)
      WHERE h.para = 'mau_funcionamento'`).get() as { m: number };
    const geral = db.prepare('SELECT AVG(online_min) AS m FROM telemetria_hora').get() as { m: number };
    expect(geral.m).toBeGreaterThan(55);
    expect(antes.m).toBeLessThan(geral.m - 5);
  });

  it('tem manutenções preventivas concluídas e equipamentos sem telemetria enquanto furtados ou desativados', () => {
    expect((db.prepare("SELECT COUNT(*) AS n FROM manutencoes WHERE tipo = 'preventiva' AND concluida_em IS NOT NULL").get() as { n: number }).n).toBeGreaterThan(50);
    // Um patinete furtado hoje pode ter sido furtado e recuperado antes: vale a última mudança para a situação atual.
    const depoisDaUltima = (situacao: string) => (db.prepare(`SELECT COUNT(*) AS n FROM equipamentos e
      JOIN (SELECT equipamento_id, MAX(em) AS em FROM historico_situacao WHERE para = ? GROUP BY equipamento_id) h ON h.equipamento_id = e.id
      JOIN telemetria_hora t ON t.equipamento_id = e.id AND t.hora > h.em WHERE e.situacao = ?`).get(situacao, situacao) as { n: number }).n;
    expect((db.prepare("SELECT COUNT(*) AS n FROM equipamentos WHERE situacao IN ('furtado', 'desativado')").get() as { n: number }).n).toBeGreaterThan(5);
    expect(depoisDaUltima('furtado')).toBe(0);
    expect(depoisDaUltima('desativado')).toBe(0);
  });

  it('sensor de alagamento: chuva comum de 9 mm só molha (abaixo de qualquer altura de alerta); temporal de 40 mm alaga no pico', () => {
    // Alturas de alerta da semente: 20 a 50 cm. A escala do bairro vai de 0,6 a 1,5.
    const rng = criarRng(3);
    const pico = new Date('2026-10-14T19:00:00.000Z'); // 16 h em São Paulo: o pico do perfil de tempestade
    for (const escala of [0.6, 1, 1.5]) {
      for (let i = 0; i < 40; i++) {
        const fraca = gerarLeituraHora('sensor_alagamento', pico, rng, { chuva: true, chuvaMm: 9.3, falhando: false, bairroFator: escala });
        expect(fraca.nivelCm, `9,3 mm, escala ${escala}`).toBeLessThan(20);
      }
      const temporal = gerarLeituraHora('sensor_alagamento', pico, rng, { chuva: true, chuvaMm: 40, falhando: false, bairroFator: escala });
      expect(temporal.nivelCm, `40 mm, escala ${escala}`).toBeGreaterThan(20);
    }
  });
});
