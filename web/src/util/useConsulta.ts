// Media query como estado do React (celular, tela estreita), sem render a mais no servidor.
import { useSyncExternalStore } from 'react';

export function useConsulta(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
