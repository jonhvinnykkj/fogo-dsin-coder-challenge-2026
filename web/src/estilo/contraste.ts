// Escolhe o texto (branco ou grafite) que dá mais contraste sobre um bloco de cor cheia (WCAG 2.x).
// Exemplos: furtado #C2185B → branco (5,9:1); operacional #1F9D55 → grafite (4,8:1); laranja-fogo → grafite (4,5:1).

export const BRANCO = '#FFFFFF';
export const GRAFITE = '#1E1E1F';

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de uma cor `#RRGGBB` (ou `#RGB`). */
export function luminancia(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) throw new Error(`Cor inválida: ${hex}`);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

export function razaoContraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

/** Texto para pôr sobre o fundo `hex`: o que tiver maior contraste entre branco e grafite. */
export function corDoTexto(hex: string): typeof BRANCO | typeof GRAFITE {
  return razaoContraste(hex, BRANCO) >= razaoContraste(hex, GRAFITE) ? BRANCO : GRAFITE;
}
