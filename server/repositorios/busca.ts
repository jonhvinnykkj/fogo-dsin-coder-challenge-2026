import { semAcento } from '../db/conexao';

/** Escapa `\`, `%` e `_` para uso em `LIKE ? ESCAPE '\'`. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Padrão "contém" sem acento e sem diferença de maiúsculas, pronto para `sem_acento(col) LIKE ? ESCAPE '\'`. */
export function padraoContem(busca: string): string {
  return `%${escaparLike(semAcento(busca))}%`;
}

/** Monta `(sem_acento(a) LIKE ? ESCAPE '\' OR ...)` para as colunas dadas, empurrando o parâmetro. */
export function condicaoBusca(busca: string, colunas: string[], params: unknown[]): string {
  const padrao = padraoContem(busca);
  const partes = colunas.map((c) => {
    params.push(padrao);
    return `sem_acento(${c}) LIKE ? ESCAPE '\\'`;
  });
  return `(${partes.join(' OR ')})`;
}
