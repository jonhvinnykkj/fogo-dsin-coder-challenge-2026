// Enums, rótulos pt-BR, cores e funções de classificação. Sem dependências de Node.

export const SITUACOES_EQUIPAMENTO = ['nao_instalado', 'operacional', 'mau_funcionamento', 'em_manutencao', 'desativado', 'furtado'] as const;
export type SituacaoEquipamento = (typeof SITUACOES_EQUIPAMENTO)[number];

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
