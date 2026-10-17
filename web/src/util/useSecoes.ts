// Ganchos da página de seções (Previsões): qual seção está na tela (índice lateral) e "esta seção já está perto?"
// (para só buscar o que é pesado quando o usuário chega perto).
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Id da seção que ocupa a parte de cima da área visível. Sem IntersectionObserver (testes), fica na primeira.
 * `marcar(id)` marca na hora a seção escolhida no índice e segura a marcação enquanto a rolagem suave acontece.
 */
export function useSecaoAtiva(ids: readonly string[]): [string, (id: string) => void] {
  const [ativa, setAtiva] = useState(ids[0] ?? '');
  const seguraAte = useRef(0);
  const marcar = useCallback((id: string) => {
    seguraAte.current = Date.now() + 1500;
    setAtiva(id);
  }, []);
  const chave = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const lista = chave.split('|');
    const visiveis = new Set<string>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        const primeira = lista.find((id) => visiveis.has(id));
        if (primeira && Date.now() > seguraAte.current) setAtiva(primeira);
      },
      // faixa de leitura: do topo da área visível até 60% da altura
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const id of lista) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [chave]);
  return [ativa, marcar];
}

/** `[ref, perto]`: `perto` vira true (e fica) quando o elemento chega a `margem` da área visível. */
export function useQuaseNaTela<T extends Element>(margem = '900px'): [(el: T | null) => void, boolean] {
  const [perto, setPerto] = useState(typeof IntersectionObserver === 'undefined');
  const obs = useRef<IntersectionObserver | null>(null);
  const ref = useCallback(
    (el: T | null) => {
      obs.current?.disconnect();
      obs.current = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      obs.current = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) {
            setPerto(true);
            obs.current?.disconnect();
          }
        },
        { rootMargin: `${margem} 0px ${margem} 0px` },
      );
      obs.current.observe(el);
    },
    [margem],
  );
  useEffect(() => () => obs.current?.disconnect(), []);
  return [ref, perto];
}
