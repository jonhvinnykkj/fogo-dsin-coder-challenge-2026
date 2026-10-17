// Situação do agente como placa de cor cheia (mesma linguagem das etiquetas de equipamento).
import { COR_SITUACAO_AGENTE, ROTULO_SITUACAO_AGENTE, type SituacaoAgente } from '../../../shared/dominio';
import { corDoTexto } from '../estilo/contraste';
import estilos from './EtiquetaSituacao.module.css';

interface Props {
  situacao: SituacaoAgente;
  tamanho?: 'normal' | 'compacta';
}

export function EtiquetaSituacaoAgente({ situacao, tamanho = 'normal' }: Props) {
  const cor = COR_SITUACAO_AGENTE[situacao];
  return (
    <span
      className={`${estilos.etiqueta} ${tamanho === 'compacta' ? estilos.compacta : ''}`}
      data-situacao={situacao}
      style={{ backgroundColor: cor, color: corDoTexto(cor), borderColor: cor, borderStyle: 'solid' }}
    >
      {ROTULO_SITUACAO_AGENTE[situacao]}
    </span>
  );
}
