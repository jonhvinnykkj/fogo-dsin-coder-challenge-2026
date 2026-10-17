// Falha ao carregar algo: diz o que aconteceu (mensagem do servidor ou "Sem conexão…") e oferece tentar de novo.
import { ArrowClockwise, WarningOctagon } from '@phosphor-icons/react';
import { mensagemDeErro } from '../api/cliente';
import { Botao } from './Botao';
import estilos from './AvisoErro.module.css';

interface Props {
  erro: unknown;
  /** O que não carregou, ex. "Não foi possível carregar os equipamentos". */
  titulo?: string;
  onTentarDeNovo?: () => void;
  tentando?: boolean;
}

export function AvisoErro({ erro, titulo = 'Não foi possível carregar', onTentarDeNovo, tentando = false }: Props) {
  return (
    <div className={estilos.aviso} role="alert">
      <WarningOctagon weight="fill" size={28} className={estilos.icone} aria-hidden="true" />
      <div className={estilos.texto}>
        <strong className={estilos.titulo}>{titulo}</strong>
        <p className={estilos.mensagem}>{mensagemDeErro(erro)}</p>
      </div>
      {onTentarDeNovo && (
        <Botao variante="secundario" tamanho="pequeno" icone={<ArrowClockwise weight="bold" size={16} aria-hidden="true" />} onClick={onTentarDeNovo} disabled={tentando}>
          {tentando ? 'Tentando…' : 'Tentar de novo'}
        </Botao>
      )}
    </div>
  );
}
