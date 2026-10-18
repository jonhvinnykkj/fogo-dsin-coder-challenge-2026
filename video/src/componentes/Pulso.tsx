// Anel que se abre e some, para puxar o olho para um ponto da tela (marcador no mapa, cartão do alerta).
// Com largura/altura é um retângulo de cantos retos; sem, um círculo em volta de (x, y). Coordenadas da captura.
import { useCurrentFrame } from 'remotion';
import { curva } from '../tema';
import { mistura, progresso } from '../tempo';

interface Props {
  x: number;
  y: number;
  largura?: number;
  altura?: number;
  /** Círculo: raio inicial e final. Retângulo: quanto a borda se afasta. */
  de?: number;
  ate?: number;
  cor: string;
  espessura?: number;
  inicio: number;
  periodo?: number;
  vezes?: number;
}

export function Pulso({ x, y, largura, altura, de = 8, ate = 44, cor, espessura = 3, inicio, periodo = 30, vezes = 3 }: Props) {
  const frame = useCurrentFrame();
  const aneis = Array.from({ length: vezes }, (_, i) => inicio + i * periodo);
  return (
    <>
      {aneis.map((comeco) => {
        if (frame < comeco) return null;
        const p = progresso(frame, comeco, periodo * 1.4, curva.entrada);
        const opacidade = 1 - progresso(frame, comeco + periodo * 0.3, periodo * 1.1, curva.app);
        const r = mistura(de, ate, p);
        const retangulo = largura !== undefined && altura !== undefined;
        return (
          <div
            key={comeco}
            style={{
              position: 'absolute',
              left: x - r,
              top: y - r,
              width: retangulo ? largura + 2 * r : 2 * r,
              height: retangulo ? altura + 2 * r : 2 * r,
              boxSizing: 'border-box',
              border: `${espessura}px solid ${cor}`,
              borderRadius: retangulo ? 4 : '50%',
              opacity: opacidade,
            }}
          />
        );
      })}
    </>
  );
}
