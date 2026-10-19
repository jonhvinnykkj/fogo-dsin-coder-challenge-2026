// Consultas e mutações do Modo Campo (TanStack Query). As chaves ficam sob ['campo'], separadas das telas do gestor.
// O despacho e os equipamentos perto também se renovam sozinhos: o agente anda e o simulador muda situações.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Despacho, EquipamentoProximo, ReporteCampo, ResultadoReporte } from '../../../shared/campo';
import type { Ocorrencia } from '../../../shared/modelos';
import { api } from './cliente';
import { chaves } from './consultas';

export const chavesCampo = {
  despacho: (agenteId: number) => ['campo', 'despacho', agenteId] as const,
  proximos: (agenteId: number) => ['campo', 'proximos', agenteId] as const,
};

/** Rede de segurança do tempo real: um despacho perdido (conexão caiu) aparece em até 15 s. */
const RENOVAR_DESPACHO_MS = 15_000;
const RENOVAR_PROXIMOS_MS = 30_000;

const base = (agenteId: number) => `/api/campo/agentes/${agenteId}`;

export function useDespacho(agenteId: number) {
  return useQuery({
    queryKey: chavesCampo.despacho(agenteId),
    queryFn: async () => (await api.get<{ despacho: Despacho | null }>(`${base(agenteId)}/despacho`)).despacho,
    refetchInterval: RENOVAR_DESPACHO_MS,
  });
}

export function useEquipamentosProximos(agenteId: number) {
  return useQuery({
    queryKey: chavesCampo.proximos(agenteId),
    queryFn: () => api.get<EquipamentoProximo[]>(`${base(agenteId)}/equipamentos-proximos`, { limite: 5 }),
    refetchInterval: RENOVAR_PROXIMOS_MS,
  });
}

export function useRegistrarChegada(agenteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ocorrenciaId: number) => api.post<Despacho>(`${base(agenteId)}/despachos/${ocorrenciaId}/chegada`),
    onSuccess: (despacho) => qc.setQueryData(chavesCampo.despacho(agenteId), despacho),
  });
}

export function useConcluirDespacho(agenteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ocorrenciaId: number) => api.post<Ocorrencia>(`${base(agenteId)}/despachos/${ocorrenciaId}/conclusao`),
    onSuccess: () => {
      qc.setQueryData(chavesCampo.despacho(agenteId), null);
      void qc.invalidateQueries({ queryKey: chaves.agente(agenteId) }); // voltou para "em serviço"
    },
  });
}

export function useRelatarProblema(agenteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relato: ReporteCampo) => api.post<ResultadoReporte>(`${base(agenteId)}/reportes`, relato),
    onSuccess: () => {
      const afetadas = [chavesCampo.proximos(agenteId), chaves.equipamentos(), chaves.manutencao(), chaves.mapa(), chaves.indicadores(), chaves.alertas()];
      for (const queryKey of afetadas) {
        void qc.invalidateQueries({ queryKey });
      }
    },
  });
}
