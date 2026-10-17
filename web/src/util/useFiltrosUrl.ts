import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Filtros guardados na URL (`?situacao=furtado&pagina=2`): link compartilhável e o botão Voltar do navegador funcionam. */
export function useFiltrosUrl() {
  const [params, setParams] = useSearchParams();

  const ler = (chave: string): string | undefined => params.get(chave) || undefined;

  /** Muda um filtro; vazio tira da URL. Qualquer filtro (menos a própria página) volta para a página 1. */
  const mudar = useCallback((chave: string, valor: string | undefined) => {
    setParams((atual) => {
      const novo = new URLSearchParams(atual);
      if (valor) novo.set(chave, valor);
      else novo.delete(chave);
      if (chave !== 'pagina') novo.delete('pagina');
      return novo;
    }, { replace: true });
  }, [setParams]);

  const limpar = useCallback(() => setParams({}, { replace: true }), [setParams]);

  return { ler, mudar, limpar, temAlgum: Array.from(params.keys()).some((k) => k !== 'pagina') };
}
