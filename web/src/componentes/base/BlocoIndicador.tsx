// Indicador como placa: número grande, condensado e tabular, num bloco de cor cheia.
// O texto (branco ou grafite) é escolhido pelo contraste com a cor do bloco (AA).
import type { ReactNode } from 'react';
import { formatarNumero } from '../../../../shared/formato';
import { corDoTexto } from '../../estilo/contraste';
import estilos from './BlocoIndicador.module.css';

interface Props {
  rotulo: string;
  /** Número (formatado em pt-BR aqui) ou texto já formatado, ex. "92,4%". */
  valor: number | string;
  /** Cor cheia `#RRGGBB`, `marca` (laranja-fogo) ou `neutro` (grafite, acompanha o tema). */
  cor: string;
  detalhe?: ReactNode;
  icone?: ReactNode;
  /** `compacto` = faixa da Central (cabe com o mapa numa tela de notebook). */
  tamanho?: 'normal' | 'compacto';
}

export function BlocoIndicador({ rotulo, valor, cor, detalhe, icone, tamanho = 'normal' }: Props) {
  const estilo =
    cor === 'neutro'
      ? { backgroundColor: 'var(--cor-bloco-neutro)', color: 'var(--cor-sobre-bloco-neutro)' }
      : cor === 'marca'
        ? { backgroundColor: 'var(--cor-fogo)', color: 'var(--cor-sobre-fogo)' }
        : { backgroundColor: cor, color: corDoTexto(cor) };

  return (
    <div className={`${estilos.bloco} ${tamanho === 'compacto' ? estilos.compacto : ''}`} style={estilo}>
      {/* `key`: quando o número muda ao vivo, ele assenta de novo (movimento curto que mostra o que mudou). */}
      <span key={String(valor)} className={estilos.valor}>{typeof valor === 'number' ? formatarNumero(valor) : valor}</span>
      <span className={estilos.rotulo}>
        {icone}
        {rotulo}
      </span>
      {detalhe !== undefined && <span className={estilos.detalhe}>{detalhe}</span>}
    </div>
  );
}
