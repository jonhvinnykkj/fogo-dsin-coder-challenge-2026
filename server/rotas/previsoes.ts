// Rotas da Cidade Preditiva (Parte 3). Cada resposta leva `explicacao`: o que prevê, dados usados, como ajuda e confiabilidade.
//
// Cache em memória de 60 s por rota (por app: cada servidor ou teste tem o seu). As rotas reaproveitam umas às outras pelo
// cache: o teste retroativo alimenta a confiabilidade do risco, do reforço e do resumo; o mapa de 24 h alimenta o reforço e
// o resumo. Assim a primeira chamada paga o cálculo e as próximas, por 60 s, saem da memória.
import type { FastifyInstance } from 'fastify';
import { filtroRiscoSchema } from '../../shared/schemas';
import { executarBacktest } from '../preditivo/backtest';
import { respostaFalhas } from '../preditivo/falhas';
import { respostaReforco } from '../preditivo/reforco';
import { montarResumo } from '../preditivo/resumo';
import { preverRisco } from '../preditivo/risco';
import { calcularTendencias } from '../preditivo/tendencias';

const tags = ['Previsões'];
export const VALIDADE_CACHE_MS = 60_000;

/** Guarda o resultado de cada chave por 60 s (relógio de parede: é um cache de desempenho, não de dados). */
function criarCache(): <T>(chave: string, calcular: () => T) => T {
  const itens = new Map<string, { expira: number; valor: unknown }>();
  return <T>(chave: string, calcular: () => T): T => {
    const agora = Date.now();
    const item = itens.get(chave);
    if (item && item.expira > agora) return item.valor as T;
    const valor = calcular();
    itens.set(chave, { expira: agora + VALIDADE_CACHE_MS, valor });
    return valor;
  };
}

export async function rotasPrevisoes(app: FastifyInstance): Promise<void> {
  const { db, relogio } = app.ctx;
  const emCache = criarCache();

  const backtest = () => emCache('backtest', () => executarBacktest(db, { agora: relogio.agora(), dias: 14 }));
  const risco = (horas: number) => emCache(`risco:${horas}`, () => preverRisco(db, { agora: relogio.agora(), horas, backtest: backtest() }));
  const reforco = () => emCache('reforco', () => respostaReforco(db, { agora: relogio.agora(), horas: 24, previsao: risco(24), backtest: backtest() }));
  const falhas = () => emCache('falhas', () => respostaFalhas(db, { agora: relogio.agora() }));
  const tendencias = () => emCache('tendencias', () => calcularTendencias(db, { agora: relogio.agora() }));
  const resumo = () => emCache('resumo', () => montarResumo(db, { agora: relogio.agora() }, {
    backtest: backtest(), risco: risco(24), reforco: reforco().recomendacoes, falhas: falhas(), tendencias: tendencias(),
  }));

  app.get('/api/previsoes/risco', {
    schema: {
      tags,
      summary: 'Risco de ocorrências por bairro e hora (próximas 24 h ou 7 dias)',
      description: 'Parâmetro `horas`: 24 (padrão) ou 168. Taxa esperada = base do bairro (8 semanas, suavizada) × perfil da cidade (dia útil, sábado ou domingo × hora) '
        + '× fator chuva do dia (razão chuva/seco do histórico) × tendência (2 semanas ÷ 6 anteriores, 0,7 a 1,3). Índice = 100 × taxa ÷ percentil 99 da janela; '
        + 'baixo < 25, moderado < 50, alto < 75, crítico ≥ 75. A confiabilidade vem do teste retroativo.',
    },
  }, async (req) => risco(filtroRiscoSchema.parse(req.query).horas));

  app.get('/api/previsoes/backtest', {
    schema: {
      tags,
      summary: 'Teste retroativo do risco nos 14 dias antes de hoje',
      description: 'Cada dia é previsto só com dados até a véspera e comparado com o ocorrido: erro médio por bairro e hora do modelo e da média simples de cada bairro, '
        + 'ganho percentual e acerto dos 5 bairros mais arriscados (0 a 5).',
    },
  }, async () => backtest());

  app.get('/api/previsoes/reforco', {
    schema: {
      tags,
      summary: 'Remanejamento de agentes por turno nas próximas 24 h',
      description: 'Carga por agente = ocorrências previstas da região no turno ÷ agentes escalados. Move agentes um a um da região com folga para a de déficit '
        + '(20% acima da média), no máximo 3 recomendações por turno.',
    },
  }, async () => reforco());

  app.get('/api/previsoes/falhas', {
    schema: {
      tags,
      summary: 'Chance de falha em 7 dias por equipamento operacional (ranking)',
      description: 'Probabilidade = 1 − e^(−7λ), λ = taxa do tipo (ajustada ao equipamento típico) × fator do modelo × (1 + anos/5) × (1 + dias de atraso/30, máx. 3) '
        + '× (1 + horas com sinal fraco nas últimas 72 h / 3). A confiabilidade refaz a conta 7 dias atrás e compara com as falhas que aconteceram.',
    },
  }, async () => falhas());

  app.get('/api/previsoes/tendencias', {
    schema: {
      tags,
      summary: 'Disponibilidade por tipo (30 dias + projeção), uso de patinetes por bairro e falhas por modelo',
      description: 'Projeção de 7 dias = reta dos mínimos quadrados sobre os 30 dias. Falhas por 100 equipamentos de cada marca/modelo nos últimos 60 dias.',
    },
  }, async () => tendencias());

  app.get('/api/previsoes/resumo', {
    schema: {
      tags,
      summary: 'Resumo do dia: índice de risco por bairro (24 h) e as 5 recomendações mais importantes',
      description: 'Índice do bairro = 100 × ocorrências esperadas em 24 h ÷ percentil 99 entre os bairros. Recomendações com a fonte (risco, reforco, falhas, tendencias) e prioridade.',
    },
  }, async () => resumo());
}
