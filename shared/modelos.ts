// Interfaces de saída da API e dos eventos SSE. Sem dependências de Node.
import type {
  CategoriaAgente, Criticidade, NecessidadeManutencao, Orgao, Regiao, SituacaoAgente, SituacaoEquipamento, TipoOcorrencia,
} from './dominio';
import type { Poligono } from './geo';
import type { AgenteInput, EquipamentoInput } from './schemas';
import type { TipoEquipamentoId } from './tipos-equipamento';

export type { Poligono };

export interface Bairro {
  id: number;
  nome: string;
  regiao: Regiao;
  lat: number;
  lng: number;
  cep: string;
  poligono: Poligono;
}

export interface Equipamento extends EquipamentoInput {
  id: number;
  codigo: string;
  bairroNome: string;
  regiao: Regiao;
  latAtual: number;
  lngAtual: number;
  ultimoSinalEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type SituacaoManutencao = 'ok' | 'proxima' | 'imediata' | 'atrasada';

export interface EquipamentoMapa {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  lat: number;
  lng: number;
  bairroId: number;
  orgao: Orgao;
  manutencao: SituacaoManutencao;
}

export interface Agente extends AgenteInput {
  id: number;
  baseBairroNome: string;
  regiao: Regiao;
  latAtual: number;
  lngAtual: number;
  ultimoSinalEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface AgenteMapa {
  id: number;
  nome: string;
  categoria: CategoriaAgente;
  situacao: SituacaoAgente;
  lat: number;
  lng: number;
  bairroId: number;
}

export interface Alerta {
  id: number;
  tipo: string;
  criticidade: Criticidade;
  titulo: string;
  descricao: string;
  equipamentoId?: number;
  agenteId?: number;
  bairroId?: number;
  lat?: number;
  lng?: number;
  criadoEm: string;
  reconhecidoEm?: string;
  resolvidoEm?: string;
}

export interface Ocorrencia {
  id: number;
  tipo: TipoOcorrencia;
  gravidade: 1 | 2 | 3 | 4;
  bairroId: number;
  lat: number;
  lng: number;
  inicio: string;
  fim?: string;
  equipamentoId?: number;
  agenteId?: number;
  descricao: string;
  chuva: boolean;
  origem: 'historico' | 'tempo_real' | 'injetado';
}

export interface HistoricoSituacao {
  id: number;
  equipamentoId: number;
  de: SituacaoEquipamento;
  para: SituacaoEquipamento;
  motivo: string;
  em: string;
}

export interface Manutencao {
  id: number;
  equipamentoId: number;
  tipo: 'corretiva' | 'preventiva';
  abertaEm: string;
  previstaPara?: string;
  concluidaEm?: string;
  descricao: string;
}

export interface EquipamentoDetalhe extends Equipamento {
  historico: HistoricoSituacao[];
  manutencoes: Manutencao[];
  alertas: Alerta[];
}

export interface AgenteDetalhe extends Agente {
  ocorrencias: Ocorrencia[];
}

export interface PainelManutencao {
  atrasadas: Equipamento[];
  imediatas: Equipamento[];
  proximos7: Equipamento[];
  proximos30: Equipamento[];
}

export interface PontoTelemetria {
  /** Início da hora, ISO 8601 UTC. */
  hora: string;
  leituras: number;
  onlineMin: number;
  metricas: Record<string, number>;
}

export interface Indicadores {
  totalEquipamentos: number;
  operacionais: number;
  indisponiveis: number;
  naoInstalados: number;
  desativados: number;
  disponibilidadePct: number;
  agentesEmAtividade: number;
  agentesTotal: number;
  alertasAbertos: number;
  alertasCriticosAbertos: number;
  manutencaoImediata: number;
  manutencaoProxima7d: number;
}

export type NivelAtencao = 'normal' | 'atencao' | 'critico';

export interface StatusBairro {
  bairroId: number;
  nome: string;
  indice: number;
  nivel: NivelAtencao;
  motivos: string[];
}

export interface StatusRegiao {
  regiao: Regiao;
  indice: number;
  nivel: NivelAtencao;
  motivos: string[];
  bairros: StatusBairro[];
}

export interface EstadoSimulacao {
  velocidade: 1 | 10 | 60;
  pausado: boolean;
  /** Relógio simulado, ISO 8601 UTC. */
  relogio: string;
}

/** Resposta paginada das listagens. */
export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export type EventoFogo =
  | { tipo: 'posicoes'; itens: { tipo: 'equipamento' | 'agente'; id: number; lat: number; lng: number }[] }
  | { tipo: 'equipamento'; dados: EquipamentoMapa }
  | { tipo: 'agente'; dados: AgenteMapa }
  | { tipo: 'alerta'; dados: Alerta }
  | { tipo: 'ocorrencia'; dados: Ocorrencia }
  | { tipo: 'indicadores'; dados: Indicadores }
  | { tipo: 'simulacao'; dados: EstadoSimulacao };

/** Evento `estado` enviado uma vez ao abrir o SSE; não faz parte de `EventoFogo`. */
export interface EstadoInicialStream {
  simulacao: EstadoSimulacao;
  indicadores?: Indicadores;
}

// ---- Cidade preditiva (Tarefa 8) ----

export interface ExplicacaoPrevisao {
  oQuePreve: string;
  dadosUsados: string[];
  comoAjuda: string;
  confiabilidade: { metrica: string; valor: number; descricao: string }[];
}

export type NivelRisco = 'baixo' | 'moderado' | 'alto' | 'critico';

export interface CelulaRisco {
  bairroId: number;
  /** Início da hora prevista, ISO 8601 UTC. */
  inicio: string;
  taxaEsperada: number;
  indice: number;
  nivel: NivelRisco;
  fatores: { nome: string; peso: number }[];
}

export interface PrevisaoRisco {
  geradoEm: string;
  horas: number;
  celulas: CelulaRisco[];
  explicacao: ExplicacaoPrevisao;
}

export interface ResultadoBacktest {
  dias: number;
  maeModelo: number;
  maeIngenuo: number;
  ganhoPct: number;
  /** 0 a 5. */
  acertoTop5Medio: number;
  porDia: { data: string; acertoTop5: number; mae: number }[];
  explicacao: ExplicacaoPrevisao;
}

export interface RecomendacaoReforco {
  regiaoOrigem: Regiao;
  regiaoDestino: Regiao;
  quantidade: number;
  inicio: string;
  fim: string;
  cargaPorAgenteAntes: number;
  cargaPorAgenteDepois: number;
  motivo: string;
}

export interface RiscoFalha {
  equipamentoId: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  marca: string;
  modelo: string;
  bairroNome: string;
  /** Probabilidade de falha em 7 dias, 0 a 1. */
  probabilidade: number;
  fatores: { nome: string; contribuicao: number }[];
}

export interface Tendencias {
  disponibilidadePorTipo: {
    tipo: TipoEquipamentoId;
    serie: { data: string; pct: number }[];
    projecao7d: number;
  }[];
  usoPatinetesPorBairro: { bairroId: number; nome: string; mediaDiaria: number; variacaoPct: number }[];
  falhasPorModelo: { marca: string; modelo: string; falhasPor100: number; frota: number }[];
  explicacao: ExplicacaoPrevisao;
}

export interface RecomendacaoDoDia {
  titulo: string;
  detalhe: string;
  fonte: 'risco' | 'reforco' | 'falhas' | 'tendencias';
  prioridade: 'alta' | 'media' | 'baixa';
}

export interface ResumoPreditivo {
  geradoEm: string;
  indiceBairros: { bairroId: number; nome: string; indice: number; nivel: NivelRisco }[];
  recomendacoes: RecomendacaoDoDia[];
  explicacao: ExplicacaoPrevisao;
}
