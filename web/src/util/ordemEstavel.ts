// Ordem de alertas que não pula debaixo do dedo: "Reconhecer" muda o alerta, mas ele fica onde estava até a lista
// mudar de verdade (alerta novo, resolvido, outro filtro). Sem isso o item reconhecido desce, o de baixo sobe para o
// mesmo lugar e o clique seguinte resolve o alerta errado.
import { useMemo, useRef } from 'react';
import type { Alerta } from '../../../shared/modelos';

/**
 * Ordena como `ordenar`, mas usando o "reconhecido ou não" de quando a lista foi ordenada pela última vez.
 * `fotografia` guarda esse estado por id; só é refeita quando aparece um id que ela não conhece.
 */
export function ordenarSemPular(
  alertas: readonly Alerta[],
  ordenar: (a: readonly Alerta[]) => Alerta[],
  fotografia: Map<number, boolean>,
): Alerta[] {
  if (alertas.some((a) => !fotografia.has(a.id))) {
    fotografia.clear();
    for (const a of alertas) fotografia.set(a.id, Boolean(a.reconhecidoEm));
  }
  const reais = new Map(alertas.map((a) => [a.id, a]));
  const comoFotografado = alertas.map((a) => ({ ...a, reconhecidoEm: fotografia.get(a.id) ? (a.reconhecidoEm ?? 'reconhecido') : undefined }));
  return ordenar(comoFotografado).map((a) => reais.get(a.id)!);
}

export function useOrdemSemPular(alertas: readonly Alerta[] | undefined, ordenar: (a: readonly Alerta[]) => Alerta[]): Alerta[] | undefined {
  const fotografia = useRef(new Map<number, boolean>());
  // A ordem recebida é estável por definição (função de módulo); fica fora das dependências de propósito.
  return useMemo(() => (alertas ? ordenarSemPular(alertas, ordenar, fotografia.current) : undefined), [alertas]);
}
