import { naoEncontrado } from '../erros';

/** Lê `:id` da URL; qualquer coisa que não seja inteiro positivo vira 404 do recurso. */
export function lerId(valor: unknown, recurso: string): number {
  const n = typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw naoEncontrado(recurso);
  return n;
}
