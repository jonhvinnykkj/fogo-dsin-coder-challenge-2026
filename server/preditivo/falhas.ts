// Manutenção preditiva: chance de cada equipamento operacional falhar nos próximos 7 dias.
//
// Falha = mudança de situação para 'mau_funcionamento' (base.ts). Taxas medidas nos últimos 60 dias.
//   λ (falhas por dia) = λ_tipo × fator_modelo × fator_idade × fator_manutenção × fator_quedas
//   probabilidade em 7 dias = 1 − e^(−7 × λ)        (chance de pelo menos uma falha num processo de Poisson)
//     Ex.: λ = 0,02/dia → 1 − e^(−0,14) = 13%.
//   λ_tipo          = falhas do tipo ÷ (equipamentos do tipo × 60 dias) ÷ fator do equipamento típico do tipo.
//                     A taxa observada já é a de um equipamento típico (com idade, atraso e quedas típicos). Dividindo pelo
//                     produto dos fatores do equipamento do meio da fila (mediana), o típico fica com a taxa observada, quem
//                     tem fatores piores fica acima e quem tem melhores fica abaixo — sem contar a idade média duas vezes.
//                     Ex. (semente padrão): 79 falhas em 60 câmeras em 60 dias = 0,022/dia; se os fatores da câmera típica,
//                     multiplicados, dão 1,5, λ_tipo = 0,022 ÷ 1,5 = 0,015/dia. Sem essa divisão a soma das chances dava quase o
//                     dobro das falhas que de fato aconteceram (conferido no teste retroativo).
//   fator_modelo    = (falhas do modelo + 3) ÷ (falhas que o modelo teria na taxa média do tipo + 3)   — suavizado: com
//                     poucos equipamentos o fator fica perto de 1. Ex.: VX-200, 51 falhas em 21 câmeras, onde a média do tipo
//                     daria 0,022 × 21 × 60 = 27,7 → (51 + 3) ÷ (27,7 + 3) = 1,76.
//   fator_idade     = 1 + anos desde a instalação ÷ 5. Ex.: 3 anos → 1,6.
//   fator_manutenção = 1 + dias de manutenção atrasada ÷ 30, no máximo 3. Ex.: 40 dias → 2,33.
//   fator_quedas    = 1 + horas com sinal fraco (menos de 55 min conectado) nas últimas 72 h ÷ 3. Ex.: 6 horas → 3.
// O teste retroativo refaz a conta como se fosse 7 dias atrás e compara com as falhas que de fato aconteceram.
import type { Database } from 'better-sqlite3';
import type { SituacaoEquipamento } from '../../shared/dominio';
import { formatarChance, formatarNumero } from '../../shared/formato';
import type { ExplicacaoPrevisao, RespostaFalhas, RiscoFalha } from '../../shared/modelos';
import { NOME_DO_TIPO, type TipoEquipamentoId } from '../../shared/tipos-equipamento';
import { dataLocal } from '../tempo';
import { arred, DIA_MS, falhasPorEquipamento, HORA_MS, inicioDaHoraMs, inicioDoHistorico, mediana, mudancasDeSituacao, quedasDeSinal, situacaoNoInstante } from './base';

export const DIAS_TAXA = 60;
export const HORIZONTE_DIAS = 7;
/** Falhas "neutras" somadas em cima e embaixo do fator do modelo (suavização). */
export const K_MODELO = 3;
export const HORAS_QUEDAS = 72;
const ANO_MS = 365.25 * DIA_MS;

interface LinhaEquipamento {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  marca: string;
  modelo: string;
  situacao: SituacaoEquipamento;
  instalado_em: string | null;
  proxima_manutencao: string | null;
  bairro_nome: string;
}

interface RiscoInterno extends RiscoFalha {
  lambda: number;
}

export interface CalculoFalhas {
  riscos: RiscoInterno[];
  /** Falhas na janela de 60 dias (toda a frota). */
  falhasJanela: number;
}

const chaveModelo = (e: Pick<LinhaEquipamento, 'tipo' | 'marca' | 'modelo'>) => `${e.tipo}|${e.marca}|${e.modelo}`;

/**
 * Riscos de falha calculados como se fosse `instanteMs` (só com dados anteriores a ele). Com `atual`, a situação de cada
 * equipamento é a do cadastro; sem ele (teste retroativo), é reconstruída pelo histórico de situação naquele instante.
 */
export function calcularRiscosDeFalha(db: Database, instanteMs: number, { atual = false }: { atual?: boolean } = {}): CalculoFalhas {
  const equipamentos = db
    .prepare('SELECT e.id, e.codigo, e.tipo, e.marca, e.modelo, e.situacao, e.instalado_em, e.proxima_manutencao, b.nome AS bairro_nome FROM equipamentos e JOIN bairros b ON b.id = e.bairro_id')
    .all() as LinhaEquipamento[];
  const mudancas = atual ? new Map() : mudancasDeSituacao(db);
  const situacao = new Map(equipamentos.map((e) => [e.id, atual ? e.situacao : situacaoNoInstante(e.situacao, mudancas.get(e.id), instanteMs)]));
  // Janela de 60 dias, ou menos se o histórico começa depois (teste retroativo).
  const desde = Math.max(instanteMs - DIAS_TAXA * DIA_MS, inicioDoHistorico(db) ?? instanteMs - DIAS_TAXA * DIA_MS);
  const diasJanela = Math.max(1, (instanteMs - desde) / DIA_MS);
  const falhas = falhasPorEquipamento(db, desde, instanteMs);
  const quedas = quedasDeSinal(db, instanteMs - HORAS_QUEDAS * HORA_MS, inicioDaHoraMs(instanteMs));
  const hoje = dataLocal(new Date(instanteMs));

  // Taxas por tipo e por modelo (frota = tudo que já estava instalado).
  const porTipo = new Map<string, { falhas: number; frota: number }>();
  const porModelo = new Map<string, { falhas: number; frota: number }>();
  let falhasJanela = 0;
  for (const e of equipamentos) {
    if (situacao.get(e.id) === 'nao_instalado') continue;
    const f = falhas.get(e.id) ?? 0;
    falhasJanela += f;
    for (const [mapa, chave] of [[porTipo, e.tipo], [porModelo, chaveModelo(e)]] as const) {
      const acc = mapa.get(chave) ?? { falhas: 0, frota: 0 };
      acc.falhas += f;
      acc.frota++;
      mapa.set(chave, acc);
    }
  }
  const lambdaTipo = (tipo: string) => {
    const t = porTipo.get(tipo);
    return t && t.frota > 0 ? t.falhas / (t.frota * diasJanela) : 0;
  };
  const fatorModelo = (e: LinhaEquipamento) => {
    const m = porModelo.get(chaveModelo(e)) ?? { falhas: 0, frota: 1 };
    const esperadas = lambdaTipo(e.tipo) * m.frota * diasJanela;
    return (m.falhas + K_MODELO) / (esperadas + K_MODELO);
  };

  // Fatores de cada equipamento em operação.
  const operacionais = equipamentos.filter((e) => situacao.get(e.id) === 'operacional').map((e) => {
    const fm = fatorModelo(e);
    const anos = e.instalado_em ? Math.max(0, (instanteMs - Date.parse(e.instalado_em)) / ANO_MS) : 0;
    const fi = 1 + anos / 5;
    const atraso = e.proxima_manutencao ? Math.max(0, Math.round((Date.parse(hoje) - Date.parse(e.proxima_manutencao.slice(0, 10))) / DIA_MS)) : 0;
    const fman = Math.min(3, 1 + atraso / 30);
    const q = quedas.get(e.id) ?? 0;
    const fq = 1 + q / 3;
    return { e, f: { fm, fi, anos, fman, atraso, fq, quedas: q }, produto: fm * fi * fman * fq };
  });
  // Fator do equipamento típico (mediana) de cada tipo, entre os que estão em operação.
  const produtosDoTipo = new Map<string, number[]>();
  for (const o of operacionais) produtosDoTipo.set(o.e.tipo, [...(produtosDoTipo.get(o.e.tipo) ?? []), o.produto]);
  const tipico = new Map([...produtosDoTipo].map(([tipo, xs]) => [tipo, mediana(xs)]));

  const riscos: RiscoInterno[] = operacionais.map(({ e, f, produto }) => {
    const lambda = (lambdaTipo(e.tipo) / tipico.get(e.tipo)!) * produto;
    return {
      equipamentoId: e.id, codigo: e.codigo, tipo: e.tipo, marca: e.marca, modelo: e.modelo, bairroNome: e.bairro_nome,
      probabilidade: arred(1 - Math.exp(-HORIZONTE_DIAS * lambda), 4), lambda, fatores: fatoresDoEquipamento(e, f),
    };
  });
  riscos.sort((a, b) => b.lambda - a.lambda || a.codigo.localeCompare(b.codigo));
  return { riscos, falhasJanela };
}

function fatoresDoEquipamento(
  e: LinhaEquipamento,
  f: { fm: number; fi: number; anos: number; fman: number; atraso: number; fq: number; quedas: number },
): RiscoFalha['fatores'] {
  const modelo = `${e.marca} ${e.modelo}`;
  const candidatos = [
    {
      nome: f.fm >= 1.1 ? `Modelo pouco confiável (${modelo})` : f.fm <= 0.9 ? `Modelo confiável (${modelo})` : `Modelo na média do tipo (${modelo})`,
      contribuicao: f.fm,
    },
    { nome: `Idade: ${formatarNumero(f.anos, 1)} ${f.anos >= 0.95 && f.anos < 1.05 ? 'ano' : 'anos'} de uso`, contribuicao: f.fi },
    ...(f.atraso > 0 ? [{ nome: `Manutenção atrasada há ${f.atraso} ${f.atraso === 1 ? 'dia' : 'dias'}`, contribuicao: f.fman }] : []),
    ...(f.quedas > 0 ? [{ nome: `${f.quedas} ${f.quedas === 1 ? 'hora' : 'horas'} com sinal fraco nas últimas 72 h`, contribuicao: f.fq }] : []),
  ];
  return candidatos
    .filter((c, i) => i === 0 || Math.abs(Math.log(c.contribuicao)) >= Math.log(1.05))
    .sort((a, b) => Math.abs(Math.log(b.contribuicao)) - Math.abs(Math.log(a.contribuicao)))
    .map((c) => ({ nome: c.nome, contribuicao: arred(c.contribuicao) }));
}

/** Ranking do maior para o menor risco (só equipamentos operacionais: os demais já estão parados). */
export function preverFalhas(db: Database, { agora }: { agora: Date }): RiscoFalha[] {
  return calcularRiscosDeFalha(db, agora.getTime(), { atual: true }).riscos.map(({ lambda: _l, ...r }) => r);
}

export interface RetroativoFalhas {
  /** Soma das probabilidades calculadas 7 dias atrás (falhas esperadas na semana). */
  previstas: number;
  /** Equipamentos operacionais 7 dias atrás que falharam desde então. */
  ocorridas: number;
  /** % das falhas da semana que estavam entre os 10% de maior risco. */
  noTopDecilPct: number;
  equipamentos: number;
}

/** Refaz a previsão como se fosse 7 dias atrás e confere com o que aconteceu. */
export function testeRetroativoFalhas(db: Database, agora: Date): RetroativoFalhas {
  const corte = agora.getTime() - HORIZONTE_DIAS * DIA_MS;
  const { riscos } = calcularRiscosDeFalha(db, corte);
  const falharam = falhasPorEquipamento(db, corte, agora.getTime());
  const top = new Set(riscos.slice(0, Math.ceil(riscos.length / 10)).map((r) => r.equipamentoId));
  let ocorridas = 0;
  let noTop = 0;
  let previstas = 0;
  for (const r of riscos) {
    previstas += 1 - Math.exp(-HORIZONTE_DIAS * r.lambda);
    if ((falharam.get(r.equipamentoId) ?? 0) > 0) {
      ocorridas++;
      if (top.has(r.equipamentoId)) noTop++;
    }
  }
  return { previstas: arred(previstas, 1), ocorridas, noTopDecilPct: ocorridas ? arred((100 * noTop) / ocorridas, 1) : 0, equipamentos: riscos.length };
}

export function respostaFalhas(db: Database, { agora }: { agora: Date }): RespostaFalhas {
  const calculo = calcularRiscosDeFalha(db, agora.getTime(), { atual: true });
  const itens = calculo.riscos.map(({ lambda: _l, ...r }) => r);
  return { geradoEm: agora.toISOString(), itens, explicacao: explicarFalhas(itens, calculo.falhasJanela, testeRetroativoFalhas(db, agora)) };
}

function explicarFalhas(itens: RiscoFalha[], falhasJanela: number, retro: RetroativoFalhas): ExplicacaoPrevisao {
  const esperadas = itens.reduce((s, r) => s + r.probabilidade, 0);
  const acimaDe30 = itens.filter((r) => r.probabilidade >= 0.3).length;
  const primeiro = itens[0];
  return {
    oQuePreve: 'A chance de cada equipamento em operação falhar nos próximos 7 dias, do maior risco para o menor, com o motivo de cada um.',
    dadosUsados: [
      `${formatarNumero(falhasJanela)} falhas registradas nos últimos ${DIAS_TAXA} dias, por tipo e por marca e modelo`,
      'Data de instalação (idade) e data da próxima manutenção (atraso) de cada equipamento',
      'Telemetria das últimas 72 horas: horas em que o equipamento ficou menos de 55 minutos conectado',
    ],
    comoAjuda: primeiro
      ? `Diz qual equipamento revisar antes que pare: ${acimaDe30} com 30% ou mais de chance; o primeiro da fila é ${primeiro.codigo} (${NOME_DO_TIPO[primeiro.tipo][0]}, ${formatarChance(primeiro.probabilidade)}). No total, cerca de ${formatarNumero(esperadas, 0)} falhas esperadas na semana.`
      : 'Diz qual equipamento revisar antes que pare.',
    confiabilidade: [
      {
        metrica: 'Falhas previstas para a última semana',
        valor: retro.previstas,
        descricao: `Refazendo a conta como se fosse 7 dias atrás, a soma das chances previa ${formatarNumero(retro.previstas, 0)} falhas na semana; aconteceram ${retro.ocorridas}.`,
      },
      { metrica: 'Falhas que aconteceram na última semana', valor: retro.ocorridas, descricao: `${retro.ocorridas} dos ${retro.equipamentos} equipamentos em operação naquele dia falharam.` },
      {
        metrica: 'Falhas entre os 10% de maior risco (%)',
        valor: retro.noTopDecilPct,
        descricao: `Os 10% de equipamentos apontados como mais arriscados concentraram ${formatarNumero(retro.noTopDecilPct, 0)}% das falhas da semana (ao acaso seriam 10%).`,
      },
    ],
  };
}
