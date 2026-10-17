import { useEffect, useState } from 'react';

/** Devolve `valor` só depois de `ms` sem mudar (busca digitada espera o fim da digitação). */
export function useAtraso<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
