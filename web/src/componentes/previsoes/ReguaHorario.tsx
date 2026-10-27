// Régua de horário do mapa de risco: as próximas 24 horas como barras (altura = ocorrências esperadas na cidade naquela
// hora, cor = o bairro mais arriscado da hora) e uma agulha na hora escolhida. É um controle deslizante de verdade
// (setas, Home, End); as barras são atalho do mouse e do dedo (clicar ou arrastar). "Tocar" anda 1 hora por segundo e para
// sozinho na última hora; qualquer escolha manual pausa.
import { Pause, Play } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatarNumero } from '../../../../shared/formato';
import { useTema } from '../../estilo/tema';
import { corDaCelula, diaDaSemana, horaLocal, rotuloDia } from '../../util/risco';
import { Botao } from '../base/Botao';
import estilos from './ReguaHorario.module.css';

export interface HoraRegua {
  /** Início da hora, ISO 8601 UTC. */
  inicio: string;
  /** Ocorrências esperadas na cidade inteira nessa hora (soma das taxas dos bairros). */
  total: number;
  /** Maior índice entre os bairros nessa hora (0 a 100). */
  maiorIndice: number;
}

interface Props {
  horas: HoraRegua[];
  posicao: number;
  onMudar: (posicao: number) => void;
}

export const PASSO_MS = 1000;

const textoTotal = (n: number) => {
  const numero = formatarNumero(n, n >= 10 || Number.isInteger(n) ? 0 : 1);
  return n === 1 ? '1 ocorrência esperada' : `${numero} ocorrências esperadas`;
};

/** "21h de sábado". */
export function rotuloHoraDia(iso: string): string {
  return `${horaLocal(iso)}h de ${diaDaSemana(iso)}`;
}

export function ReguaHorario({ horas, posicao, onMudar }: Props) {
  const { tema } = useTema();
  const [tocando, setTocando] = useState(false);
  const ultima = horas.length - 1;
  const atual = useRef(posicao);
  const mudar = useRef(onMudar);
  const arrastando = useRef(false);
  useLayoutEffect(() => {
    atual.current = posicao;
    mudar.current = onMudar;
  });

  useEffect(() => {
    if (!tocando) return;
    const relogio = setInterval(() => {
      const proxima = atual.current + 1;
      if (proxima > ultima) {
        setTocando(false);
        return;
      }
      atual.current = proxima;
      mudar.current(proxima);
      if (proxima >= ultima) setTocando(false);
    }, PASSO_MS);
    return () => clearInterval(relogio);
  }, [tocando, ultima]);

  const escolher = (p: number) => {
    setTocando(false);
    const limitada = Math.min(ultima, Math.max(0, p));
    if (limitada !== atual.current) {
      atual.current = limitada;
      onMudar(limitada);
    }
  };

  const alternar = () => {
    if (tocando) {
      setTocando(false);
      return;
    }
    if (posicao >= ultima) {
      atual.current = 0;
      onMudar(0);
    }
    setTocando(true);
  };

  const teclado = (ev: KeyboardEvent<HTMLDivElement>) => {
    const destino: Record<string, number> = {
      ArrowRight: posicao + 1, ArrowUp: posicao + 1, ArrowLeft: posicao - 1, ArrowDown: posicao - 1,
      PageUp: posicao + 3, PageDown: posicao - 3, Home: 0, End: ultima,
    };
    const p = destino[ev.key];
    if (p === undefined) return;
    ev.preventDefault();
    escolher(p);
  };

  // Arrastar o dedo ou o mouse pela régua: a barra sob o ponteiro vira a hora escolhida.
  const sobOPonteiro = (ev: PointerEvent<HTMLDivElement>) => {
    const alvo = document.elementFromPoint?.(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-posicao]');
    if (alvo) escolher(Number(alvo.dataset.posicao));
  };

  const maiorTotal = Math.max(...horas.map((h) => h.total), 0.0001);
  const hora = horas[posicao];

  return (
    <div className={estilos.regua}>
      <Botao
        variante="primario"
        className={estilos.tocar}
        onClick={alternar}
        icone={tocando ? <Pause weight="fill" size={18} aria-hidden="true" /> : <Play weight="fill" size={18} aria-hidden="true" />}
      >
        {tocando ? 'Pausar' : 'Tocar'}
      </Botao>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Horário do mapa de risco"
        aria-valuemin={0}
        aria-valuemax={ultima}
        aria-valuenow={posicao}
        aria-valuetext={hora ? `${rotuloHoraDia(hora.inicio)}, ${textoTotal(hora.total)} na cidade` : undefined}
        className={estilos.trilho}
        onKeyDown={teclado}
        onPointerDown={(ev) => {
          arrastando.current = true;
          ev.currentTarget.setPointerCapture?.(ev.pointerId);
          sobOPonteiro(ev);
        }}
        onPointerMove={(ev) => {
          if (arrastando.current) sobOPonteiro(ev);
        }}
        onPointerUp={() => {
          arrastando.current = false;
        }}
        onPointerCancel={() => {
          arrastando.current = false;
        }}
      >
        {horas.map((h, i) => {
          const local = horaLocal(h.inicio);
          const viraDia = i > 0 && local === 0;
          return (
            <div
              key={h.inicio}
              data-posicao={i}
              data-selecionada={i === posicao || undefined}
              className={`${estilos.coluna} ${viraDia ? estilos.viraDia : ''}`}
              title={`${rotuloHoraDia(h.inicio)}: ${textoTotal(h.total)} na cidade`}
              onClick={() => escolher(i)}
            >
              {viraDia && <span className={estilos.dia}>{rotuloDia(h.inicio)}</span>}
              <span className={estilos.area}>
                <span
                  className={estilos.barra}
                  style={{ height: `${Math.max(6, (100 * h.total) / maiorTotal)}%`, background: corDaCelula(Math.max(h.maiorIndice, 8), tema) }}
                />
              </span>
              <span className={estilos.hora} data-seis={local % 6 === 0 || undefined}>{local % 3 === 0 || i === 0 ? `${local}h` : ''}</span>
              {i === posicao && <span className={estilos.agulha} aria-hidden="true"><span className={estilos.placa}>{local}h</span></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
