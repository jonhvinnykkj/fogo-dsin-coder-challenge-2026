/** Texto de campo ("-22,2138" ou "-22.2138") → número. Vazio vira `undefined`; texto que não é número vira `NaN` (a validação aponta). */
export function lerDecimal(texto: string): number | undefined {
  const limpo = texto.trim();
  if (limpo === '') return undefined;
  return Number(limpo.replace(',', '.'));
}

/** Coordenada para o campo: 6 casas, vírgula decimal. */
export function textoDeCoordenada(n: number): string {
  return n.toFixed(6).replace('.', ',');
}

/** Contagem de uma lista que a API corta em `limite` (os mais recentes, sem o total): no limite vira "200+". */
export function contagemAteLimite(n: number, limite: number): string {
  return n >= limite ? `${limite.toLocaleString('pt-BR')}+` : n.toLocaleString('pt-BR');
}
