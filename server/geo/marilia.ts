import { Delaunay } from 'd3-delaunay';
import { LIMITE_MARILIA, type Poligono } from '../../shared/geo';
import type { Bairro } from '../../shared/modelos';
import bairrosJson from './dados/bairros.json';
import ruasJson from './dados/ruas.json';

export interface Rua {
  nome: string;
  tipo: string;
  /** Pares [lat, lng] (no arquivo de origem vêm como [lng, lat]). */
  pontos: [number, number][];
}

export interface Rng {
  /** Número em [0, 1). */
  num(): number;
}

export interface PontoNaRua {
  lat: number;
  lng: number;
  logradouro: string;
}

export interface GeoMarilia {
  bairros: Omit<Bairro, 'id'>[];
  ruas: Rua[];
  /** Índice (em `bairros`) do bairro cujo centro é o mais próximo. */
  bairroDoPonto(lat: number, lng: number): number;
  pontoAleatorioNaRua(rng: Rng, bairroIndice?: number): PontoNaRua;
}

type Par = [number, number];

// Distâncias comparadas num plano equirretangular local (longitude encolhida por cos(lat)),
// o mesmo usado para o Voronoi, para o polígono e bairroDoPonto concordarem.
const LAT0 = -22.2139;
const K = Math.cos((LAT0 * Math.PI) / 180);

/** Sutherland–Hodgman: recorta `sujeito` pela região convexa `recorte` (ambos fechados ou não, em [x, y]). */
function recortar(sujeito: Par[], recorte: Par[]): Par[] {
  let area = 0;
  for (let i = 0; i < recorte.length; i++) {
    const [x1, y1] = recorte[i]!;
    const [x2, y2] = recorte[(i + 1) % recorte.length]!;
    area += x1 * y2 - x2 * y1;
  }
  const sinal = area >= 0 ? 1 : -1;
  let saida = sujeito;
  for (let i = 0; i < recorte.length && saida.length > 0; i++) {
    const a = recorte[i]!;
    const b = recorte[(i + 1) % recorte.length]!;
    const lado = (p: Par) => sinal * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const entrada = saida;
    saida = [];
    for (let j = 0; j < entrada.length; j++) {
      const p = entrada[j]!;
      const q = entrada[(j + 1) % entrada.length]!;
      const lp = lado(p);
      const lq = lado(q);
      if (lp >= 0) saida.push(p);
      if ((lp >= 0) !== (lq >= 0)) {
        const t = lp / (lp - lq);
        saida.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return saida;
}

function construirBairros(): Omit<Bairro, 'id'>[] {
  const brutos = bairrosJson as { nome: string; regiao: Bairro['regiao']; lat: number; lng: number; cep: string }[];
  const centros: Par[] = brutos.map((b) => [b.lng * K, b.lat]);
  const anel = LIMITE_MARILIA.coordinates[0]!.slice(0, -1);
  const limiteXY: Par[] = anel.map(([lng, lat]) => [lng! * K, lat!]);
  const xs = limiteXY.map((p) => p[0]);
  const ys = limiteXY.map((p) => p[1]);
  const margem = 0.01;
  const voronoi = Delaunay.from(centros).voronoi([
    Math.min(...xs) - margem, Math.min(...ys) - margem, Math.max(...xs) + margem, Math.max(...ys) + margem,
  ]);

  return brutos.map((b, i) => {
    const celula = voronoi.cellPolygon(i) as Par[] | null;
    const recortado = celula ? recortar(limiteXY, celula.slice(0, -1)) : [];
    // Anel GeoJSON [lng, lat], fechado.
    const pontos = recortado.map(([x, y]) => [Number((x / K).toFixed(6)), Number(y.toFixed(6))]);
    if (pontos.length < 3) throw new Error(`Bairro "${b.nome}" ficou sem área dentro do limite de Marília`);
    pontos.push([...pontos[0]!]);
    const poligono: Poligono = { type: 'Polygon', coordinates: [pontos] };
    return { nome: b.nome, regiao: b.regiao, lat: b.lat, lng: b.lng, cep: b.cep, poligono };
  });
}

interface Segmento {
  rua: number;
  a: Par; // [lat, lng]
  b: Par;
  comp: number; // metros aproximados
}

export function carregarGeo(): GeoMarilia {
  const bairros = construirBairros();
  const ruas: Rua[] = (ruasJson as { nome: string; tipo: string; pontos: Par[] }[]).map((r) => ({
    nome: r.nome,
    tipo: r.tipo,
    pontos: r.pontos.map(([lng, lat]) => [lat, lng] as Par),
  }));

  const bairroDoPonto = (lat: number, lng: number): number => {
    let melhor = 0;
    let menor = Infinity;
    for (let i = 0; i < bairros.length; i++) {
      const dx = (lng - bairros[i]!.lng) * K;
      const dy = lat - bairros[i]!.lat;
      const d = dx * dx + dy * dy;
      if (d < menor) { menor = d; melhor = i; }
    }
    return melhor;
  };

  const segmentos: Segmento[] = [];
  ruas.forEach((r, idx) => {
    for (let i = 0; i + 1 < r.pontos.length; i++) {
      const a = r.pontos[i]!;
      const b = r.pontos[i + 1]!;
      const comp = Math.hypot((b[1] - a[1]) * K, b[0] - a[0]) * 111320;
      if (comp > 0) segmentos.push({ rua: idx, a, b, comp });
    }
  });

  const porBairro: Segmento[][] = bairros.map(() => []);
  for (const s of segmentos) {
    porBairro[bairroDoPonto((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2)]!.push(s);
  }

  // Sorteio proporcional ao comprimento do segmento.
  function sortear(lista: Segmento[], rng: Rng): Segmento {
    let total = 0;
    for (const s of lista) total += s.comp;
    let alvo = rng.num() * total;
    for (const s of lista) {
      alvo -= s.comp;
      if (alvo < 0) return s;
    }
    return lista[lista.length - 1]!;
  }

  function pontoMaisProximoDoCentro(i: number): PontoNaRua {
    const c = bairros[i]!;
    let melhor: PontoNaRua | null = null;
    let menor = Infinity;
    for (const r of ruas) {
      for (const [lat, lng] of r.pontos) {
        const d = ((lng - c.lng) * K) ** 2 + (lat - c.lat) ** 2;
        if (d < menor) { menor = d; melhor = { lat, lng, logradouro: r.nome }; }
      }
    }
    return melhor!;
  }

  function pontoAleatorioNaRua(rng: Rng, bairroIndice?: number): PontoNaRua {
    const lista = bairroIndice === undefined ? segmentos : porBairro[bairroIndice]!;
    if (bairroIndice !== undefined && (bairroIndice < 0 || bairroIndice >= bairros.length)) {
      throw new RangeError(`Bairro inexistente: ${bairroIndice}`);
    }
    if (lista.length === 0) return pontoMaisProximoDoCentro(bairroIndice!);
    const s = sortear(lista, rng);
    // Com bairro escolhido, o ponto sorteado no segmento precisa continuar no bairro; senão usa o meio do segmento.
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const t = rng.num();
      const lat = s.a[0] + t * (s.b[0] - s.a[0]);
      const lng = s.a[1] + t * (s.b[1] - s.a[1]);
      if (bairroIndice === undefined || bairroDoPonto(lat, lng) === bairroIndice) {
        return { lat, lng, logradouro: ruas[s.rua]!.nome };
      }
    }
    return { lat: (s.a[0] + s.b[0]) / 2, lng: (s.a[1] + s.b[1]) / 2, logradouro: ruas[s.rua]!.nome };
  }

  return { bairros, ruas, bairroDoPonto, pontoAleatorioNaRua };
}
