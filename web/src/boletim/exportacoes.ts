// As três exportações do Boletim (inventário de equipamentos, agentes, manutenções pendentes): colunas em português,
// datas dd/mm/aaaa e situações por extenso, como nas telas. As listas vêm das rotas de sempre, página por página.
import {
  ROTULO_CATEGORIA_AGENTE, ROTULO_NECESSIDADE_MANUTENCAO, ROTULO_SITUACAO, ROTULO_SITUACAO_AGENTE, ROTULO_TURNO,
} from '../../../shared/dominio';
import { formatarCidadeUf, formatarDataHora } from '../../../shared/formato';
import type { Agente, Equipamento, Pagina, PainelManutencao } from '../../../shared/modelos';
import { tipoPorId } from '../../../shared/tipos-equipamento';
import { api } from '../api/cliente';
import { formatarDia, hojeIso } from '../util/datas';
import { gerarCsv, type ColunaCsv } from './csv';
import { prazoDaManutencao } from './montar';

/** O máximo que as listagens aceitam por página. */
const POR_PAGINA = 100;

/** Junta todas as páginas de uma listagem (`/api/equipamentos`, `/api/agentes`). */
export async function buscarTodas<T>(caminho: string): Promise<T[]> {
  const todos: T[] = [];
  for (let pagina = 1; ; pagina++) {
    const p = await api.get<Pagina<T>>(caminho, { pagina, porPagina: POR_PAGINA });
    todos.push(...p.itens);
    if (p.itens.length === 0 || todos.length >= p.total) return todos;
  }
}

/** "fogo-equipamentos-2026-10-19.csv" (data de São Paulo). */
export function nomeDoArquivo(assunto: string, agora: Date = new Date()): string {
  return `fogo-${assunto}-${hojeIso(agora)}.csv`;
}

const dia = (v: string | undefined) => (v ? formatarDia(v) : '');

const COLUNAS_EQUIPAMENTOS: ColunaCsv<Equipamento>[] = [
  { titulo: 'Código', valor: (e) => e.codigo },
  { titulo: 'Tipo', valor: (e) => tipoPorId(e.tipo).rotulo },
  { titulo: 'Nº de série', valor: (e) => e.numeroSerie },
  { titulo: 'Marca', valor: (e) => e.marca },
  { titulo: 'Modelo', valor: (e) => e.modelo },
  { titulo: 'Órgão', valor: (e) => e.orgao },
  { titulo: 'Situação', valor: (e) => ROTULO_SITUACAO[e.situacao] },
  { titulo: 'CEP', valor: (e) => e.cep },
  { titulo: 'Logradouro', valor: (e) => e.logradouro },
  { titulo: 'Referência', valor: (e) => e.referencia },
  { titulo: 'Bairro', valor: (e) => e.bairroNome },
  { titulo: 'Região', valor: (e) => e.regiao },
  { titulo: 'Cidade/UF', valor: (e) => formatarCidadeUf(e.cidade, e.uf) },
  { titulo: 'Latitude', valor: (e) => e.lat, casas: 6 },
  { titulo: 'Longitude', valor: (e) => e.lng, casas: 6 },
  { titulo: 'Necessidade de manutenção', valor: (e) => ROTULO_NECESSIDADE_MANUTENCAO[e.manutencaoNecessidade] },
  { titulo: 'Periodicidade (dias)', valor: (e) => e.manutencaoPeriodicidadeDias },
  { titulo: 'Última manutenção', valor: (e) => dia(e.ultimaManutencao) },
  { titulo: 'Próxima manutenção', valor: (e) => dia(e.proximaManutencao) },
  { titulo: 'Instalado em', valor: (e) => dia(e.instaladoEm) },
  { titulo: 'Último sinal', valor: (e) => (e.ultimoSinalEm ? formatarDataHora(e.ultimoSinalEm) : '') },
];

const COLUNAS_AGENTES: ColunaCsv<Agente>[] = [
  { titulo: 'Nome', valor: (a) => a.nome },
  { titulo: 'Matrícula', valor: (a) => a.matricula },
  { titulo: 'Categoria', valor: (a) => ROTULO_CATEGORIA_AGENTE[a.categoria] },
  { titulo: 'Órgão', valor: (a) => a.orgao },
  { titulo: 'Situação', valor: (a) => ROTULO_SITUACAO_AGENTE[a.situacao] },
  { titulo: 'Turno', valor: (a) => ROTULO_TURNO[a.turno] },
  { titulo: 'Base', valor: (a) => a.baseLogradouro },
  { titulo: 'Bairro da base', valor: (a) => a.baseBairroNome },
  { titulo: 'Região', valor: (a) => a.regiao },
  { titulo: 'Telefone', valor: (a) => a.telefone },
  { titulo: 'Último sinal', valor: (a) => (a.ultimoSinalEm ? formatarDataHora(a.ultimoSinalEm) : '') },
];

export const csvEquipamentos = (itens: readonly Equipamento[]) => gerarCsv(COLUNAS_EQUIPAMENTOS, itens);
export const csvAgentes = (itens: readonly Agente[]) => gerarCsv(COLUNAS_AGENTES, itens);

type Pendente = Equipamento & { grupo: string; prazo: string };

/** Os quatro grupos do painel de Manutenção, na mesma ordem das colunas da tela. */
export function csvManutencoesPendentes(painel: PainelManutencao, hoje: string = hojeIso()): string {
  const prazo = (e: Equipamento) => (e.proximaManutencao ? prazoDaManutencao(e.proximaManutencao, hoje) : '');
  const itens: Pendente[] = [
    ...painel.atrasadas.map((e) => ({ ...e, grupo: 'Atrasada', prazo: prazo(e) })),
    ...painel.imediatas.map((e) => ({ ...e, grupo: 'Imediata', prazo: 'conserto pedido agora' })),
    ...painel.proximos7.map((e) => ({ ...e, grupo: 'Próximos 7 dias', prazo: prazo(e) })),
    ...painel.proximos30.map((e) => ({ ...e, grupo: 'Próximos 30 dias', prazo: prazo(e) })),
  ];
  return gerarCsv<Pendente>([
    { titulo: 'Grupo', valor: (e) => e.grupo },
    { titulo: 'Código', valor: (e) => e.codigo },
    { titulo: 'Tipo', valor: (e) => tipoPorId(e.tipo).rotulo },
    { titulo: 'Situação', valor: (e) => ROTULO_SITUACAO[e.situacao] },
    { titulo: 'Bairro', valor: (e) => e.bairroNome },
    { titulo: 'Logradouro', valor: (e) => e.logradouro },
    { titulo: 'Necessidade', valor: (e) => ROTULO_NECESSIDADE_MANUTENCAO[e.manutencaoNecessidade] },
    { titulo: 'Próxima manutenção', valor: (e) => dia(e.proximaManutencao) },
    { titulo: 'Prazo', valor: (e) => e.prazo },
  ], itens);
}
