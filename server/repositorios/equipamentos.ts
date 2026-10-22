import type { Database } from 'better-sqlite3';
import { ROTULO_SITUACAO, type NecessidadeManutencao, type Orgao, type Regiao, type SituacaoEquipamento } from '../../shared/dominio';
import type { Equipamento, EquipamentoMapa, HistoricoSituacao, Pagina, PontoTelemetria, SituacaoManutencao } from '../../shared/modelos';
import type { EquipamentoEdicao, EquipamentoInput, FiltrosEquipamento, OrdemEquipamento } from '../../shared/schemas';
import { TIPOS_EQUIPAMENTO, tipoPorId, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { CIDADE, UF } from '../../shared/formato';
import { somarDias } from '../tempo';
import { condicaoBusca } from './busca';

interface LinhaEquipamento {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  numero_serie: string;
  marca: string;
  modelo: string;
  orgao: Orgao;
  situacao: SituacaoEquipamento;
  cep: string;
  logradouro: string;
  referencia: string;
  cidade: string;
  uf: string;
  bairro_id: number;
  bairro_nome: string;
  regiao: Regiao;
  lat: number;
  lng: number;
  lat_atual: number;
  lng_atual: number;
  manutencao_necessidade: NecessidadeManutencao;
  manutencao_periodicidade_dias: number | null;
  ultima_manutencao: string | null;
  proxima_manutencao: string | null;
  caracteristicas: string;
  instalado_em: string | null;
  ultimo_sinal_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Lista explícita de colunas: `token_dispositivo` nunca entra no SELECT da API.
const SELECT = `
  SELECT e.id, e.codigo, e.tipo, e.numero_serie, e.marca, e.modelo, e.orgao, e.situacao, e.cep, e.logradouro, e.referencia,
         e.cidade, e.uf, e.bairro_id, b.nome AS bairro_nome, b.regiao AS regiao, e.lat, e.lng, e.lat_atual, e.lng_atual,
         e.manutencao_necessidade, e.manutencao_periodicidade_dias, e.ultima_manutencao, e.proxima_manutencao,
         e.caracteristicas, e.instalado_em, e.ultimo_sinal_em, e.criado_em, e.atualizado_em
  FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id`;

function paraEquipamento(l: LinhaEquipamento): Equipamento {
  return {
    id: l.id,
    codigo: l.codigo,
    tipo: l.tipo,
    numeroSerie: l.numero_serie,
    marca: l.marca,
    modelo: l.modelo,
    orgao: l.orgao,
    situacao: l.situacao,
    cep: l.cep,
    logradouro: l.logradouro,
    referencia: l.referencia,
    cidade: l.cidade,
    uf: l.uf,
    bairroId: l.bairro_id,
    bairroNome: l.bairro_nome,
    regiao: l.regiao,
    lat: l.lat,
    lng: l.lng,
    latAtual: l.lat_atual,
    lngAtual: l.lng_atual,
    manutencaoNecessidade: l.manutencao_necessidade,
    ...(l.manutencao_periodicidade_dias !== null && { manutencaoPeriodicidadeDias: l.manutencao_periodicidade_dias }),
    ...(l.ultima_manutencao !== null && { ultimaManutencao: l.ultima_manutencao }),
    ...(l.proxima_manutencao !== null && { proximaManutencao: l.proxima_manutencao }),
    caracteristicas: JSON.parse(l.caracteristicas) as Record<string, unknown>,
    ...(l.instalado_em !== null && { instaladoEm: l.instalado_em }),
    ultimoSinalEm: l.ultimo_sinal_em,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

export function equipamentoPorId(db: Database, id: number): Equipamento | undefined {
  const l = db.prepare(`${SELECT} WHERE e.id = ?`).get(id) as LinhaEquipamento | undefined;
  return l && paraEquipamento(l);
}

export function numeroSerieEmUso(db: Database, numeroSerie: string, ignorarId?: number): boolean {
  // Sem diferenciar maiúsculas de minúsculas: "REV-X" e "rev-x" são o mesmo número de série.
  return db.prepare('SELECT 1 FROM equipamentos WHERE numero_serie = ? COLLATE NOCASE AND id IS NOT ?').get(numeroSerie, ignorarId ?? null) !== undefined;
}

/** Próximo número da sequência do código do tipo (FOGO-<sigla>-0001, 0002...). */
export function proximoSequencial(db: Database, sigla: string): number {
  const prefixo = `FOGO-${sigla}-`;
  const ultimo = db
    .prepare('SELECT codigo FROM equipamentos WHERE codigo LIKE ? ORDER BY length(codigo) DESC, codigo DESC LIMIT 1')
    .get(`${prefixo}%`) as { codigo: string } | undefined;
  return ultimo ? Number(ultimo.codigo.slice(prefixo.length)) + 1 : 1;
}

export interface DadosNovoEquipamento {
  codigo: string;
  token: string;
  agora: string;
}

export function inserirEquipamento(db: Database, e: EquipamentoInput, d: DadosNovoEquipamento): number {
  const r = db
    .prepare(
      `INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, referencia, bairro_id, cidade, uf,
         lat, lng, lat_atual, lng_atual, manutencao_necessidade, manutencao_periodicidade_dias, ultima_manutencao, proxima_manutencao,
         caracteristicas, instalado_em, token_dispositivo, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.codigo, e.tipo, e.numeroSerie, e.marca, e.modelo, e.orgao, e.situacao, e.cep, e.logradouro, e.referencia, e.bairroId, CIDADE, UF,
      e.lat, e.lng, e.lat, e.lng, e.manutencaoNecessidade, e.manutencaoPeriodicidadeDias ?? null, e.ultimaManutencao ?? null,
      e.proximaManutencao ?? null, JSON.stringify(e.caracteristicas), e.instaladoEm ?? null, d.token, d.agora, d.agora,
    );
  return Number(r.lastInsertRowid);
}

/**
 * Atualiza os dados cadastrais. NÃO toca em código, token, situação, posição atual nem último sinal:
 * esses campos pertencem à telemetria/ao fluxo de situação e o formulário nunca os sobrescreve.
 * O grupo de manutenção só é gravado quando veio (`manutencaoNecessidade` presente); sem ele, as datas ficam como estão.
 */
export function atualizarEquipamento(db: Database, id: number, e: EquipamentoEdicao, agora: string): void {
  db.prepare(
    `UPDATE equipamentos SET tipo = ?, numero_serie = ?, marca = ?, modelo = ?, orgao = ?, cep = ?, logradouro = ?, referencia = ?,
       bairro_id = ?, lat = ?, lng = ?, caracteristicas = ?, instalado_em = ?, atualizado_em = ?
     WHERE id = ?`,
  ).run(
    e.tipo, e.numeroSerie, e.marca, e.modelo, e.orgao, e.cep, e.logradouro, e.referencia, e.bairroId, e.lat, e.lng,
    JSON.stringify(e.caracteristicas), e.instaladoEm ?? null, agora, id,
  );
  if (e.manutencaoNecessidade !== undefined) {
    db.prepare('UPDATE equipamentos SET manutencao_necessidade = ?, manutencao_periodicidade_dias = ?, ultima_manutencao = ?, proxima_manutencao = ? WHERE id = ?')
      .run(e.manutencaoNecessidade, e.manutencaoPeriodicidadeDias ?? null, e.ultimaManutencao ?? null, e.proximaManutencao ?? null, id);
  }
}

export function gravarSituacao(
  db: Database,
  id: number,
  de: SituacaoEquipamento,
  para: SituacaoEquipamento,
  motivo: string,
  agora: string,
): void {
  db.prepare('UPDATE equipamentos SET situacao = ?, atualizado_em = ? WHERE id = ?').run(para, agora, id);
  // Mau funcionamento pede manutenção imediata (o exemplo do enunciado): vale para a tela, a API, o relato do Modo Campo e a simulação.
  // Só a necessidade muda; datas e periodicidade ficam, para o registro da manutenção reagendar a periódica.
  if (para === 'mau_funcionamento') db.prepare("UPDATE equipamentos SET manutencao_necessidade = 'imediata' WHERE id = ?").run(id);
  // Toda mudança gravada por aqui é ao vivo (simulador ou tela): a semente grava as do histórico direto, com origem 'historico'.
  db.prepare("INSERT INTO historico_situacao (equipamento_id, de, para, motivo, em, origem) VALUES (?, ?, ?, ?, ?, 'ao_vivo')").run(id, de, para, motivo, agora);
}

/** Posição atual de volta ao ponto cadastrado (o patinete recuperado de um furto volta à base). */
export function voltarParaBase(db: Database, id: number): void {
  db.prepare('UPDATE equipamentos SET lat_atual = lat, lng_atual = lng WHERE id = ?').run(id);
}

export interface AjusteManutencao {
  necessidade: NecessidadeManutencao;
  /** `undefined` = não mexe na última manutenção. */
  ultima?: string | null;
  proxima: string | null;
}

export function gravarManutencaoDoEquipamento(db: Database, id: number, a: AjusteManutencao, agora: string): void {
  if (a.ultima !== undefined) {
    db.prepare('UPDATE equipamentos SET manutencao_necessidade = ?, ultima_manutencao = ?, proxima_manutencao = ?, atualizado_em = ? WHERE id = ?')
      .run(a.necessidade, a.ultima, a.proxima, agora, id);
  } else {
    db.prepare('UPDATE equipamentos SET manutencao_necessidade = ?, proxima_manutencao = ?, atualizado_em = ? WHERE id = ?')
      .run(a.necessidade, a.proxima, agora, id);
  }
}

export function historicoDoEquipamento(db: Database, id: number): HistoricoSituacao[] {
  const linhas = db
    .prepare('SELECT id, equipamento_id, de, para, motivo, em FROM historico_situacao WHERE equipamento_id = ? ORDER BY em DESC, id DESC')
    .all(id) as { id: number; equipamento_id: number; de: SituacaoEquipamento; para: SituacaoEquipamento; motivo: string; em: string }[];
  return linhas.map((l) => ({ id: l.id, equipamentoId: l.equipamento_id, de: l.de, para: l.para, motivo: l.motivo, em: l.em }));
}

export interface VinculosDoEquipamento {
  alertas: number;
  agentes: number;
  ocorrencias: number;
  manutencoes: number;
  mudancasDeSituacao: number;
}

/**
 * O que impede a exclusão: registros que pessoas ou o fluxo de trabalho criaram. A telemetria fica de fora de propósito:
 * é dado de máquina, chega sozinha 2 s depois do cadastro e sai junto com o equipamento (`removerEquipamento`).
 */
export function vinculosDoEquipamento(db: Database, id: number): VinculosDoEquipamento {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM alertas WHERE equipamento_id = @id) AS alertas,
              (SELECT COUNT(*) FROM agentes WHERE equipamento_id = @id) AS agentes,
              (SELECT COUNT(*) FROM ocorrencias WHERE equipamento_id = @id) AS ocorrencias,
              (SELECT COUNT(*) FROM manutencoes WHERE equipamento_id = @id) AS manutencoes,
              (SELECT COUNT(*) FROM historico_situacao WHERE equipamento_id = @id) AS mudancasDeSituacao`,
    )
    .get({ id }) as VinculosDoEquipamento;
}

/** Apaga o equipamento e a telemetria dele (a chave estrangeira não deixaria apagar só o equipamento). */
export function removerEquipamento(db: Database, id: number): void {
  db.transaction(() => {
    db.prepare('DELETE FROM telemetria_hora WHERE equipamento_id = ?').run(id);
    db.prepare('DELETE FROM equipamentos WHERE id = ?').run(id);
  })();
}

export function telemetriaDoEquipamento(db: Database, id: number, desdeIso: string): PontoTelemetria[] {
  const linhas = db
    .prepare('SELECT hora, leituras, online_min, metricas FROM telemetria_hora WHERE equipamento_id = ? AND hora >= ? ORDER BY hora')
    .all(id, desdeIso) as { hora: string; leituras: number; online_min: number; metricas: string }[];
  return linhas.map((l) => ({ hora: l.hora, leituras: l.leituras, onlineMin: l.online_min, metricas: JSON.parse(l.metricas) as Record<string, number> }));
}

// ---- Listagem e filtros ----

// Furtado também fica de fora: não há manutenção preventiva de um equipamento que não está com o órgão.
const ATIVO = "e.situacao NOT IN ('desativado', 'nao_instalado', 'furtado')";

type CriterioManutencao = 'imediata' | 'atrasada' | 'proxima' | 'proxima30';

/**
 * Critérios de manutenção (disjuntos), sempre só para equipamento ativo. `hoje` = data local YYYY-MM-DD.
 * imediata: necessidade 'imediata' · atrasada: a próxima data já passou · proxima: vence em até 7 dias · proxima30: de 8 a 30 dias.
 */
function condicaoManutencao(tipo: CriterioManutencao, hoje: string, params: unknown[]): string {
  switch (tipo) {
    case 'imediata':
      return `(${ATIVO} AND e.manutencao_necessidade = 'imediata')`;
    case 'atrasada':
      params.push(hoje);
      return `(${ATIVO} AND e.manutencao_necessidade <> 'imediata' AND e.proxima_manutencao IS NOT NULL AND e.proxima_manutencao < ?)`;
    case 'proxima':
      params.push(hoje, somarDias(hoje, 7));
      return `(${ATIVO} AND e.manutencao_necessidade <> 'imediata' AND e.proxima_manutencao >= ? AND e.proxima_manutencao <= ?)`;
    case 'proxima30':
      params.push(somarDias(hoje, 7), somarDias(hoje, 30));
      return `(${ATIVO} AND e.manutencao_necessidade <> 'imediata' AND e.proxima_manutencao > ? AND e.proxima_manutencao <= ?)`;
  }
}

/** CASE que troca o id pelo rótulo (a lista mostra "Veículo de fiscalização", não `fiscal_rotativo`: é por ele que se espera a ordem). */
const casePorRotulo = (coluna: string, rotulos: [string, string][]) =>
  `CASE ${coluna} ${rotulos.map(([id, rotulo]) => `WHEN '${id}' THEN '${rotulo.replaceAll("'", "''")}'`).join(' ')} ELSE ${coluna} END`;

// Só constantes do código entram aqui (nada que venha da requisição): a chave do usuário escolhe uma destas expressões.
const EXPRESSAO_ORDEM: Record<OrdemEquipamento, string> = {
  codigo: 'e.codigo',
  tipo: casePorRotulo('e.tipo', TIPOS_EQUIPAMENTO.map((t) => [t.id, t.rotulo])),
  situacao: casePorRotulo('e.situacao', Object.entries(ROTULO_SITUACAO)),
  bairro: 'b.nome',
};

export function listarEquipamentos(db: Database, f: FiltrosEquipamento, hoje: string): Pagina<Equipamento> {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.busca) {
    cond.push(condicaoBusca(f.busca, ['e.codigo', 'e.numero_serie', 'e.marca', 'e.modelo', 'e.logradouro', 'e.referencia', 'b.nome'], params));
  }
  if (f.tipo) { cond.push('e.tipo = ?'); params.push(f.tipo); }
  if (f.situacao) { cond.push('e.situacao = ?'); params.push(f.situacao); }
  if (f.bairroId) { cond.push('e.bairro_id = ?'); params.push(f.bairroId); }
  if (f.regiao) { cond.push('b.regiao = ?'); params.push(f.regiao); }
  if (f.orgao) { cond.push('e.orgao = ?'); params.push(f.orgao); }
  if (f.manutencao) cond.push(condicaoManutencao(f.manutencao, hoje, params));
  const onde = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id${onde}`).get(...params) as { n: number }).n;
  const linhas = db
    .prepare(`${SELECT}${onde} ORDER BY ${EXPRESSAO_ORDEM[f.ordem ?? 'codigo']} ${f.direcao === 'desc' ? 'DESC' : 'ASC'}, e.codigo LIMIT ? OFFSET ?`)
    .all(...params, f.porPagina, (f.pagina - 1) * f.porPagina) as LinhaEquipamento[];
  return { itens: linhas.map(paraEquipamento), total, pagina: f.pagina, porPagina: f.porPagina };
}

export function painelManutencao(db: Database, hoje: string) {
  const buscar = (tipo: CriterioManutencao): Equipamento[] => {
    const params: unknown[] = [];
    const cond = condicaoManutencao(tipo, hoje, params);
    const ordem = tipo === 'imediata' ? 'e.codigo' : 'e.proxima_manutencao, e.codigo';
    return (db.prepare(`${SELECT} WHERE ${cond} ORDER BY ${ordem}`).all(...params) as LinhaEquipamento[]).map(paraEquipamento);
  };
  return { atrasadas: buscar('atrasada'), imediatas: buscar('imediata'), proximos7: buscar('proxima'), proximos30: buscar('proxima30') };
}

/** Situação de manutenção exibida no mapa. `hoje` = data local YYYY-MM-DD. Só equipamento ativo tem pendência. */
export function situacaoDaManutencao(situacao: SituacaoEquipamento, necessidade: NecessidadeManutencao, proxima: string | null, hoje: string): SituacaoManutencao {
  if (situacao === 'desativado' || situacao === 'nao_instalado' || situacao === 'furtado') return 'ok';
  if (necessidade === 'imediata') return 'imediata';
  if (proxima !== null && proxima < hoje) return 'atrasada';
  if (proxima !== null && proxima <= somarDias(hoje, 7)) return 'proxima';
  return 'ok';
}

/** Posição no mapa: equipamento fixo usa o ponto cadastrado; móvel usa a posição atual (cai para o cadastro se nula). */
export function posicaoNoMapa(l: { tipo: TipoEquipamentoId; lat: number; lng: number; lat_atual: number | null; lng_atual: number | null }): { lat: number; lng: number } {
  if (tipoPorId(l.tipo).movel && l.lat_atual !== null && l.lng_atual !== null) return { lat: l.lat_atual, lng: l.lng_atual };
  return { lat: l.lat, lng: l.lng };
}

/** Ponto do mapa de um equipamento. `hoje` = data local YYYY-MM-DD. */
export function equipamentoMapaPorId(db: Database, id: number, hoje: string): EquipamentoMapa | undefined {
  const l = db
    .prepare(
      `SELECT id, codigo, tipo, situacao, lat, lng, lat_atual, lng_atual, bairro_id, orgao, manutencao_necessidade, proxima_manutencao
       FROM equipamentos WHERE id = ?`,
    )
    .get(id) as
    | { id: number; codigo: string; tipo: TipoEquipamentoId; situacao: SituacaoEquipamento; lat: number; lng: number; lat_atual: number; lng_atual: number; bairro_id: number; orgao: Orgao; manutencao_necessidade: NecessidadeManutencao; proxima_manutencao: string | null }
    | undefined;
  if (!l) return undefined;
  return {
    id: l.id, codigo: l.codigo, tipo: l.tipo, situacao: l.situacao, ...posicaoNoMapa(l), bairroId: l.bairro_id, orgao: l.orgao,
    manutencao: situacaoDaManutencao(l.situacao, l.manutencao_necessidade, l.proxima_manutencao, hoje),
  };
}
