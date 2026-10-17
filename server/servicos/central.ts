// Central de operações: indicadores, pontos do mapa, situação das regiões e ocorrências recentes.
// Funções puras (recebem `db`, filtros e `agora`); as rotas só validam a query e chamam daqui.
// "Hoje" é a data de São Paulo (dataLocal); "últimas 3 h" conta a partir de `agora`.
import type { Database } from 'better-sqlite3';
import { REGIOES, agenteEmAtividade, contaNaDisponibilidade, estaIndisponivel } from '../../shared/dominio';
import type { Criticidade, NecessidadeManutencao, Orgao, Regiao, SituacaoAgente, SituacaoEquipamento, TipoOcorrencia } from '../../shared/dominio';
import type { FiltrosCentral } from '../../shared/schemas';
import type {
  AgenteMapa, EquipamentoMapa, Indicadores, NivelAtencao, StatusBairro, StatusRegiao,
} from '../../shared/modelos';
import { formatarNumero } from '../../shared/formato';
import { NOME_DO_TIPO, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { posicaoNoMapa, situacaoDaManutencao } from '../repositorios/equipamentos';
import { dataLocal } from '../tempo';

const HORA_MS = 3_600_000;
const JANELA_OCORRENCIAS_H = 3;

// ---- Filtros ----------------------------------------------------------------------------------------------------

interface Clausula {
  onde: string;
  params: unknown[];
}

/** Filtros que valem para equipamentos (tabela `e` + bairro `b`). A manutenção é decidida depois, em JS. */
function clausulaEquipamentos(f: FiltrosCentral): Clausula {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.tipo?.length) { cond.push(`e.tipo IN (${f.tipo.map(() => '?').join(',')})`); params.push(...f.tipo); }
  if (f.situacao?.length) { cond.push(`e.situacao IN (${f.situacao.map(() => '?').join(',')})`); params.push(...f.situacao); }
  if (f.bairroId) { cond.push('e.bairro_id = ?'); params.push(f.bairroId); }
  if (f.regiao) { cond.push('b.regiao = ?'); params.push(f.regiao); }
  if (f.orgao) { cond.push('e.orgao = ?'); params.push(f.orgao); }
  return { onde: cond.length ? ` WHERE ${cond.join(' AND ')}` : '', params };
}

/** Agentes só respondem ao recorte geográfico e de órgão; tipo, situação e manutenção são coisas de equipamento. */
function clausulaAgentes(f: FiltrosCentral): Clausula {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.bairroId) { cond.push('a.base_bairro_id = ?'); params.push(f.bairroId); }
  if (f.regiao) { cond.push('b.regiao = ?'); params.push(f.regiao); }
  if (f.orgao) { cond.push('a.orgao = ?'); params.push(f.orgao); }
  return { onde: cond.length ? ` WHERE ${cond.join(' AND ')}` : '', params };
}

/** Alertas respondem só ao recorte geográfico (o alerta pode não ter equipamento). */
function clausulaAlertas(f: FiltrosCentral): Clausula {
  const cond = ['al.resolvido_em IS NULL'];
  const params: unknown[] = [];
  if (f.bairroId) { cond.push('al.bairro_id = ?'); params.push(f.bairroId); }
  if (f.regiao) { cond.push('b.regiao = ?'); params.push(f.regiao); }
  return { onde: ` WHERE ${cond.join(' AND ')}`, params };
}

// ---- Indicadores ------------------------------------------------------------------------------------------------

interface LinhaManutencao {
  situacao: SituacaoEquipamento;
  manutencao_necessidade: NecessidadeManutencao;
  proxima_manutencao: string | null;
}

export function calcularIndicadores(db: Database, filtros: FiltrosCentral = {}, agora: Date = new Date()): Indicadores {
  const hoje = dataLocal(agora);
  const eq = clausulaEquipamentos(filtros);
  const porSituacao = new Map<SituacaoEquipamento, number>();
  let manutencaoImediata = 0;
  let manutencaoProxima7d = 0;

  const linhas = db
    .prepare(`SELECT e.situacao, e.manutencao_necessidade, e.proxima_manutencao FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id${eq.onde}`)
    .all(...eq.params) as LinhaManutencao[];
  for (const l of linhas) {
    const m = situacaoDaManutencao(l.situacao, l.manutencao_necessidade, l.proxima_manutencao, hoje);
    if (filtros.manutencao && filtros.manutencao !== m) continue;
    porSituacao.set(l.situacao, (porSituacao.get(l.situacao) ?? 0) + 1);
    if (m === 'imediata') manutencaoImediata++;
    else if (m === 'proxima') manutencaoProxima7d++;
  }

  let total = 0;
  let operacionais = 0;
  let indisponiveis = 0;
  let baseDisponibilidade = 0;
  for (const [situacao, n] of porSituacao) {
    total += n;
    if (situacao === 'operacional') operacionais += n;
    if (estaIndisponivel(situacao)) indisponiveis += n;
    if (contaNaDisponibilidade(situacao)) baseDisponibilidade += n;
  }

  const ag = clausulaAgentes(filtros);
  const agentes = db
    .prepare(`SELECT a.situacao, COUNT(*) AS n FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id${ag.onde} GROUP BY a.situacao`)
    .all(...ag.params) as { situacao: SituacaoAgente; n: number }[];
  const agentesTotal = agentes.reduce((s, l) => s + l.n, 0);
  const agentesEmAtividade = agentes.filter((l) => agenteEmAtividade(l.situacao)).reduce((s, l) => s + l.n, 0);

  const al = clausulaAlertas(filtros);
  const alertas = db
    .prepare(`SELECT al.criticidade, COUNT(*) AS n FROM alertas al LEFT JOIN bairros b ON b.id = al.bairro_id${al.onde} GROUP BY al.criticidade`)
    .all(...al.params) as { criticidade: Criticidade; n: number }[];

  return {
    totalEquipamentos: total,
    operacionais,
    indisponiveis,
    naoInstalados: porSituacao.get('nao_instalado') ?? 0,
    desativados: porSituacao.get('desativado') ?? 0,
    disponibilidadePct: baseDisponibilidade > 0 ? Math.round((operacionais / baseDisponibilidade) * 1000) / 10 : 0,
    agentesEmAtividade,
    agentesTotal,
    alertasAbertos: alertas.reduce((s, l) => s + l.n, 0),
    alertasCriticosAbertos: alertas.find((l) => l.criticidade === 'critica')?.n ?? 0,
    manutencaoImediata,
    manutencaoProxima7d,
  };
}

// ---- Mapa -------------------------------------------------------------------------------------------------------

interface LinhaMapa extends LinhaManutencao {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  lat: number;
  lng: number;
  lat_atual: number | null;
  lng_atual: number | null;
  bairro_id: number;
  orgao: Orgao;
}

export function listarParaMapa(db: Database, filtros: FiltrosCentral = {}, agora: Date = new Date()): { equipamentos: EquipamentoMapa[]; agentes: AgenteMapa[] } {
  const hoje = dataLocal(agora);
  const eq = clausulaEquipamentos(filtros);
  const linhas = db
    .prepare(
      `SELECT e.id, e.codigo, e.tipo, e.situacao, e.lat, e.lng, e.lat_atual, e.lng_atual, e.bairro_id, e.orgao, e.manutencao_necessidade, e.proxima_manutencao
       FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id${eq.onde} ORDER BY e.id`,
    )
    .all(...eq.params) as LinhaMapa[];
  const equipamentos: EquipamentoMapa[] = [];
  for (const l of linhas) {
    const manutencao = situacaoDaManutencao(l.situacao, l.manutencao_necessidade, l.proxima_manutencao, hoje);
    if (filtros.manutencao && filtros.manutencao !== manutencao) continue;
    equipamentos.push({ id: l.id, codigo: l.codigo, tipo: l.tipo, situacao: l.situacao, ...posicaoNoMapa(l), bairroId: l.bairro_id, orgao: l.orgao, manutencao });
  }

  const ag = clausulaAgentes(filtros);
  const agentes = (
    db
      .prepare(
        `SELECT a.id, a.nome, a.categoria, a.situacao, a.lat_atual, a.lng_atual, a.base_bairro_id
         FROM agentes a JOIN bairros b ON b.id = a.base_bairro_id${ag.onde} ORDER BY a.id`,
      )
      .all(...ag.params) as { id: number; nome: string; categoria: AgenteMapa['categoria']; situacao: SituacaoAgente; lat_atual: number; lng_atual: number; base_bairro_id: number }[]
  ).map((l) => ({ id: l.id, nome: l.nome, categoria: l.categoria, situacao: l.situacao, lat: l.lat_atual, lng: l.lng_atual, bairroId: l.base_bairro_id }));

  return { equipamentos, agentes };
}

// ---- Situação das regiões ---------------------------------------------------------------------------------------

const PESO_INDISPONIVEL = 12;
const PESO_ALERTA_CRITICO = 25;
const PESO_ALERTA_ALTO = 10;
const PESO_OCORRENCIA = 4;

export const nivelDoIndice = (indice: number): NivelAtencao => (indice >= 60 ? 'critico' : indice >= 30 ? 'atencao' : 'normal');

/**
 * Ocorrências das últimas 3 h no índice: cada uma conta pelo `peso` gravado nela. Histórico e eventos injetados valem 1;
 * as ao vivo valem 1 ÷ (8 × velocidade em que começaram), porque o simulador gera 8 vezes o ritmo real (× a velocidade).
 * Assim o índice mede a cidade no ritmo real: 10 minutos a 60× não pintam todas as regiões de vermelho.
 */
function textoOcorrencias(n: number, soma: number): string {
  const base = n === 1 ? `1 ocorrência nas últimas ${JANELA_OCORRENCIAS_H} h` : `${formatarNumero(n)} ocorrências nas últimas ${JANELA_OCORRENCIAS_H} h`;
  if (Math.abs(soma - n) < 1e-9) return base;
  const v = Math.round(soma * 10) / 10;
  return `${base} (contam como ${formatarNumero(v, Number.isInteger(v) ? 0 : 1)} no ritmo real)`;
}

const doBairro = <T>(mapa: Map<number, T[]>, id: number): T[] => {
  let l = mapa.get(id);
  if (!l) mapa.set(id, (l = []));
  return l;
};

export function calcularStatusRegioes(db: Database, agora: Date): StatusRegiao[] {
  const desde = new Date(agora.getTime() - JANELA_OCORRENCIAS_H * HORA_MS).toISOString();

  const bairros = db.prepare('SELECT id, nome, regiao FROM bairros ORDER BY nome').all() as { id: number; nome: string; regiao: Regiao }[];
  const indisponiveis = db
    .prepare("SELECT bairro_id, tipo, COUNT(*) AS n FROM equipamentos WHERE situacao IN ('mau_funcionamento','em_manutencao','furtado') GROUP BY bairro_id, tipo")
    .all() as { bairro_id: number; tipo: TipoEquipamentoId; n: number }[];
  const alertas = db
    .prepare("SELECT bairro_id, criticidade, COUNT(*) AS n FROM alertas WHERE resolvido_em IS NULL AND bairro_id IS NOT NULL AND criticidade IN ('critica','alta') GROUP BY bairro_id, criticidade")
    .all() as { bairro_id: number; criticidade: Criticidade; n: number }[];
  const ocorrencias = db
    .prepare('SELECT bairro_id, COUNT(*) AS n, SUM(peso) AS soma FROM ocorrencias WHERE inicio >= ? AND inicio <= ? GROUP BY bairro_id')
    .all(desde, agora.toISOString()) as { bairro_id: number; n: number; soma: number }[];

  const indispPorBairro = new Map<number, { tipo: TipoEquipamentoId; n: number }[]>();
  for (const l of indisponiveis) doBairro(indispPorBairro, l.bairro_id).push({ tipo: l.tipo, n: l.n });
  const criticosPorBairro = new Map<number, number>();
  const altosPorBairro = new Map<number, number>();
  for (const l of alertas) (l.criticidade === 'critica' ? criticosPorBairro : altosPorBairro).set(l.bairro_id, l.n);
  const ocPorBairro = new Map(ocorrencias.map((l) => [l.bairro_id, l]));

  const statusBairros: (StatusBairro & { regiao: Regiao; indisp: number; criticos: number; altos: number; oc: number; ocPeso: number })[] = bairros.map((b) => {
    const grupos = (indispPorBairro.get(b.id) ?? []).sort((x, y) => y.n - x.n || x.tipo.localeCompare(y.tipo));
    const indisp = grupos.reduce((s, g) => s + g.n, 0);
    const criticos = criticosPorBairro.get(b.id) ?? 0;
    const altos = altosPorBairro.get(b.id) ?? 0;
    const oc = ocPorBairro.get(b.id)?.n ?? 0;
    const ocPeso = ocPorBairro.get(b.id)?.soma ?? 0;
    const indice = Math.min(100, Math.round(PESO_INDISPONIVEL * indisp + PESO_ALERTA_CRITICO * criticos + PESO_ALERTA_ALTO * altos + PESO_OCORRENCIA * ocPeso));

    const motivos: string[] = [];
    if (criticos) motivos.push(criticos === 1 ? '1 alerta crítico aberto' : `${criticos} alertas críticos abertos`);
    if (altos) motivos.push(altos === 1 ? '1 alerta alto aberto' : `${altos} alertas altos abertos`);
    for (const g of grupos) {
      const [um, varios] = NOME_DO_TIPO[g.tipo];
      motivos.push(g.n === 1 ? `1 ${um} indisponível` : `${g.n} ${varios} indisponíveis`);
    }
    if (oc) motivos.push(textoOcorrencias(oc, ocPeso));

    return { bairroId: b.id, nome: b.nome, indice, nivel: nivelDoIndice(indice), motivos, regiao: b.regiao, indisp, criticos, altos, oc, ocPeso };
  });

  return REGIOES.map((regiao) => {
    const dela = statusBairros.filter((b) => b.regiao === regiao);
    const indice = dela.reduce((m, b) => Math.max(m, b.indice), 0);
    const soma = (campo: 'indisp' | 'criticos' | 'altos' | 'oc' | 'ocPeso') => dela.reduce((s, b) => s + b[campo], 0);
    const pior = [...dela].sort((a, b) => b.indice - a.indice)[0];
    const motivos: string[] = [];
    if (pior && pior.indice > 0) motivos.push(`Maior pressão: ${pior.nome} (índice ${pior.indice})`);
    const criticos = soma('criticos');
    const altos = soma('altos');
    const indisp = soma('indisp');
    const oc = soma('oc');
    if (criticos) motivos.push(criticos === 1 ? '1 alerta crítico aberto' : `${criticos} alertas críticos abertos`);
    if (altos) motivos.push(altos === 1 ? '1 alerta alto aberto' : `${altos} alertas altos abertos`);
    if (indisp) motivos.push(indisp === 1 ? '1 equipamento indisponível' : `${indisp} equipamentos indisponíveis`);
    if (oc) motivos.push(textoOcorrencias(oc, soma('ocPeso')));
    return {
      regiao,
      indice,
      nivel: nivelDoIndice(indice),
      motivos,
      bairros: dela.map(({ bairroId, nome, indice: i, nivel, motivos: m }) => ({ bairroId, nome, indice: i, nivel, motivos: m })),
    };
  });
}

// ---- Ocorrências recentes (camada de calor) ---------------------------------------------------------------------

export interface OcorrenciaRecente {
  id: number;
  lat: number;
  lng: number;
  tipo: TipoOcorrencia;
  gravidade: 1 | 2 | 3 | 4;
  inicio: string;
  bairroId: number;
}

export function listarOcorrenciasRecentes(db: Database, horas: number, agora: Date): OcorrenciaRecente[] {
  const desde = new Date(agora.getTime() - horas * HORA_MS).toISOString();
  return (
    db
      .prepare('SELECT id, lat, lng, tipo, gravidade, inicio, bairro_id FROM ocorrencias WHERE inicio >= ? AND inicio <= ? ORDER BY inicio DESC, id DESC')
      .all(desde, agora.toISOString()) as { id: number; lat: number; lng: number; tipo: TipoOcorrencia; gravidade: 1 | 2 | 3 | 4; inicio: string; bairro_id: number }[]
  ).map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, tipo: l.tipo, gravidade: l.gravidade, inicio: l.inicio, bairroId: l.bairro_id }));
}
