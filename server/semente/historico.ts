/*
 * HISTÓRICO SINTÉTICO DE MARÍLIA — 60 DIAS COM PADRÕES PLANTADOS
 * ================================================================
 *
 * Por que sintético? Não existe base pública com as ocorrências e a telemetria dos equipamentos de Marília.
 * Então geramos 60 dias de história com semente fixa (SEMENTE_PADRAO = 2026) e escondemos nela padrões
 * que uma cidade real teria. A Parte 3 (Cidade Preditiva) precisa REDESCOBRIR esses padrões só olhando os
 * dados — e o teste retroativo mostra que ela acerta mais que uma previsão ingênua.
 *
 * O que é gerado
 *   - clima_dia: chuva de cada dia (≈ 25% dos dias chovem, 2 a 60 mm) + 7 dias de previsão (previsto = 1).
 *     A chuva de um dia depende só da semente e da data, então a "previsão" vira o dia observado depois.
 *   - ocorrencias: por hora e por bairro, contagem de Poisson com taxa
 *         taxa = total diário do tipo × perfil (hora, dia da semana) × peso do bairro
 *                × chuva (acidentes 1,8×) × padrões plantados × eventos da cidade
 *     O peso do bairro (soma 1) vem da malha de ruas, da região (Centro 3×) e de uma variação própria fixa.
 *   - telemetria_hora: uma linha por equipamento ativo por hora (fluxo, velocidade, infrações, conexão,
 *     bateria, pesagens…; nomes em shared/telemetria.ts; perfis em perfis.ts). Some enquanto o equipamento
 *     está em manutenção, furtado, desativado ou não instalado. Cai (online_min < 60) de 12 a 48 h antes de
 *     cada falha e, de vez em quando, nos equipamentos de maior risco.
 *   - historico_situacao + manutencoes: preventivas na periodicidade de cada tipo (algumas equipes "esquecem"
 *     e a manutenção atrasa), falhas → mau funcionamento → em manutenção → operacional, com ordem de serviço.
 *
 * PADRÕES PLANTADOS (viram as perguntas da Parte 3)
 *   1. Picos de trânsito em dias úteis às 7–9 h e 17–19 h (perfil 2,3–2,4× a hora comum): acidentes,
 *      congestionamentos, infrações e veículos quebrados seguem esse perfil. Sábado e domingo são mais planos
 *      (acidentes mantêm o total do dia, espalhado por lazer e noite; os outros tipos de trânsito caem).
 *      Medido (semente padrão): horas 7, 8, 17 e 18 têm ≈ 2,0× as outras horas do dia (≈ 1,7× contando 9 h e 19 h).
 *   2. Sexta e sábado das 20 h às 2 h, nos bairros da região Centro: 2,5× ocorrências de segurança e de infração
 *      (as 0–2 h de sábado e domingo contam como a noite anterior). Medido: ≈ 2,7× as noites de segunda a quinta.
 *   3. Horário escolar (dias úteis, 6:30–7:30, 11:30–13:30 e 17–18 h): acidentes leves (gravidade 1) a até
 *      ~350 m das escolas atendidas pelos transportes escolares cadastrados (0,1 por escola por hora de janela).
 *      Medido: perto das escolas, a taxa por hora dentro das janelas é ≈ 11× a de fora.
 *   4. Chuva: no dia chuvoso os acidentes são 1,8× (congestionamento 1,3×); alagamentos só em dia de chuva,
 *      no fim da tarde, concentrados nos 10 bairros alagáveis (onde ficam os sensores). Medido: ≈ 1,7×.
 *   5. Furto de patinete 3× maior (por patinete) em dois bairros: Alto Cafezal e Jardim Universitário.
 *      Medido: ≈ 4× (poucos casos: 16 furtos em 12 patinetes contra 15 em 48).
 *   6. Falhas: chance por hora = taxa do tipo × fator do modelo × (1 + idade em anos / 5)
 *      × (1 + dias de manutenção atrasada / 30, no máximo 3). O fator do modelo é (1 − confiabilidade) / 0,08;
 *      a câmera Vigilux VX-200 (confiabilidade 0,77) falha ~3× mais que os outros modelos de câmera
 *      (medido: 2,4 falhas por câmera em 60 dias contra 0,7 das outras, ≈ 3,3×). A conexão cai antes de cada falha:
 *      nas 24 h anteriores a média é ≈ 45 min online por hora, contra ≈ 58 no geral.
 *   + Eventos da cidade (EVENTOS): jogo de futebol em domingos alternados no Fragata, "quinta universitária"
 *     no Jardim Universitário e feira de quarta no Somenzari multiplicam as ocorrências naquelas horas.
 *   + Bairros: o peso fixo de cada bairro faz alguns ficarem claramente acima (Centro, Banzato, Maria Izabel…),
 *     o que dá ao "top 5 de risco" algo estável para acertar.
 *
 * Contagens com pouca variância: falhas e furtos de patinete usam amostragem sistemática do risco acumulado
 * (a próxima falha acontece quando o risco somado passa de um limiar que anda 0,6–1,4 a cada evento). A média
 * é exatamente a taxa plantada, mas sem a loteria de um Poisson puro — os padrões aparecem com folga.
 */
import {
  turnoCobreHora,
  type CategoriaAgente, type NecessidadeManutencao, type Regiao, type SituacaoEquipamento, type TipoOcorrencia, type Turno,
} from '../../shared/dominio';
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { GeoMarilia } from '../geo/marilia';
import { dataLocal, partesLocais, type PartesLocais } from '../tempo';
import { criarRng, derivarSemente, type Rng } from './aleatorio';
import { fatorFalhaModelo } from './catalogo-marcas';
import {
  atividadeVeiculo, gerarLeituraHora, LEITURAS_POR_MINUTO, minutosEscolaresNaHora, PERFIL_SEGURANCA, PERFIL_TEMPESTADE,
  PERFIL_TRAFEGO, soma, tipoDoDia,
} from './perfis';

export { BAIRROS_FURTO_PATINETE } from './cidade';

export const DIAS_HISTORICO = 60;
export const DIAS_PREVISAO = 7;
const HORA = 3_600_000;
const DIA = 24 * HORA;
const ANO = 365.25 * DIA;

// ---------------------------------------------------------------------------------------------------------------
// Clima

/** Chuva do dia (mm; 0 = seco). Depende só da semente e da data local: ≈ 25% dos dias chovem. */
export function chuvaDoDia(semente: number, data: string): number {
  const rng = criarRng(derivarSemente(semente, 'clima', data));
  if (!rng.chance(0.25)) return 0;
  return Math.round(Math.min(60, 2 + -Math.log(1 - rng.num()) * 13) * 10) / 10;
}

/** Acerto da previsão do tempo sintética: dias de chuva anunciados e dias secos anunciados como chuvosos (alarme falso). */
export const PREVISAO_ACERTA_CHUVA = 0.8;
export const PREVISAO_ALARME_FALSO = 0.1;

/**
 * Previsão do tempo para o dia, como estaria disponível na véspera (mm; 0 = sem chuva prevista). Determinística: depende
 * só da semente, da data e da chuva que de fato cai (`chuvaDoDia`). Dia de chuva: 80% das vezes a previsão anuncia chuva,
 * com a quantidade errada em até 40% para mais ou para menos; nos outros 20% anuncia tempo seco. Dia seco: 10% das vezes
 * anuncia de 2 a 12 mm que não vêm. As previsões (risco e teste retroativo) usam esta; o histórico e o simulador, a observada.
 */
export function previsaoDeChuva(semente: number, data: string, observadaMm: number): number {
  const rng = criarRng(derivarSemente(semente, 'previsao-chuva', data));
  const arred1 = (x: number) => Math.round(x * 10) / 10;
  if (observadaMm > 0) return rng.chance(PREVISAO_ACERTA_CHUVA) ? Math.max(0.5, arred1(observadaMm * rng.entre(0.6, 1.4))) : 0;
  return rng.chance(PREVISAO_ALARME_FALSO) ? arred1(rng.entre(2, 12)) : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Ocorrências

/** Total diário de cada tipo num dia útil típico da cidade inteira (antes de chuva, padrões e eventos). */
export const TOTAL_DIA_POR_TIPO: Record<TipoOcorrencia, number> = {
  acidente: 34, congestionamento: 45, infracao: 80, furto_vandalismo: 14, veiculo_quebrado: 20, alagamento: 0, seguranca: 95,
};
const FATOR_CHUVA: Partial<Record<TipoOcorrencia, number>> = { acidente: 1.8, congestionamento: 1.3, veiculo_quebrado: 1.2 };
const TIPOS_TRAFEGO: TipoOcorrencia[] = ['acidente', 'infracao', 'veiculo_quebrado'];
const SOMA_TRAFEGO = soma(PERFIL_TRAFEGO.util);
/** Soma do perfil de cada tipo de dia: acidentes têm o mesmo total todo dia (no fim de semana, mais lazer e noite). */
const SOMA_TRAFEGO_DIA = { util: SOMA_TRAFEGO, sabado: soma(PERFIL_TRAFEGO.sabado), domingo: soma(PERFIL_TRAFEGO.domingo) };
const CONGESTAO: Record<'util' | 'sabado' | 'domingo', number[]> = {
  util: PERFIL_TRAFEGO.util.map((x) => x ** 1.6),
  sabado: PERFIL_TRAFEGO.sabado.map((x) => x ** 1.6),
  domingo: PERFIL_TRAFEGO.domingo.map((x) => x ** 1.6),
};
const SOMA_CONGESTAO = soma(CONGESTAO.util);
const SOMA_SEGURANCA = soma(PERFIL_SEGURANCA);
const SOMA_TEMPESTADE = soma(PERFIL_TEMPESTADE);
/** Alagamentos por mm de chuva no dia (cidade inteira). */
const ALAGAMENTOS_POR_MM = 0.45;
/** Acidentes leves extras por escola por hora de janela escolar. */
const ACIDENTES_ESCOLA_POR_HORA = 0.1;
/** Multiplicador das noites de sexta e sábado no Centro (segurança e infração). */
export const FATOR_NOITE_CENTRO = 2.5;

export interface EventoCidade {
  nome: string;
  bairro: string;
  /** Dias da semana (0 = domingo) em que o evento começa. */
  dias: number[];
  /** Horas locais [início, fim); fim < início atravessa a meia-noite. */
  horas: [number, number];
  /** Só em semanas alternadas. */
  quinzenal?: boolean;
  fator: number;
  tipos: TipoOcorrencia[];
}

export const EVENTOS: readonly EventoCidade[] = [
  { nome: 'Jogo de futebol', bairro: 'Fragata', dias: [0], horas: [14, 19], quinzenal: true, fator: 2.2, tipos: ['congestionamento', 'infracao', 'seguranca', 'acidente'] },
  { nome: 'Quinta universitária', bairro: 'Jardim Universitário', dias: [4], horas: [22, 2], fator: 2, tipos: ['seguranca', 'infracao'] },
  { nome: 'Feira livre de quarta', bairro: 'Somenzari', dias: [3], horas: [6, 12], fator: 1.8, tipos: ['congestionamento', 'infracao'] },
];

function eventoAtivo(ev: EventoCidade, p: PartesLocais): boolean {
  const [h0, h1] = ev.horas;
  const semanaPar = Math.floor((Date.parse(`${p.data}T00:00:00Z`) / DIA + 4) / 7) % 2 === 0;
  if (h0 < h1) return ev.dias.includes(p.diaSemana) && p.hora >= h0 && p.hora < h1 && (!ev.quinzenal || semanaPar);
  return (ev.dias.includes(p.diaSemana) && p.hora >= h0) || (ev.dias.includes((p.diaSemana + 6) % 7) && p.hora < h1);
}

/** Sexta 20 h → sábado 2 h ou sábado 20 h → domingo 2 h (hora local). */
export function noiteDeFimDeSemana(p: PartesLocais): boolean {
  return ((p.diaSemana === 5 || p.diaSemana === 6) && p.hora >= 20) || ((p.diaSemana === 6 || p.diaSemana === 0) && p.hora < 2);
}

const GRAVIDADE: Record<TipoOcorrencia, Record<'1' | '2' | '3' | '4', number>> = {
  acidente: { 1: 0.5, 2: 0.3, 3: 0.15, 4: 0.05 },
  congestionamento: { 1: 0.35, 2: 0.45, 3: 0.2, 4: 0 },
  infracao: { 1: 0.7, 2: 0.25, 3: 0.05, 4: 0 },
  furto_vandalismo: { 1: 0.3, 2: 0.5, 3: 0.2, 4: 0 },
  veiculo_quebrado: { 1: 0.5, 2: 0.4, 3: 0.1, 4: 0 },
  alagamento: { 1: 0, 2: 0.4, 3: 0.4, 4: 0.2 },
  seguranca: { 1: 0.3, 2: 0.4, 3: 0.25, 4: 0.05 },
};
/** A gravidade mais alta que o tipo tem (eventos injetados pelo botão usam esta: demonstração previsível). */
export function gravidadeMaxima(tipo: TipoOcorrencia): 1 | 2 | 3 | 4 {
  const pesos = GRAVIDADE[tipo];
  return (['4', '3', '2', '1'] as const).map(Number).find((g) => pesos[String(g) as '1' | '2' | '3' | '4'] > 0) as 1 | 2 | 3 | 4;
}

const DURACAO_MIN: Record<TipoOcorrencia, [number, number]> = {
  acidente: [25, 120], congestionamento: [15, 90], infracao: [5, 25], furto_vandalismo: [30, 180],
  veiculo_quebrado: [30, 150], alagamento: [60, 240], seguranca: [15, 90],
};
const DESCRICOES: Record<TipoOcorrencia, string[]> = {
  acidente: ['Colisão traseira entre dois carros', 'Colisão lateral em cruzamento', 'Queda de motociclista', 'Colisão entre carro e moto',
    'Atropelamento de pedestre', 'Colisão com poste', 'Batida entre carro e ônibus'],
  congestionamento: ['Trânsito lento no horário de pico', 'Fila longa no semáforo', 'Lentidão por obra na via', 'Congestionamento por veículo parado na faixa'],
  infracao: ['Estacionamento em local proibido', 'Veículo em fila dupla', 'Avanço de sinal vermelho', 'Excesso de velocidade',
    'Motociclista sem capacete', 'Vaga de idoso ocupada sem credencial', 'Som automotivo alto'],
  furto_vandalismo: ['Pichação em equipamento público', 'Furto de cabos do semáforo', 'Placa de trânsito arrancada', 'Vandalismo em ponto de ônibus'],
  veiculo_quebrado: ['Carro quebrado na faixa', 'Caminhão com pane mecânica', 'Ônibus com pane', 'Moto com pneu furado na via'],
  alagamento: ['Alagamento na via após chuva forte', 'Bueiro transbordando', 'Ponto de alagamento com carros ilhados'],
  seguranca: ['Briga em via pública', 'Perturbação do sossego', 'Suspeita de furto a pedestre', 'Aglomeração com consumo de bebida na rua',
    'Roubo de celular', 'Pessoa em situação de risco'],
};
const DESCRICOES_GRAVES = ['Colisão grave com vítima presa nas ferragens', 'Atropelamento com vítima grave', 'Capotamento com feridos'];
const DESCRICOES_ESCOLA = ['Batida leve na saída da escola', 'Atropelamento sem gravidade perto da escola', 'Colisão leve entre van escolar e carro',
  'Queda de ciclista na frente da escola', 'Toque entre carros na fila de embarque da escola'];
const CATEGORIAS_POR_TIPO: Record<TipoOcorrencia, CategoriaAgente[]> = {
  acidente: ['agente_transito', 'policial_militar'],
  congestionamento: ['agente_transito'],
  infracao: ['agente_transito'],
  veiculo_quebrado: ['agente_transito'],
  seguranca: ['guarda_municipal', 'policial_militar'],
  furto_vandalismo: ['guarda_municipal', 'policial_militar'],
  alagamento: ['guarda_municipal', 'agente_transito'],
};
/** Fração das ocorrências com agente de turno da mesma região quando há um disponível. */
const CHANCE_AGENTE = 0.78;

export interface BairroHist {
  id: number;
  indice: number;
  nome: string;
  regiao: Regiao;
  /** Peso na taxa de ocorrências (soma 1). */
  peso: number;
  alagavel: boolean;
}

export interface AgenteHist {
  id: number;
  regiao: Regiao;
  turno: Turno;
  categoria: CategoriaAgente;
}

export interface EscolaHist {
  equipamentoId: number;
  codigo: string;
  bairroId: number;
  /** Pontos de rua perto da escola (o primeiro é a própria escola). */
  pontos: { lat: number; lng: number }[];
}

export interface EquipamentoLigado {
  id: number;
  codigo: string;
}

export interface ContextoHoras {
  semente: number;
  agora: Date;
  geo: GeoMarilia;
  bairros: BairroHist[];
  agentes: AgenteHist[];
  escolas: EscolaHist[];
  radaresPorBairro: Map<number, EquipamentoLigado[]>;
  sensoresPorBairro: Map<number, EquipamentoLigado[]>;
  chuvaMm: (data: string) => number;
}

export interface FurtoPendente {
  em: Date;
  equipamentoId: number;
  codigo: string;
  bairroId: number;
}

export interface OcorrenciaGerada {
  tipo: TipoOcorrencia;
  gravidade: number;
  bairroId: number;
  lat: number;
  lng: number;
  inicio: Date;
  fim: Date | null;
  equipamentoId: number | null;
  agenteId: number | null;
  descricao: string;
  chuva: boolean;
}

const indiceDaHora = (hora: Date) => Math.floor(hora.getTime() / HORA);

/**
 * Ocorrências da hora que começa em `hora` (UTC, minutos zerados). Determinística: o sorteio usa a semente e o
 * índice da hora, então gerar a mesma hora de novo (semente ou lacuna) dá o mesmo resultado.
 */
export function gerarOcorrenciasDaHora(
  ctx: ContextoHoras,
  hora: Date,
  furtos: readonly FurtoPendente[] = [],
  aoVivo: { rng: Rng; escala: number } | undefined = undefined,
): OcorrenciaGerada[] {
  // Ao vivo (simulador): sorteio do próprio simulador e `escala` = fração da hora (× velocidade) que esta chamada representa.
  const rng = aoVivo?.rng ?? criarRng(derivarSemente(ctx.semente, 'ocorrencias', indiceDaHora(hora)));
  const escala = aoVivo?.escala ?? 1;
  const p = partesLocais(hora);
  const td = tipoDoDia(p.diaSemana);
  const mm = ctx.chuvaMm(p.data);
  const chuva = mm > 0;
  const noiteCentro = noiteDeFimDeSemana(p);
  const eventos = EVENTOS.filter((ev) => eventoAtivo(ev, p));

  const deTurno = new Map<Regiao, AgenteHist[]>();
  for (const a of ctx.agentes) {
    if (!turnoCobreHora(a.turno, p.hora)) continue;
    const lista = deTurno.get(a.regiao) ?? [];
    lista.push(a);
    deTurno.set(a.regiao, lista);
  }

  const saida: OcorrenciaGerada[] = [];
  const usados = new Set<string>();
  const regiaoDo = new Map(ctx.bairros.map((b) => [b.id, b.regiao]));

  const registrar = (o: Omit<OcorrenciaGerada, 'inicio' | 'fim' | 'agenteId' | 'chuva'> & { segundo: number }) => {
    let s = o.segundo;
    while (usados.has(`${o.bairroId}|${o.tipo}|${s}`)) s = (s + 1) % 3600;
    usados.add(`${o.bairroId}|${o.tipo}|${s}`);
    const inicio = new Date(hora.getTime() + s * 1000);
    const [dMin, dMax] = DURACAO_MIN[o.tipo];
    const fimMs = inicio.getTime() + rng.int(dMin, dMax) * 60_000;
    const candidatos = (deTurno.get(regiaoDo.get(o.bairroId)!) ?? []).filter((a) => CATEGORIAS_POR_TIPO[o.tipo].includes(a.categoria));
    const agenteId = candidatos.length > 0 && rng.chance(CHANCE_AGENTE) ? rng.escolher(candidatos).id : null;
    saida.push({
      tipo: o.tipo, gravidade: o.gravidade, bairroId: o.bairroId, lat: o.lat, lng: o.lng, inicio,
      fim: fimMs <= ctx.agora.getTime() ? new Date(fimMs) : null, equipamentoId: o.equipamentoId, agenteId, descricao: o.descricao, chuva,
    });
  };
  const pontoNoBairro = (b: BairroHist) => {
    const pt = ctx.geo.pontoAleatorioNaRua(rng, b.indice);
    return { lat: Math.round(pt.lat * 1e6) / 1e6, lng: Math.round(pt.lng * 1e6) / 1e6 };
  };

  for (const tipo of Object.keys(TOTAL_DIA_POR_TIPO) as TipoOcorrencia[]) {
    let base: number;
    if (tipo === 'alagamento') base = chuva ? (ALAGAMENTOS_POR_MM * mm * PERFIL_TEMPESTADE[p.hora]!) / SOMA_TEMPESTADE : 0;
    else if (tipo === 'congestionamento') base = (TOTAL_DIA_POR_TIPO[tipo] * CONGESTAO[td][p.hora]!) / SOMA_CONGESTAO;
    else if (tipo === 'acidente') base = (TOTAL_DIA_POR_TIPO[tipo] * PERFIL_TRAFEGO[td][p.hora]!) / SOMA_TRAFEGO_DIA[td];
    else if (TIPOS_TRAFEGO.includes(tipo)) base = (TOTAL_DIA_POR_TIPO[tipo] * PERFIL_TRAFEGO[td][p.hora]!) / SOMA_TRAFEGO;
    else base = (TOTAL_DIA_POR_TIPO[tipo] * PERFIL_SEGURANCA[p.hora]!) / SOMA_SEGURANCA;
    if (chuva) base *= FATOR_CHUVA[tipo] ?? 1;
    if (base <= 0) continue;

    // Peso de cada bairro nesta hora: base do bairro × padrões plantados × eventos.
    const pesos = ctx.bairros.map((b) => {
      let w = b.peso;
      if (tipo === 'alagamento') w *= b.alagavel ? 6 : 0.4;
      if (noiteCentro && b.regiao === 'Centro' && (tipo === 'seguranca' || tipo === 'infracao')) w *= FATOR_NOITE_CENTRO;
      for (const ev of eventos) if (ev.bairro === b.nome && ev.tipos.includes(tipo)) w *= ev.fator;
      return w;
    });
    let total = pesos.reduce((s, w) => s + w, 0);
    if (tipo === 'alagamento') {
      for (let i = 0; i < pesos.length; i++) pesos[i]! /= total;
      total = 1;
    }
    const n = rng.poisson(base * total * escala);
    for (let k = 0; k < n; k++) {
      let alvo = rng.num() * total;
      let i = 0;
      while (i < pesos.length - 1 && (alvo -= pesos[i]!) >= 0) i++;
      const b = ctx.bairros[i]!;
      const gravidade = Number(rng.peso(GRAVIDADE[tipo]));
      let equipamentoId: number | null = null;
      let descricao = gravidade === 4 && tipo === 'acidente' ? rng.escolher(DESCRICOES_GRAVES) : rng.escolher(DESCRICOES[tipo]);
      const radares = ctx.radaresPorBairro.get(b.id);
      const sensores = ctx.sensoresPorBairro.get(b.id);
      if (tipo === 'infracao' && radares && rng.chance(0.45)) {
        const r = rng.escolher(radares);
        equipamentoId = r.id;
        descricao = `${rng.escolher(['Excesso de velocidade', 'Avanço de sinal vermelho', 'Parada sobre a faixa'])} flagrado pelo radar ${r.codigo}`;
      } else if (tipo === 'alagamento' && sensores && rng.chance(0.7)) {
        const s = rng.escolher(sensores);
        equipamentoId = s.id;
        descricao = `${descricao} (sensor ${s.codigo} acima da altura de alerta)`;
      }
      registrar({ tipo, gravidade, bairroId: b.id, ...pontoNoBairro(b), equipamentoId, descricao, segundo: rng.int(0, 3599) });
    }
  }

  // Padrão 3: acidentes leves perto das escolas nas janelas de entrada e saída.
  for (const trecho of minutosEscolaresNaHora(p)) {
    const fracao = (trecho.fim - trecho.inicio) / 60;
    for (const escola of ctx.escolas) {
      // `escala`: ao vivo cada chamada é um tick (fração da hora); sem ela, cada tick de 2 s gerava a hora inteira.
      const n = rng.poisson(ACIDENTES_ESCOLA_POR_HORA * fracao * escala * (chuva ? FATOR_CHUVA.acidente! : 1));
      for (let k = 0; k < n; k++) {
        const pt = rng.escolher(escola.pontos);
        registrar({
          tipo: 'acidente', gravidade: 1, bairroId: escola.bairroId, lat: pt.lat, lng: pt.lng,
          equipamentoId: rng.chance(0.3) ? escola.equipamentoId : null, descricao: rng.escolher(DESCRICOES_ESCOLA),
          segundo: rng.int(trecho.inicio * 60, trecho.fim * 60 - 1),
        });
      }
    }
  }

  // Padrão 5: furtos de patinete vindos da linha do tempo dos equipamentos.
  const porId = new Map(ctx.bairros.map((b) => [b.id, b]));
  for (const f of furtos) {
    const b = porId.get(f.bairroId)!;
    registrar({
      tipo: 'furto_vandalismo', gravidade: 2, bairroId: b.id, ...pontoNoBairro(b), equipamentoId: f.equipamentoId,
      descricao: `Furto de ${f.codigo.includes('-PAT-') ? 'patinete' : 'equipamento'} ${f.codigo}`, segundo: Math.floor((f.em.getTime() - hora.getTime()) / 1000),
    });
  }

  return saida.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

// ---------------------------------------------------------------------------------------------------------------
// Telemetria

/** Estado de um equipamento numa hora do histórico. */
export const ESTADO = { DESLIGADO: 0, NORMAL: 1, PRECURSOR: 2, FALHANDO: 3 } as const;
export type EstadoHora = (typeof ESTADO)[keyof typeof ESTADO];

export interface EquipamentoHist {
  id: number;
  tipo: TipoEquipamentoId;
  /** `fatorLocalEquipamento` (escala do movimento). */
  escala: number;
  /** Fator de modelo × idade: aumenta as quedas de sinal ocasionais. */
  fatorRisco: number;
  turnos?: Turno[];
  categoria?: string;
  bateriaFinal?: number;
}

export interface LinhaTelemetria {
  leituras: number;
  onlineMin: number;
  metricas: Record<string, number>;
}

/** Probabilidade de queda de sinal numa hora normal, para fator de risco 1. */
const QUEDA_POR_HORA = 0.012;

export function linhaTelemetria(eq: EquipamentoHist, hora: Date, estado: EstadoHora, chuvaMm: number, rng: Rng): LinhaTelemetria | null {
  if (estado === ESTADO.DESLIGADO) return null;
  let onlineMin = 60;
  if (estado === ESTADO.FALHANDO) onlineMin = rng.int(2, 25);
  else if (estado === ESTADO.PRECURSOR) onlineMin = rng.chance(0.55) ? rng.int(12, 50) : 60;
  else if (rng.chance(QUEDA_POR_HORA * eq.fatorRisco)) onlineMin = rng.int(35, 58);
  const metricas = gerarLeituraHora(eq.tipo, hora, rng, {
    chuva: chuvaMm > 0, chuvaMm, falhando: estado === ESTADO.FALHANDO, bairroFator: eq.escala, onlineMin,
    atividade: atividadeVeiculo(eq.tipo, hora, { categoria: eq.categoria, turnos: eq.turnos }),
  });
  return { leituras: Math.max(1, Math.round(onlineMin * LEITURAS_POR_MINUTO[eq.tipo])), onlineMin, metricas };
}

export function fatorRiscoEquipamento(confiabilidade: number, instaladoEm: Date | null, agora: Date): number {
  const anos = instaladoEm ? Math.max(0, (agora.getTime() - instaladoEm.getTime()) / ANO) : 0;
  return fatorFalhaModelo(confiabilidade) * (1 + anos / 5);
}

// ---------------------------------------------------------------------------------------------------------------
// Linha do tempo de cada equipamento (falhas, preventivas, furtos e situação final)

/** Falhas por dia de um equipamento novo, de modelo com confiabilidade 0,92 e manutenção em dia. */
export const FALHAS_POR_DIA: Record<TipoEquipamentoId, number> = {
  radar: 0.008, camera: 0.008, semaforo: 0.007, patinete: 0.012, totem_rotativo: 0.008, cancela: 0.008, balanca: 0.007,
  painel_mensagem: 0.006, sensor_alagamento: 0.006, transporte: 0.005, moto_agente: 0.006, viatura: 0.006, fiscal_rotativo: 0.007,
};
/** Furtos por dia de um patinete fora dos bairros quentes. */
export const FURTOS_PATINETE_POR_DIA = 0.006;
export const FATOR_FURTO_BAIRRO_QUENTE = 3;

export const FALHAS: Record<TipoEquipamentoId, { sintoma: string; acao: string }[]> = {
  radar: [{ sintoma: 'radar sem leitura de veículos', acao: 'troca do laço indutivo danificado' },
    { sintoma: 'fotos de flagrante sem foco', acao: 'limpeza e ajuste da câmera de flagrante' },
    { sintoma: 'radar sem comunicação com a central', acao: 'troca do modem 4G' }],
  camera: [{ sintoma: 'imagem congelada', acao: 'troca da fonte de alimentação' }, { sintoma: 'câmera sem conexão', acao: 'troca do switch PoE' },
    { sintoma: 'imagem escura à noite', acao: 'troca do iluminador infravermelho' }],
  semaforo: [{ sintoma: 'amarelo piscante fora de hora', acao: 'troca do controlador de fases' }, { sintoma: 'grupo focal apagado', acao: 'troca dos módulos de LED' },
    { sintoma: 'perda de sincronismo com a rede', acao: 'reconfiguração do plano semafórico' }],
  balanca: [{ sintoma: 'pesagens inconsistentes', acao: 'recalibração dos sensores de pesagem' }, { sintoma: 'balança sem comunicação', acao: 'troca do módulo de comunicação' }],
  fiscal_rotativo: [{ sintoma: 'câmera de leitura de placas sem sinal', acao: 'troca da câmera OCR' }, { sintoma: 'pane elétrica', acao: 'reparo do sistema elétrico' }],
  cancela: [{ sintoma: 'braço da cancela travado', acao: 'troca do motor da cancela' }, { sintoma: 'leitor de tag sem resposta', acao: 'troca do leitor RFID' }],
  transporte: [{ sintoma: 'pane mecânica', acao: 'reparo mecânico em oficina credenciada' }, { sintoma: 'rastreador sem sinal', acao: 'troca do rastreador' }],
  totem_rotativo: [{ sintoma: 'leitor de cartão com defeito', acao: 'troca do leitor de cartão' }, { sintoma: 'tela sem resposta ao toque', acao: 'troca da tela' }],
  patinete: [{ sintoma: 'bateria não carrega', acao: 'troca do módulo da bateria' }, { sintoma: 'freio com defeito', acao: 'regulagem e troca do freio' },
    { sintoma: 'trava eletrônica emperrada', acao: 'troca da trava' }],
  moto_agente: [{ sintoma: 'pane elétrica', acao: 'reparo elétrico' }, { sintoma: 'pneu furado', acao: 'troca de pneu' }],
  viatura: [{ sintoma: 'pane mecânica', acao: 'reparo mecânico' }, { sintoma: 'giroflex sem funcionar', acao: 'troca do giroflex' }],
  painel_mensagem: [{ sintoma: 'módulos de LED apagados', acao: 'troca dos módulos de LED' }, { sintoma: 'painel sem comunicação', acao: 'troca do modem' }],
  sensor_alagamento: [{ sintoma: 'leitura travada em zero', acao: 'limpeza do sensor ultrassônico' }, { sintoma: 'sensor sem comunicação', acao: 'troca da bateria e do rádio' }],
};
const PREVENTIVA: Record<TipoEquipamentoId, string> = {
  radar: 'aferição, limpeza das lentes e teste dos laços', camera: 'limpeza da cúpula, ajuste de foco e teste de gravação',
  semaforo: 'revisão do controlador, focos e botoeira', balanca: 'calibração e limpeza das placas de pesagem',
  fiscal_rotativo: 'revisão do veículo e das câmeras de leitura de placas', cancela: 'lubrificação do braço e teste do leitor',
  transporte: 'vistoria semestral do veículo', totem_rotativo: 'limpeza, troca da bobina e teste dos meios de pagamento',
  patinete: 'revisão de freios, pneus e bateria', moto_agente: 'revisão mecânica', viatura: 'revisão mecânica e dos equipamentos de sinalização',
  painel_mensagem: 'teste dos módulos de LED e da comunicação', sensor_alagamento: 'limpeza do sensor e troca da bateria',
};
const DESATIVACAO = ['ponto removido para obra de recapeamento', 'substituído por equipamento novo', 'contrato encerrado com o fornecedor',
  'local sem demanda após mudança de mão da via'];

export interface PlanoEquipamento {
  tipo: TipoEquipamentoId;
  confiabilidade: number;
  instaladoEm: Date | null;
  situacao: SituacaoEquipamento;
  necessidade: NecessidadeManutencao;
  periodicidadeDias: number | null;
  negligente: boolean;
  inspecaoImediata: boolean;
  /** Patinete num bairro de furto 3× maior. */
  furtoQuente: boolean;
}

export interface Janela {
  /** Primeira hora do histórico (UTC, minutos zerados). */
  inicio: Date;
  horas: number;
  agora: Date;
}

export interface EventoSituacaoGerado {
  de: SituacaoEquipamento;
  para: SituacaoEquipamento;
  motivo: string;
  em: Date;
}

export interface ManutencaoGerada {
  tipo: 'corretiva' | 'preventiva';
  abertaEm: Date;
  previstaPara: string;
  concluidaEm: Date | null;
  descricao: string;
}

export interface LinhaDoTempo {
  estados: Uint8Array;
  historico: EventoSituacaoGerado[];
  manutencoes: ManutencaoGerada[];
  furtos: Date[];
  ultimaManutencao: string | null;
  proximaManutencao: string | null;
  necessidade: NecessidadeManutencao;
  ultimoSinalEm: Date | null;
  atualizadoEm: Date | null;
}

/**
 * Simula hora a hora a vida de um equipamento na janela e termina exatamente na situação sorteada para `agora`.
 * `proximaOs` numera as ordens de serviço.
 */
export function construirLinhaDoTempo(plano: PlanoEquipamento, janela: Janela, rng: Rng, proximaOs: () => string): LinhaDoTempo {
  const H = janela.horas;
  const t0 = janela.inicio.getTime();
  const agora = janela.agora.getTime();
  const estados = new Uint8Array(H);
  const historico: EventoSituacaoGerado[] = [];
  const manutencoes: ManutencaoGerada[] = [];
  const furtos: Date[] = [];
  const vazio: LinhaDoTempo = {
    estados, historico, manutencoes, furtos, ultimaManutencao: null, proximaManutencao: null, necessidade: plano.necessidade,
    ultimoSinalEm: null, atualizadoEm: null,
  };
  if (plano.situacao === 'nao_instalado' || !plano.instaladoEm) return { ...vazio, necessidade: 'nenhuma' };

  const instalado = plano.instaladoEm.getTime();
  const idx = (ms: number) => Math.floor((ms - t0) / HORA);
  const marcar = (deMs: number, ateMs: number, valor: EstadoHora, soSobreNormal = false) => {
    for (let h = Math.max(0, idx(deMs)); h <= Math.min(H - 1, idx(ateMs - 1)); h++) {
      if (!soSobreNormal || estados[h] === ESTADO.NORMAL) estados[h] = valor;
    }
  };
  const P = plano.periodicidadeDias ? plano.periodicidadeDias * DIA : null;
  const movel = ['transporte', 'moto_agente', 'viatura', 'fiscal_rotativo'].includes(plano.tipo);
  const modelo = fatorFalhaModelo(plano.confiabilidade);
  const { sintoma: sintomaFinal } = rng.escolher(FALHAS[plano.tipo]);

  // Situação final: define até quando o equipamento esteve ativo e até quando cabem eventos sorteados.
  let fimAtivo = agora;
  let limite = agora - HORA;
  let ultimoSinal: Date | null = new Date(agora - rng.int(5, 90) * 1000);
  const final: (() => void)[] = [];
  const precursor = (tf: number) => marcar(tf - rng.int(12, 48) * HORA, tf, ESTADO.PRECURSOR, true);

  switch (plano.situacao) {
    case 'mau_funcionamento': {
      const tf = Math.max(instalado + HORA, agora - rng.int(3, 96) * HORA - rng.int(0, 59) * 60_000);
      limite = tf - 2 * HORA;
      final.push(() => {
        precursor(tf);
        marcar(tf, agora, ESTADO.FALHANDO);
        const os = proximaOs();
        historico.push({ de: 'operacional', para: 'mau_funcionamento', motivo: `Falha detectada: ${sintomaFinal} (${os})`, em: new Date(tf) });
        manutencoes.push({
          tipo: 'corretiva', abertaEm: new Date(Math.min(agora - 60_000, tf + rng.int(10, 90) * 60_000)),
          previstaPara: dataLocal(new Date(agora + rng.int(0, 2) * DIA)), concluidaEm: null, descricao: `Diagnóstico e reparo: ${sintomaFinal} (${os})`,
        });
      });
      break;
    }
    case 'em_manutencao': {
      if (P && rng.chance(0.3)) {
        const ts = agora - rng.int(1, 5) * HORA;
        limite = ts - 2 * HORA;
        ultimoSinal = new Date(ts);
        final.push(() => {
          marcar(ts, agora, ESTADO.DESLIGADO);
          const os = proximaOs();
          historico.push({ de: 'operacional', para: 'em_manutencao', motivo: `Manutenção preventiva em andamento (${os})`, em: new Date(ts) });
          manutencoes.push({ tipo: 'preventiva', abertaEm: new Date(ts - rng.int(2, 7) * DIA), previstaPara: dataLocal(new Date(ts)), concluidaEm: null,
            descricao: `Preventiva: ${PREVENTIVA[plano.tipo]} (${os})` });
        });
      } else {
        const tf = Math.max(instalado + HORA, agora - rng.int(26, 200) * HORA);
        const equipe = Math.min(agora - HORA - tf, rng.int(2, 24) * HORA);
        limite = tf - 2 * HORA;
        ultimoSinal = new Date(tf + equipe);
        final.push(() => {
          precursor(tf);
          marcar(tf, tf + equipe, ESTADO.FALHANDO);
          marcar(tf + equipe, agora, ESTADO.DESLIGADO);
          const os = proximaOs();
          historico.push({ de: 'operacional', para: 'mau_funcionamento', motivo: `Falha detectada: ${sintomaFinal} (${os})`, em: new Date(tf) });
          historico.push({ de: 'mau_funcionamento', para: 'em_manutencao', motivo: `Equipe técnica no local (${os})`, em: new Date(tf + equipe) });
          manutencoes.push({ tipo: 'corretiva', abertaEm: new Date(tf + rng.int(10, 90) * 60_000), previstaPara: dataLocal(new Date(agora + rng.int(0, 3) * DIA)),
            concluidaEm: null, descricao: `Reparo em andamento: ${sintomaFinal} (${os})` });
        });
      }
      break;
    }
    case 'furtado': {
      const tf = Math.max(instalado + DIA, agora - rng.int(6, 360) * HORA - rng.int(0, 59) * 60_000);
      fimAtivo = tf;
      limite = tf - 2 * HORA;
      ultimoSinal = new Date(tf);
      final.push(() => {
        historico.push({
          de: 'operacional', para: 'furtado', em: new Date(tf),
          motivo: plano.tipo === 'patinete' ? 'Furto registrado pela operadora (sem sinal fora da área de operação)' : 'Furto do equipamento (cabos e módulo levados)',
        });
        if (tf >= t0) furtos.push(new Date(tf));
      });
      break;
    }
    case 'desativado': {
      const td = Math.min(agora - DIA, Math.max(instalado + 20 * DIA, agora - rng.int(3, 200) * DIA));
      fimAtivo = td;
      limite = td - 2 * HORA;
      ultimoSinal = new Date(td);
      final.push(() => historico.push({ de: 'operacional', para: 'desativado', motivo: `Desativado: ${rng.escolher(DESATIVACAO)}`, em: new Date(td) }));
      break;
    }
    default:
      break;
  }

  const ativoDesde = Math.max(t0, instalado);
  marcar(ativoDesde, fimAtivo, ESTADO.NORMAL);

  // Manutenção preventiva: última antes da janela e próxima data devida.
  let ultima: number | null = null;
  let devida = Infinity;
  if (P) {
    const antes = Math.max(instalado, t0 - rng.entre(0, 1) * P);
    ultima = antes;
    devida = antes + P;
  }
  // Equipe negligente: nenhuma preventiva devida na janela é feita (a manutenção fica atrasada até uma falha).
  const negligenteDesde = plano.negligente ? t0 - (P ?? 0) : Infinity;

  // Risco acumulado (amostragem sistemática): falha quando passa do limiar.
  let riscoFalha = 0;
  let limiarFalha = rng.num();
  let riscoFurto = 0;
  let limiarFurto = rng.num();
  const taxaFurto = plano.tipo === 'patinete' ? (FURTOS_PATINETE_POR_DIA * (plano.furtoQuente ? FATOR_FURTO_BAIRRO_QUENTE : 1)) / 24 : 0;

  for (let h = Math.max(0, idx(ativoDesde)); h < H; h++) {
    const t = t0 + h * HORA;
    if (t >= limite) break;
    if (estados[h] !== ESTADO.NORMAL && estados[h] !== ESTADO.PRECURSOR) continue;

    // Preventiva devida: no primeiro horário comercial (seg–sáb, 8–16 h) depois da data.
    if (P && t >= devida && devida < negligenteDesde) {
      const lp = partesLocais(new Date(t));
      if (lp.diaSemana !== 0 && lp.hora >= 8 && lp.hora <= 16) {
        const inicio = t + rng.int(0, 40) * 60_000;
        const fim = inicio + rng.int(60, 200) * 60_000;
        if (fim < limite) {
          const os = proximaOs();
          marcar(inicio, fim, ESTADO.DESLIGADO);
          historico.push({ de: 'operacional', para: 'em_manutencao', motivo: `Manutenção preventiva periódica (${os})`, em: new Date(inicio) });
          historico.push({ de: 'em_manutencao', para: 'operacional', motivo: `Manutenção preventiva concluída (${os})`, em: new Date(fim) });
          manutencoes.push({ tipo: 'preventiva', abertaEm: new Date(devida - rng.int(2, 7) * DIA), previstaPara: dataLocal(new Date(devida)),
            concluidaEm: new Date(fim), descricao: `Preventiva: ${PREVENTIVA[plano.tipo]} (${os})` });
          ultima = fim;
          devida = fim + P;
          continue;
        }
      }
    }

    const atrasoDias = P && t > devida ? (t - devida) / DIA : 0;
    const idade = Math.max(0, (t - instalado) / ANO);
    riscoFalha += (FALHAS_POR_DIA[plano.tipo] / 24) * modelo * (1 + idade / 5) * Math.min(3, 1 + atrasoDias / 30);
    riscoFurto += taxaFurto;

    if (riscoFurto >= limiarFurto) {
      limiarFurto += rng.entre(0.6, 1.4);
      const tf = t + rng.int(0, 59) * 60_000;
      const volta = tf + rng.int(3, 60) * HORA;
      if (volta < limite) {
        marcar(tf, volta, ESTADO.DESLIGADO);
        historico.push({ de: 'operacional', para: 'furtado', motivo: 'Furto registrado pela operadora (sem sinal fora da área de operação)', em: new Date(tf) });
        historico.push({ de: 'furtado', para: 'operacional', motivo: 'Recuperado pela operadora (rastreamento por GPS)', em: new Date(volta) });
        furtos.push(new Date(tf));
        continue;
      }
    }

    if (riscoFalha >= limiarFalha) {
      limiarFalha += rng.entre(0.6, 1.4);
      const tf = t + rng.int(0, 59) * 60_000;
      const equipe = (movel ? rng.int(1, 6) : rng.int(6, 120)) * HORA;
      const reparo = (movel ? rng.int(4, 48) : rng.int(4, 60)) * HORA;
      if (tf + equipe + reparo < limite) {
        const { sintoma, acao } = rng.escolher(FALHAS[plano.tipo]);
        const os = proximaOs();
        precursor(tf);
        marcar(tf, tf + equipe, ESTADO.FALHANDO);
        marcar(tf + equipe, tf + equipe + reparo, ESTADO.DESLIGADO);
        historico.push({ de: 'operacional', para: 'mau_funcionamento', motivo: `Falha detectada: ${sintoma} (${os})`, em: new Date(tf) });
        historico.push({ de: 'mau_funcionamento', para: 'em_manutencao', motivo: `Equipe técnica no local (${os})`, em: new Date(tf + equipe) });
        historico.push({ de: 'em_manutencao', para: 'operacional', motivo: `Reparo concluído: ${acao} (${os})`, em: new Date(tf + equipe + reparo) });
        manutencoes.push({ tipo: 'corretiva', abertaEm: new Date(tf + rng.int(5, 60) * 60_000), previstaPara: dataLocal(new Date(tf + equipe)),
          concluidaEm: new Date(tf + equipe + reparo), descricao: `${acao[0]!.toUpperCase()}${acao.slice(1)} (${os})` });
        // Toda manutenção concluída reinicia o calendário (mesma regra do cadastro).
        ultima = tf + equipe + reparo;
        if (P) devida = ultima + P;
      }
    }
  }

  for (const f of final) f();

  // Pedidos em aberto no fim da janela.
  let necessidade = plano.necessidade;
  let proxima: string | null = P ? dataLocal(new Date(devida)) : null;
  if (plano.situacao === 'mau_funcionamento') necessidade = 'imediata';
  if (plano.necessidade === 'agendada') {
    proxima = dataLocal(new Date(agora + rng.int(2, 30) * DIA));
    manutencoes.push({ tipo: 'preventiva', abertaEm: new Date(agora - rng.int(1, 12) * DIA), previstaPara: proxima, concluidaEm: null,
      descricao: `Manutenção agendada: ${PREVENTIVA[plano.tipo]}` });
  }
  if (plano.inspecaoImediata) {
    necessidade = 'imediata';
    manutencoes.push({ tipo: 'corretiva', abertaEm: new Date(agora - rng.int(1, 30) * HORA), previstaPara: dataLocal(new Date(agora + rng.int(0, 1) * DIA)),
      concluidaEm: null, descricao: `Inspeção solicitada pela equipe de rua: ${rng.escolher(FALHAS[plano.tipo]).sintoma}` });
  }
  if (plano.situacao === 'desativado') {
    necessidade = 'nenhuma';
    proxima = null;
  }

  historico.sort((a, b) => a.em.getTime() - b.em.getTime());
  manutencoes.sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());
  return {
    estados, historico, manutencoes, furtos,
    ultimaManutencao: ultima !== null ? dataLocal(new Date(ultima)) : null,
    proximaManutencao: proxima,
    necessidade,
    ultimoSinalEm: ultimoSinal,
    atualizadoEm: historico.length ? historico[historico.length - 1]!.em : null,
  };
}
