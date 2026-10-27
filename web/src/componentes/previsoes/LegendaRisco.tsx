// Legenda da escala de risco (mapa e grade de 7 dias): a faixa contínua de 0 a 100, as marcas onde cada nível começa e o
// nome de cada nível embaixo do seu trecho.
import { NIVEIS_RISCO, ROTULO_NIVEL_RISCO } from '../../../../shared/dominio';
import { useTema } from '../../estilo/tema';
import { gradienteLegenda } from '../../util/risco';
import estilos from './LegendaRisco.module.css';

const MARCAS = [0, 25, 50, 75, 100];

export function LegendaRisco({ titulo = 'Índice de risco' }: { titulo?: string }) {
  const { tema } = useTema();
  return (
    <div className={estilos.legenda} role="img" aria-label={`${titulo}: baixo abaixo de 25, moderado de 25 a 49, alto de 50 a 74, crítico de 75 a 100`}>
      <span className={estilos.titulo}>{titulo}</span>
      <div className={estilos.escala}>
        <div className={`${estilos.marcas} numeros`}>
          {MARCAS.map((m) => <span key={m} style={{ left: `${m}%` }}>{m}</span>)}
        </div>
        <span className={estilos.faixa} style={{ background: gradienteLegenda(tema) }} />
        <div className={estilos.niveis}>
          {NIVEIS_RISCO.map((n) => <span key={n}>{ROTULO_NIVEL_RISCO[n]}</span>)}
        </div>
      </div>
    </div>
  );
}
