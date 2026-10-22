// Enums, rótulos pt-BR, cores e funções de classificação. Sem dependências de Node.

export const SITUACOES_EQUIPAMENTO = ['nao_instalado', 'operacional', 'mau_funcionamento', 'em_manutencao', 'desativado', 'furtado'] as const;
export type SituacaoEquipamento = (typeof SITUACOES_EQUIPAMENTO)[number];

/**
 * Situações com que um equipamento pode ser cadastrado. "Furtado" e "desativado" são o fim de uma história (a mudança
 * pede motivo e fica no histórico, e o furto abre alerta), e "mau funcionamento" nasce de uma leitura fora do normal:
 * nenhum dos três faz sentido num equipamento que acabou de entrar.
 */
export const SITUACOES_INICIAIS = ['nao_instalado', 'operacional', 'em_manutencao'] as const satisfies readonly SituacaoEquipamento[];

export const NECESSIDADES_MANUTENCAO = ['nenhuma', 'imediata', 'agendada', 'periodica'] as const;
export type NecessidadeManutencao = (typeof NECESSIDADES_MANUTENCAO)[number];

export const CATEGORIAS_AGENTE = ['agente_transito', 'guarda_municipal', 'policial_militar'] as const;
export type CategoriaAgente = (typeof CATEGORIAS_AGENTE)[number];

export const SITUACOES_AGENTE = ['em_servico', 'em_ocorrencia', 'pausa', 'fora_de_servico'] as const;
export type SituacaoAgente = (typeof SITUACOES_AGENTE)[number];

export const TURNOS = ['manha', 'tarde', 'noite', 'madrugada'] as const;
export type Turno = (typeof TURNOS)[number];

/** Horário de cada turno em hora local [início, fim). A noite atravessa a meia-noite; a madrugada é o plantão reduzido. */
export const HORARIO_TURNO: Record<Turno, { inicio: number; fim: number }> = {
  manha: { inicio: 6, fim: 14 },
  tarde: { inicio: 14, fim: 22 },
  noite: { inicio: 22, fim: 6 },
  madrugada: { inicio: 0, fim: 6 },
};

/** O turno cobre a hora local (0 a 23)? */
export function turnoCobreHora(turno: Turno, hora: number): boolean {
  const { inicio, fim } = HORARIO_TURNO[turno];
  return inicio < fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
}

export const REGIOES = ['Centro', 'Norte', 'Sul', 'Leste', 'Oeste'] as const;
export type Regiao = (typeof REGIOES)[number];

export const CRITICIDADES = ['critica', 'alta', 'media', 'baixa'] as const;
export type Criticidade = (typeof CRITICIDADES)[number];

export const TIPOS_OCORRENCIA = ['acidente', 'congestionamento', 'infracao', 'furto_vandalismo', 'veiculo_quebrado', 'alagamento', 'seguranca'] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

/**
 * Eventos que a demonstração pode provocar na cidade (botão "Injetar evento" da Central e POST /api/simulacao/eventos).
 * Lista única: o simulador, o schema da rota e a interface leem daqui.
 */
export const TIPOS_EVENTO_SIMULADO = ['furto', 'falha', 'acidente', 'alagamento', 'congestionamento'] as const;
export type TipoEventoSimulado = (typeof TIPOS_EVENTO_SIMULADO)[number];

export const ROTULO_EVENTO_SIMULADO: Record<TipoEventoSimulado, string> = {
  furto: 'Furto',
  falha: 'Falha de equipamento',
  acidente: 'Acidente',
  alagamento: 'Alagamento',
  congestionamento: 'Congestionamento',
};

/** O que cada evento provoca, para o menu da demonstração. */
export const DESCRICAO_EVENTO_SIMULADO: Record<TipoEventoSimulado, string> = {
  furto: 'Um patinete sai de Marília',
  falha: 'Um equipamento para de funcionar',
  acidente: 'Ocorrência numa rua; agente vai ao local',
  alagamento: 'A água sobe num sensor',
  congestionamento: 'Trânsito parado numa via',
};

/** Tipos de alerta gravados pelo motor de alertas (server/tempo-real/motor-alertas.ts). */
export const TIPOS_ALERTA = [
  'acidente', 'alagamento', 'furto_suspeito', 'falha_equipamento', 'sem_sinal', 'anomalia_leitura', 'congestionamento', 'manutencao_atrasada',
  'falha_provavel',
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const ROTULO_TIPO_ALERTA: Record<TipoAlerta, string> = {
  acidente: 'Acidente',
  alagamento: 'Alagamento',
  furto_suspeito: 'Possível furto',
  falha_equipamento: 'Falha de equipamento',
  sem_sinal: 'Sem sinal',
  anomalia_leitura: 'Leitura fora do normal',
  congestionamento: 'Congestionamento',
  manutencao_atrasada: 'Manutenção atrasada',
  falha_provavel: 'Falha provável',
};

/** Rótulo de um tipo de alerta vindo do banco (texto livre): tipo desconhecido aparece como veio, sem sublinhado. */
export function rotuloTipoAlerta(tipo: string): string {
  return (ROTULO_TIPO_ALERTA as Record<string, string>)[tipo] ?? tipo.replaceAll('_', ' ');
}

/** Nível de atenção de bairros e regiões (Central). */
export const ROTULO_NIVEL_ATENCAO: Record<'normal' | 'atencao' | 'critico', string> = {
  normal: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
};

export const COR_NIVEL_ATENCAO: Record<'normal' | 'atencao' | 'critico', string> = {
  normal: '#1F9D55',
  atencao: '#E8A400',
  critico: '#D92D20',
};

/** Níveis do risco previsto (Parte 3), do índice 0–100: baixo < 25, moderado < 50, alto < 75, crítico ≥ 75 (server/preditivo/risco.ts). */
export const NIVEIS_RISCO = ['baixo', 'moderado', 'alto', 'critico'] as const;
export type NivelRiscoId = (typeof NIVEIS_RISCO)[number];
export const ROTULO_NIVEL_RISCO: Record<NivelRiscoId, string> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  alto: 'Alto',
  critico: 'Crítico',
};

/**
 * Escala própria do risco previsto: amarelo-claro → âmbar → laranja-fogo → vermelho-escuro. Não reaproveita as cores de
 * situação (verde, âmbar de falha, azul…): risco é uma previsão, não o estado de um equipamento. Iguais nos dois temas.
 */
export const COR_NIVEL_RISCO: Record<NivelRiscoId, string> = {
  baixo: '#F5D565',
  moderado: '#F5901E',
  alto: '#F04A00',
  critico: '#A3140A',
};

export const ORGAOS = [
  'Secretaria de Mobilidade Urbana',
  'Guarda Civil Municipal',
  'Polícia Militar',
  'Concessionária do Rotativo',
  'Operadora de Patinetes',
  'Defesa Civil',
] as const;
export type Orgao = (typeof ORGAOS)[number];

export const ROTULO_SITUACAO: Record<SituacaoEquipamento, string> = {
  nao_instalado: 'Não instalado',
  operacional: 'Operacional',
  mau_funcionamento: 'Mau funcionamento',
  em_manutencao: 'Em manutenção',
  desativado: 'Desativado',
  furtado: 'Furtado',
};

export const ROTULO_NECESSIDADE_MANUTENCAO: Record<NecessidadeManutencao, string> = {
  nenhuma: 'Nenhuma',
  imediata: 'Imediata',
  agendada: 'Agendada',
  periodica: 'Periódica',
};

export const ROTULO_CATEGORIA_AGENTE: Record<CategoriaAgente, string> = {
  agente_transito: 'Agente de trânsito',
  guarda_municipal: 'Guarda municipal',
  policial_militar: 'Policial militar',
};

export const ROTULO_SITUACAO_AGENTE: Record<SituacaoAgente, string> = {
  em_servico: 'Em serviço',
  em_ocorrencia: 'Em ocorrência',
  pausa: 'Em pausa',
  fora_de_servico: 'Fora de serviço',
};

export const ROTULO_TURNO: Record<Turno, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  madrugada: 'Madrugada',
};

export const ROTULO_CRITICIDADE: Record<Criticidade, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const ROTULO_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  acidente: 'Acidente',
  congestionamento: 'Congestionamento',
  infracao: 'Infração',
  furto_vandalismo: 'Furto ou vandalismo',
  veiculo_quebrado: 'Veículo quebrado na via',
  alagamento: 'Alagamento',
  seguranca: 'Ocorrência de segurança',
};

export const COR_SITUACAO: Record<SituacaoEquipamento, string> = {
  operacional: '#1F9D55',
  mau_funcionamento: '#E8A400',
  em_manutencao: '#2F6FEB',
  desativado: '#6B7280',
  furtado: '#C2185B',
  nao_instalado: '#9CA3AF',
};

/** Cores de situação do agente (blocos cheios, como as dos equipamentos): em serviço = verde, em ocorrência = laranja-fogo, pausa = âmbar, fora de serviço = cinza. */
export const COR_SITUACAO_AGENTE: Record<SituacaoAgente, string> = {
  em_servico: '#1F9D55',
  em_ocorrencia: '#F04A00',
  pausa: '#E8A400',
  fora_de_servico: '#6B7280',
};

export const COR_CRITICIDADE: Record<Criticidade, string> = {
  critica: '#D92D20',
  alta: '#F04A00',
  media: '#E8A400',
  baixa: '#2F6FEB',
};

/** Equipamento que deveria funcionar mas não está disponível. */
export function estaIndisponivel(s: SituacaoEquipamento): boolean {
  return s === 'mau_funcionamento' || s === 'em_manutencao' || s === 'furtado';
}

/** Entra no cálculo de disponibilidade (tudo menos não instalado e desativado). */
export function contaNaDisponibilidade(s: SituacaoEquipamento): boolean {
  return s !== 'nao_instalado' && s !== 'desativado';
}

export function agenteEmAtividade(s: SituacaoAgente): boolean {
  return s === 'em_servico' || s === 'em_ocorrencia';
}
