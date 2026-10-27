// Pares "rótulo → valor" das fichas, em grade que se ajusta à largura.
import type { ReactNode } from 'react';
import estilos from './ListaDados.module.css';

export interface ItemDado {
  rotulo: string;
  valor: ReactNode;
  /** Ocupa a linha inteira (endereços e textos longos). */
  larga?: boolean;
}

export function ListaDados({ itens }: { itens: ItemDado[] }) {
  return (
    <dl className={estilos.lista}>
      {itens.map((i) => (
        <div key={i.rotulo} className={`${estilos.item} ${i.larga ? estilos.larga : ''}`}>
          <dt>{i.rotulo}</dt>
          <dd>{i.valor === undefined || i.valor === null || i.valor === '' ? <span className={estilos.vazio}>Não informado</span> : i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
