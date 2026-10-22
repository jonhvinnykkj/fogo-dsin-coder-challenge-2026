// Media query como estado do React (celular, tela estreita). Sem `matchMedia` (testes em jsdom), vale "não casa".
import { useSyncExternalStore } from 'react';

export function useConsulta(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches,
    () => false,
  );
}
