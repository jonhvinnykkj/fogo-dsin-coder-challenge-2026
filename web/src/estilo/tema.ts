// Tema da interface: claro é o padrão; escuro ("Sala de controle") só por escolha, salvo no navegador.
// Nunca segue o tema do sistema operacional (sem prefers-color-scheme).
// A fonte da verdade é o atributo `data-tema` do <html>; todo botão de tema lê dele, então nunca ficam fora de sincronia.
import { useCallback, useSyncExternalStore } from 'react';

export type Tema = 'claro' | 'escuro';
export const CHAVE_TEMA = 'fogo:tema';

const ouvintes = new Set<() => void>();

export function lerTemaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro';
  } catch {
    return 'claro'; // navegação privada ou armazenamento bloqueado
  }
}

export function aplicarTema(tema: Tema): void {
  if (tema === 'escuro') document.documentElement.dataset.tema = 'escuro';
  else delete document.documentElement.dataset.tema;
}

function temaAtual(): Tema {
  return document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro';
}

export function definirTema(tema: Tema): void {
  aplicarTema(tema);
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
  for (const fn of ouvintes) fn();
}

function assinar(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function useTema(): { tema: Tema; alternar: () => void } {
  const tema = useSyncExternalStore(assinar, temaAtual, () => 'claro' as Tema);
  const alternar = useCallback(() => definirTema(temaAtual() === 'escuro' ? 'claro' : 'escuro'), []);
  return { tema, alternar };
}
