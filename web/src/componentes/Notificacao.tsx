// Aviso discreto no canto da tela (toast): some sozinho em 5 s, sem som. A região `role="status"` existe sempre,
// para o leitor de tela anunciar o texto quando ele aparece.
import { CheckCircle, WarningOctagon, X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import estilos from './Notificacao.module.css';

export const DURACAO_NOTIFICACAO_MS = 5000;

export interface DadosNotificacao {
  /** Muda a cada aviso novo (reinicia os 5 s). */
  id: number;
  titulo: string;
  texto: string;
  /** `critico` = alerta crítico novo (faixa vermelha); `ok` = ação concluída (faixa verde). */
  tom?: 'critico' | 'ok';
  acao?: { rotulo: string; onClick: () => void };
}

interface Props {
  notificacao: DadosNotificacao | null;
  onFechar: () => void;
  /** `canto-tela` (padrão): fixo abaixo da faixa; `canto-pai`: no canto superior direito do elemento pai (ex.: o mapa). */
  posicao?: 'canto-tela' | 'canto-pai';
}

export function Notificacao({ notificacao, onFechar, posicao = 'canto-tela' }: Props) {
  useEffect(() => {
    if (!notificacao) return;
    const t = setTimeout(onFechar, DURACAO_NOTIFICACAO_MS);
    return () => clearTimeout(t);
  }, [notificacao, onFechar]);

  return (
    <div className={`${estilos.regiao} ${posicao === 'canto-pai' ? estilos.noPai : ''}`} role="status" aria-live="polite">
      {notificacao && (
        <div key={notificacao.id} className={`${estilos.aviso} ${notificacao.tom === 'ok' ? estilos.ok : ''}`}>
          <span className={estilos.icone} aria-hidden="true">
            {notificacao.tom === 'ok' ? <CheckCircle weight="fill" size={22} /> : <WarningOctagon weight="fill" size={22} />}
          </span>
          <div className={estilos.textos}>
            <strong>{notificacao.titulo}</strong>
            <span>{notificacao.texto}</span>
            {notificacao.acao && (
              <button type="button" className={estilos.acao} onClick={notificacao.acao.onClick}>{notificacao.acao.rotulo}</button>
            )}
          </div>
          <button type="button" className={estilos.fechar} onClick={onFechar} aria-label="Fechar aviso">
            <X weight="bold" size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
