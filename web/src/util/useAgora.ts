import { useEffect, useState } from 'react';

/** "Agora" que anda sozinho a cada `intervaloMs`, para textos como "há 3 min" envelhecerem sem recarregar a tela. */
export function useAgora(intervaloMs = 30_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}
