// Gerador pseudoaleatório com semente (mulberry32). Tudo o que a semente cria sai daqui: mesma semente,
// mesma cidade e mesmo histórico, em qualquer máquina. Nunca use Math.random() nos geradores.

export interface Rng {
  /** Número em [0, 1). */
  num(): number;
  /** Inteiro em [min, max] (os dois inclusos). */
  int(min: number, max: number): number;
  /** Real em [min, max). */
  entre(min: number, max: number): number;
  /** Verdadeiro com probabilidade `p`. */
  chance(p: number): boolean;
  escolher<T>(lista: readonly T[]): T;
  /** Sorteia uma chave do mapa com probabilidade proporcional ao peso. */
  peso<K extends string>(mapa: Readonly<Record<K, number>>): K;
  /** Sorteia um item da lista com probabilidade proporcional a `pesoDe(item)`. */
  ponderado<T>(lista: readonly T[], pesoDe: (item: T) => number): T;
  /** Normal (Box–Muller). */
  normal(media: number, desvio: number): number;
  /** Contagem de Poisson com média `lambda`. */
  poisson(lambda: number): number;
  /** `n` dígitos hexadecimais minúsculos. */
  hex(n: number): string;
  /** Embaralha a lista no lugar (Fisher–Yates) e a devolve. */
  embaralhar<T>(lista: T[]): T[];
}

export function criarRng(semente: number): Rng {
  let estado = semente >>> 0;
  const num = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const ponderado = <T>(lista: readonly T[], pesoDe: (item: T) => number): T => {
    if (lista.length === 0) throw new Error('Lista vazia no sorteio ponderado');
    let total = 0;
    for (const item of lista) total += Math.max(0, pesoDe(item));
    let alvo = num() * total;
    let ultimoComPeso: T = lista[lista.length - 1]!;
    for (const item of lista) {
      const p = Math.max(0, pesoDe(item));
      if (p > 0) ultimoComPeso = item;
      alvo -= p;
      if (alvo < 0) return item;
    }
    return ultimoComPeso; // arredondamento: nunca devolve item de peso zero
  };

  return {
    num,
    int: (min, max) => min + Math.floor(num() * (max - min + 1)),
    entre: (min, max) => min + num() * (max - min),
    chance: (p) => num() < p,
    escolher: (lista) => {
      if (lista.length === 0) throw new Error('Lista vazia no sorteio');
      return lista[Math.floor(num() * lista.length)]!;
    },
    peso: (mapa) => {
      const chaves = Object.keys(mapa) as (keyof typeof mapa & string)[];
      return ponderado(chaves, (k) => mapa[k]);
    },
    ponderado,
    normal: (media, desvio) => {
      const u = 1 - num(); // (0, 1]: evita log(0)
      const v = num();
      return media + desvio * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    poisson: (lambda) => {
      if (lambda <= 0) return 0;
      if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * Math.sqrt(-2 * Math.log(1 - num())) * Math.cos(2 * Math.PI * num())));
      // Knuth: multiplica uniformes até cair abaixo de e^-λ.
      const limite = Math.exp(-lambda);
      let k = 0;
      let p = num();
      while (p > limite) {
        k++;
        p *= num();
      }
      return k;
    },
    hex: (n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += Math.floor(num() * 16).toString(16);
      return s;
    },
    embaralhar: (lista) => {
      for (let i = lista.length - 1; i > 0; i--) {
        const j = Math.floor(num() * (i + 1));
        [lista[i], lista[j]] = [lista[j]!, lista[i]!];
      }
      return lista;
    },
  };
}

/**
 * Semente derivada de outra e de rótulos (FNV-1a + mistura final do murmur3). Separa os "fios" da geração
 * (cidade, clima de um dia, ocorrências de uma hora…) para que um não altere o outro: a hora 14 h de
 * 03/10 sai igual quer seja gerada na semente, quer no preenchimento de lacuna.
 */
export function derivarSemente(semente: number, ...rotulos: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (semente >>> 0);
  const texto = rotulos.join('|');
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
