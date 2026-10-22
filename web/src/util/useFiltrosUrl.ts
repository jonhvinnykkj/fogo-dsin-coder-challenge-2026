import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { useAtraso } from './useAtraso';

/** Chaves que a URL guarda mas que não são filtro: não contam em "com esses filtros" e sobrevivem ao "Limpar filtros". */
const NAO_E_FILTRO = new Set(['pagina']);
const ORDENACAO = new Set(['ordem', 'direcao']);

/** Tamanho máximo da busca (o mesmo do servidor): o campo não deixa passar disso. */
export const LIMITE_BUSCA = 100;

/**
 * Filtros guardados na URL (`?situacao=furtado&pagina=2`): link compartilhável e o botão Voltar do navegador funcionam.
 * Com um `schema` (o mesmo que o servidor usa), valor inválido na URL (`?situacao=xyz`, `?pagina=1.5`) é ignorado, como a
 * Central faz com os filtros dela: a lista abre como se a chave não estivesse lá, em vez de mostrar "Dados inválidos".
 */
export function useFiltrosUrl(schema?: z.ZodTypeAny) {
  const [params, setParams] = useSearchParams();

  const invalidas = useMemo(() => {
    if (!schema) return new Set<string>();
    const r = schema.safeParse(Object.fromEntries(params.entries()));
    return new Set(r.success ? [] : r.error.issues.map((i) => String(i.path[0])));
  }, [params, schema]);

  const ler = (chave: string): string | undefined => (invalidas.has(chave) ? undefined : params.get(chave) || undefined);

  /**
   * Muda um ou mais filtros de uma vez; vazio tira da URL. Qualquer mudança (menos só da página) volta para a página 1.
   * Cada mudança vira uma entrada do histórico (o Voltar do navegador desfaz o filtro e a página), menos com `substituir`:
   * a digitação na busca troca a entrada em vez de empilhar uma por pausa.
   */
  const mudarVarios = useCallback((mudancas: Record<string, string | undefined>, opcoes?: { substituir?: boolean }) => {
    setParams((atual) => {
      const novo = new URLSearchParams(atual);
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor) novo.set(chave, valor);
        else novo.delete(chave);
      }
      if (Object.keys(mudancas).some((c) => c !== 'pagina')) novo.delete('pagina');
      return novo;
    }, { replace: opcoes?.substituir === true });
  }, [setParams]);

  const mudar = useCallback((chave: string, valor: string | undefined, opcoes?: { substituir?: boolean }) => mudarVarios({ [chave]: valor }, opcoes), [mudarVarios]);

  /** Tira todos os filtros (e a página); a ordem escolhida fica. */
  const limpar = useCallback(() => {
    setParams((atual) => {
      const novo = new URLSearchParams();
      for (const [k, v] of atual) if (ORDENACAO.has(k)) novo.set(k, v);
      return novo;
    });
  }, [setParams]);

  const temAlgum = Array.from(params.keys()).some((k) => !NAO_E_FILTRO.has(k) && !ORDENACAO.has(k) && !invalidas.has(k) && params.get(k) !== '');

  return { ler, mudar, mudarVarios, limpar, temAlgum };
}

type Filtros = ReturnType<typeof useFiltrosUrl>;

/**
 * Campo de busca ligado à URL: o texto aparece na hora; a URL (e a consulta) só mudam 300 ms depois da última tecla, trocando
 * a entrada do histórico. Se a URL muda por fora (Voltar, link), o campo acompanha.
 */
export function useBuscaNaUrl(url: Filtros): [string, (texto: string) => void] {
  const naUrl = url.ler('busca') ?? '';
  const [texto, setTexto] = useState(naUrl);
  const esperado = useAtraso(texto, 300);
  const escritaPorMim = useRef(naUrl);

  useEffect(() => {
    const limpo = esperado.trim();
    if (limpo === (url.ler('busca') ?? '')) return;
    escritaPorMim.current = limpo;
    url.mudar('busca', limpo || undefined, { substituir: true });
    // `url.mudar` é estável; `url.ler` lê a URL no momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperado]);

  useEffect(() => {
    if (naUrl === escritaPorMim.current) return;
    escritaPorMim.current = naUrl;
    setTexto(naUrl);
  }, [naUrl]);

  return [texto, setTexto];
}

/** Página além do fim (`?pagina=15` de 14): vai para a última, trocando a entrada do histórico. */
export function useCorrigirPagina(url: Filtros, pagina: number, total: number | undefined, porPagina: number): void {
  useEffect(() => {
    if (total === undefined || total === 0) return;
    const ultima = Math.ceil(total / porPagina);
    if (pagina > ultima) url.mudar('pagina', ultima > 1 ? String(ultima) : undefined, { substituir: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, total, porPagina]);
}
