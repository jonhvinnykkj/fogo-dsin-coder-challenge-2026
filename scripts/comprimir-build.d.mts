// Tipos de scripts/comprimir-build.mjs (o script é JavaScript puro, como scripts/checar-node.mjs).
export declare const TAMANHO_MINIMO: number;
/** Escreve .br e .gz ao lado de cada arquivo de texto grande da pasta; devolve o total antes e depois (bytes, pelo .br). */
export declare function comprimirPasta(pasta: string): { antes: number; depois: number };
