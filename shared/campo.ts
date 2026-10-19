// Modo Campo: o que o agente vê e manda pelo celular (despacho, equipamentos perto dele, relato de problema).
import { z } from 'zod';
import './erros-zod';
import type { SituacaoEquipamento } from './dominio';
import { formatarNumero } from './formato';
import type { Alerta, Ocorrencia } from './modelos';
import type { TipoEquipamentoId } from './tipos-equipamento';

export const PROBLEMAS_CAMPO = ['mau_funcionamento', 'furtado', 'vandalizado'] as const;
export type ProblemaCampo = (typeof PROBLEMAS_CAMPO)[number];

export const ROTULO_PROBLEMA_CAMPO: Record<ProblemaCampo, string> = {
  mau_funcionamento: 'Mau funcionamento',
  furtado: 'Furtado',
  vandalizado: 'Vandalizado',
};

/** Situação que o equipamento passa a ter. Vandalizado continua na rua, mas sem funcionar direito. */
export const SITUACAO_DO_PROBLEMA: Record<ProblemaCampo, SituacaoEquipamento> = {
  mau_funcionamento: 'mau_funcionamento',
  furtado: 'furtado',
  vandalizado: 'mau_funcionamento',
};

export const reporteCampoSchema = z.object({
  equipamentoId: z.number({ required_error: 'Escolha o equipamento', invalid_type_error: 'Escolha o equipamento' }).int().positive('Escolha o equipamento'),
  problema: z.enum(PROBLEMAS_CAMPO, { errorMap: () => ({ message: 'Problema: escolha mau funcionamento, furtado ou vandalizado' }) }),
  observacao: z.string().trim().max(280, 'A observação pode ter até 280 caracteres').default(''),
});
export type ReporteCampo = z.infer<typeof reporteCampoSchema>;

export const proximosCampoSchema = z.object({
  limite: z.coerce.number().int().min(1).max(20).default(5),
});

/** A ocorrência para a qual o agente foi despachado, com o que ele precisa para chegar lá. */
export interface Despacho {
  ocorrencia: Ocorrencia;
  bairroNome: string;
  /** Rua mais próxima do local (OpenStreetMap); nulo se nenhuma passa a menos de 300 m. */
  logradouro: string | null;
  /** Da posição atual do agente até o local. */
  distanciaMetros: number;
  /** Quando o agente marcou "cheguei". */
  chegouEm?: string;
}

export interface EquipamentoProximo {
  id: number;
  codigo: string;
  tipo: TipoEquipamentoId;
  situacao: SituacaoEquipamento;
  logradouro: string;
  referencia: string;
  bairroNome: string;
  lat: number;
  lng: number;
  distanciaMetros: number;
}

export interface ResultadoReporte {
  equipamento: EquipamentoProximo;
  /** Nulo quando já havia um alerta igual aberto (o motor não duplica). */
  alerta: Alerta | null;
}

/** "350 m" abaixo de 1 km; "1,2 km" a partir dele. */
export function formatarDistancia(metros: number): string {
  const m = Math.round(metros);
  return m < 1000 ? `${m} m` : `${formatarNumero(m / 1000, 1)} km`;
}
