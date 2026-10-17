// Uma única conexão SSE para o app inteiro. O provedor re-renderiza a cada evento, mas os filhos não: só quem
// lê `useTempoReal()` (indicador de conexão, quem quiser animar o último evento). Os dados em si chegam pelo cache.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStream, type EstadoStream } from './useStream';

const Contexto = createContext<EstadoStream>({ conectado: false });

export function TempoRealProvider({ children }: { children: ReactNode }) {
  const { conectado, ultimoEvento } = useStream();
  const valor = useMemo<EstadoStream>(() => (ultimoEvento ? { conectado, ultimoEvento } : { conectado }), [conectado, ultimoEvento]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTempoReal(): EstadoStream {
  return useContext(Contexto);
}
