// Situação do equipamento como placa: bloco de cor cheia com a palavra. "Não instalado" é só contorno tracejado
// (ainda não existe na rua). As cores vêm de shared/dominio.ts, as mesmas do mapa e dos indicadores.
import { COR_SITUACAO, ROTULO_SITUACAO, type SituacaoEquipamento } from '../../../../shared/dominio';
import { corDoTexto } from '../../estilo/contraste';
import estilos from './EtiquetaSituacao.module.css';

interface Props {
  situacao: SituacaoEquipamento;
  /** `compacta` para tabelas e listas densas. */
  tamanho?: 'normal' | 'compacta';
}

export function EtiquetaSituacao({ situacao, tamanho = 'normal' }: Props) {
  const cor = COR_SITUACAO[situacao];
  const tracejada = situacao === 'nao_instalado';
  const estilo = tracejada
    ? { borderStyle: 'dashed', borderColor: cor, backgroundColor: 'transparent' }
    : { backgroundColor: cor, color: corDoTexto(cor), borderColor: cor, borderStyle: 'solid' };

  return (
    <span className={`${estilos.etiqueta} ${tamanho === 'compacta' ? estilos.compacta : ''}`} data-situacao={situacao} style={estilo}>
      {ROTULO_SITUACAO[situacao]}
    </span>
  );
}
