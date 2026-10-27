// Confirmação de exclusão. Se o servidor recusar (409: tem histórico), a mensagem dele aparece aqui,
// com o caminho alternativo (desativar) quando a tela oferece um.
import { Trash } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { ErroApi } from '../../api/cliente';
import { AvisoErro } from '../base/AvisoErro';
import { Botao } from '../base/Botao';
import { Gaveta } from '../base/Gaveta';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  nome: string;
  onConfirmar: () => void;
  pendente: boolean;
  erro: unknown;
  /** Mostrada quando o servidor recusa por causa do histórico (ex.: botão "Desativar"). */
  alternativa?: ReactNode;
}

export function DialogoExcluir({ aberto, onFechar, titulo, nome, onConfirmar, pendente, erro, alternativa }: Props) {
  const recusado = erro instanceof ErroApi && erro.status === 409;
  return (
    <Gaveta
      aberta={aberto}
      onFechar={onFechar}
      titulo={titulo}
      subtitulo={nome}
      largura={480}
      rodape={(
        <>
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao variante="perigo" icone={<Trash weight="fill" size={18} aria-hidden="true" />} onClick={onConfirmar} disabled={pendente || recusado}>
            {pendente ? 'Excluindo…' : 'Excluir definitivamente'}
          </Botao>
        </>
      )}
    >
      <div className={estilos.form}>
        <p className={estilos.texto}>Esta ação não pode ser desfeita. Só é possível excluir quem não tem histórico (telemetria, alertas, ocorrências ou manutenções).</p>
        {erro !== null && erro !== undefined && <AvisoErro erro={erro} titulo="Não foi possível excluir" />}
        {recusado && alternativa}
      </div>
    </Gaveta>
  );
}
