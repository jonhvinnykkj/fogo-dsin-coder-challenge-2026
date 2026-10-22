// Tipos de scripts/apagar-banco-e2e.mjs (o script é JavaScript puro, como scripts/checar-node.mjs).
export declare const BANCO_E2E: string;
export interface OpcoesApagarBanco {
  caminho?: string;
  tentativas?: number;
  intervaloMs?: number;
  remover?: (arquivo: string) => void;
  pausa?: (ms: number) => Promise<unknown>;
}
/** Devolve os arquivos que não foi possível apagar (lista vazia = tudo limpo). Nunca lança. */
export declare function apagarBancoE2e(opcoes?: OpcoesApagarBanco): Promise<string[]>;
