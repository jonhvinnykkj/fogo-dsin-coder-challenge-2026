// Aplica cada evento do tempo real (SSE) no cache do TanStack Query, sem nova chamada à API.
// Funções puras sobre o QueryClient: o hook `useStream` e as mutações (reconhecer alerta, injetar evento) usam as mesmas.
import type { QueryClient } from '@tanstack/react-query';
import type { Regiao } from '../../../shared/dominio';
import type {
  Agente, AgenteMapa, Alerta, Bairro, Equipamento, EquipamentoMapa, EstadoSimulacao, EventoFogo, Indicadores, Ocorrencia, Pagina,
} from '../../../shared/modelos';
import type { FiltrosCentral } from '../../../shared/schemas';
import { chaves, filtrosDaChave, type FiltrosAlertas } from '../api/chaves';

export type MapaCentral = { equipamentos: EquipamentoMapa[]; agentes: AgenteMapa[] };
type ItemPosicao = Extract<EventoFogo, { tipo: 'posicoes' }>['itens'][number];

/** Região de cada bairro, se a lista de bairros já estiver em cache (para casar o filtro `regiao`). */
function regiaoDoBairro(qc: QueryClient): (bairroId: number) => Regiao | undefined {
  const bairros = qc.getQueryData<Bairro[]>(chaves.bairros());
  if (!bairros) return () => undefined;
  const mapa = new Map(bairros.map((b) => [b.id, b.regiao]));
  return (id) => mapa.get(id);
}

/** O equipamento entra nesta variante do mapa? Região desconhecida conta como "entra" (melhor sobrar que sumir). */
export function equipamentoAtende(e: EquipamentoMapa, f: Partial<FiltrosCentral>, regiao: (id: number) => Regiao | undefined): boolean {
  if (f.tipo?.length && !f.tipo.includes(e.tipo)) return false;
  if (f.situacao?.length && !f.situacao.includes(e.situacao)) return false;
  if (f.bairroId && e.bairroId !== f.bairroId) return false;
  if (f.orgao && e.orgao !== f.orgao) return false;
  if (f.manutencao && e.manutencao !== f.manutencao) return false;
  if (f.regiao) {
    const r = regiao(e.bairroId);
    if (r && r !== f.regiao) return false;
  }
  return true;
}

/** Agentes só respondem a bairro, região e órgão. O órgão não vem no evento: nesse caso só atualiza quem já está na lista. */
function agenteAtende(a: AgenteMapa, f: Partial<FiltrosCentral>, regiao: (id: number) => Regiao | undefined): boolean | 'so-atualizar' {
  if (f.bairroId && a.bairroId !== f.bairroId) return false;
  if (f.regiao) {
    const r = regiao(a.bairroId);
    if (r && r !== f.regiao) return false;
  }
  return f.orgao ? 'so-atualizar' : true;
}

function trocarOuIncluir<T extends { id: number }>(lista: T[], item: T, entra: boolean | 'so-atualizar'): T[] {
  const i = lista.findIndex((x) => x.id === item.id);
  if (entra === false) return i === -1 ? lista : lista.filter((x) => x.id !== item.id);
  if (i !== -1) {
    const nova = lista.slice();
    nova[i] = item;
    return nova;
  }
  return entra === true ? [...lista, item] : lista;
}

export function aplicarPosicoes(qc: QueryClient, itens: ItemPosicao[]): void {
  const eq = new Map<number, ItemPosicao>();
  const ag = new Map<number, ItemPosicao>();
  for (const it of itens) (it.tipo === 'equipamento' ? eq : ag).set(it.id, it);

  const mover = <T extends { id: number; lat: number; lng: number }>(lista: T[], novas: Map<number, ItemPosicao>): T[] => {
    let mudou = false;
    const nova = lista.map((x) => {
      const p = novas.get(x.id);
      if (!p || (p.lat === x.lat && p.lng === x.lng)) return x;
      mudou = true;
      return { ...x, lat: p.lat, lng: p.lng };
    });
    return mudou ? nova : lista;
  };

  qc.setQueriesData<MapaCentral>({ queryKey: chaves.mapa() }, (mapa) => {
    if (!mapa) return mapa;
    const equipamentos = eq.size ? mover(mapa.equipamentos, eq) : mapa.equipamentos;
    const agentes = ag.size ? mover(mapa.agentes, ag) : mapa.agentes;
    return equipamentos === mapa.equipamentos && agentes === mapa.agentes ? mapa : { equipamentos, agentes };
  });
}

export function aplicarEquipamento(qc: QueryClient, e: EquipamentoMapa): void {
  const regiao = regiaoDoBairro(qc);
  for (const [chave, mapa] of qc.getQueriesData<MapaCentral>({ queryKey: chaves.mapa() })) {
    if (!mapa) continue;
    const entra = equipamentoAtende(e, filtrosDaChave<FiltrosCentral>(chave), regiao);
    const equipamentos = trocarOuIncluir(mapa.equipamentos, e, entra);
    if (equipamentos !== mapa.equipamentos) qc.setQueryData<MapaCentral>(chave, { ...mapa, equipamentos });
  }
  // Listas paginadas: só a situação muda ao vivo. A ficha aberta busca de novo (histórico e alertas vêm junto).
  qc.setQueriesData<Pagina<Equipamento>>({ queryKey: chaves.listasEquipamentos() }, (pagina) =>
    pagina && pagina.itens.some((x) => x.id === e.id && x.situacao !== e.situacao)
      ? { ...pagina, itens: pagina.itens.map((x) => (x.id === e.id ? { ...x, situacao: e.situacao } : x)) }
      : pagina,
  );
  void qc.invalidateQueries({ queryKey: chaves.equipamento(e.id) });
}

export function aplicarAgente(qc: QueryClient, a: AgenteMapa): void {
  const regiao = regiaoDoBairro(qc);
  for (const [chave, mapa] of qc.getQueriesData<MapaCentral>({ queryKey: chaves.mapa() })) {
    if (!mapa) continue;
    const agentes = trocarOuIncluir(mapa.agentes, a, agenteAtende(a, filtrosDaChave<FiltrosCentral>(chave), regiao));
    if (agentes !== mapa.agentes) qc.setQueryData<MapaCentral>(chave, { ...mapa, agentes });
  }
  qc.setQueriesData<Pagina<Agente>>({ queryKey: chaves.listasAgentes() }, (pagina) =>
    pagina && pagina.itens.some((x) => x.id === a.id && x.situacao !== a.situacao)
      ? { ...pagina, itens: pagina.itens.map((x) => (x.id === a.id ? { ...x, situacao: a.situacao } : x)) }
      : pagina,
  );
  void qc.invalidateQueries({ queryKey: chaves.agente(a.id) });
}

/** Insere no topo ou atualiza no lugar, em todas as listas de alertas em cache. Resolvido sai das listas de abertos. */
export function aplicarAlerta(qc: QueryClient, alerta: Alerta): void {
  for (const [chave, lista] of qc.getQueriesData<Alerta[]>({ queryKey: chaves.alertas() })) {
    if (!lista) continue;
    const f = filtrosDaChave<FiltrosAlertas>(chave);
    const soAbertos = (f.status ?? 'abertos') === 'abertos';
    const casa = (!f.criticidade || f.criticidade === alerta.criticidade) && (!f.tipo || f.tipo === alerta.tipo)
      && (!f.desde || alerta.criadoEm >= f.desde);
    const entra = casa && !(soAbertos && alerta.resolvidoEm);

    const i = lista.findIndex((x) => x.id === alerta.id);
    let nova: Alerta[];
    if (!entra) nova = i === -1 ? lista : lista.filter((x) => x.id !== alerta.id);
    else if (i !== -1) nova = lista.map((x) => (x.id === alerta.id ? alerta : x));
    else nova = [alerta, ...lista].slice(0, f.limite ?? 200);
    if (nova !== lista) qc.setQueryData<Alerta[]>(chave, nova);
  }
}

/**
 * Ocorrência nova entra (ou a que já estava é atualizada) em cada variante da lista do mapa de calor; cada variante guarda
 * só a própria janela (`['ocorrencias', horas]`): com a página aberta a 60× não cresce para sempre.
 */
export function aplicarOcorrencia(qc: QueryClient, o: Ocorrencia): void {
  for (const [chave, lista] of qc.getQueriesData<Ocorrencia[]>({ queryKey: chaves.ocorrencias() })) {
    if (!lista) continue;
    const horas = typeof chave[1] === 'number' ? chave[1] : undefined;
    const desde = horas === undefined ? -Infinity : Date.now() - horas * 3_600_000;
    const i = lista.findIndex((x) => x.id === o.id);
    const nova = i === -1 ? [...lista, o] : lista.map((x, k) => (k === i ? o : x));
    qc.setQueryData(chave, nova.filter((x) => Date.parse(x.inicio) >= desde));
  }
}

/** Os indicadores ao vivo do servidor são sempre da cidade inteira: só a variante sem filtros recebe. */
export function aplicarIndicadores(qc: QueryClient, i: Indicadores): void {
  qc.setQueryData(chaves.indicadores(), i);
}

export function aplicarSimulacao(qc: QueryClient, s: EstadoSimulacao): void {
  qc.setQueryData(chaves.simulacao(), s);
}

export function aplicarEvento(qc: QueryClient, e: EventoFogo): void {
  switch (e.tipo) {
    case 'posicoes': return aplicarPosicoes(qc, e.itens);
    case 'equipamento': return aplicarEquipamento(qc, e.dados);
    case 'agente': return aplicarAgente(qc, e.dados);
    case 'alerta': return aplicarAlerta(qc, e.dados);
    case 'ocorrencia': return aplicarOcorrencia(qc, e.dados);
    case 'indicadores': return aplicarIndicadores(qc, e.dados);
    case 'simulacao': return aplicarSimulacao(qc, e.dados);
  }
}

/** Depois de ficar sem conexão, o que pode ter mudado é buscado de novo (só as consultas em uso vão ao servidor). */
export const CHAVES_RESSINCRONIZAR = [
  chaves.mapa(), chaves.indicadores(), chaves.alertas(), chaves.regioes(),
  chaves.ocorrencias(), chaves.simulacao(), chaves.equipamentos(), chaves.agentes(), chaves.manutencao(),
] as const;

export function ressincronizar(qc: QueryClient): void {
  for (const queryKey of CHAVES_RESSINCRONIZAR) void qc.invalidateQueries({ queryKey });
}
