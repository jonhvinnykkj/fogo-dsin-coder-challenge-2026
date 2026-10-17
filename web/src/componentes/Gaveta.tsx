// Painel lateral (ficha do equipamento na Central, menu no celular). Usa <dialog> nativo em modo modal:
// o navegador prende o foco dentro, fecha no Esc e devolve o foco a quem abriu.
import { X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { Botao } from './Botao';
import estilos from './Gaveta.module.css';

interface Props {
  aberta: boolean;
  onFechar: () => void;
  titulo: ReactNode;
  /** Linha abaixo do título (ex.: código e situação). */
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  lado?: 'direita' | 'esquerda';
  /** Largura em px no computador; no celular ocupa a tela toda. */
  largura?: number;
  /** `false` = não bloqueia a tela de trás (ex.: ficha ao lado do mapa, que continua clicável). */
  modal?: boolean;
  /** Corpo sem recuo, para conteúdo que já traz o seu (ex.: a navegação no menu do celular). */
  semRecuo?: boolean;
}

export function Gaveta({ aberta, onFechar, titulo, subtitulo, children, rodape, lado = 'direita', largura = 440, modal = true, semRecuo = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberta && !dialogo.open) {
      if (modal) dialogo.showModal();
      else dialogo.show();
    }
    if (!aberta && dialogo.open) dialogo.close();
  }, [aberta, modal]);

  // Clique no véu (fora do painel) fecha.
  const aoClicar = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onFechar();
  };

  return (
    <dialog
      ref={ref}
      className={`${estilos.gaveta} ${lado === 'esquerda' ? estilos.esquerda : ''}`}
      style={{ width: `min(${largura}px, 100vw)` }}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault(); // quem fecha é o estado do React
        onFechar();
      }}
      onClick={aoClicar}
      onKeyDown={(e) => {
        // Sem modal o navegador não manda `cancel` no Esc.
        if (!modal && e.key === 'Escape') onFechar();
      }}
    >
      {aberta && (
        <div className={estilos.painel}>
          <header className={estilos.cabecalho}>
            <div className={estilos.titulos}>
              <h2 id={idTitulo} className={estilos.titulo}>{titulo}</h2>
              {subtitulo && <div className={estilos.subtitulo}>{subtitulo}</div>}
            </div>
            <Botao variante="fantasma" tamanho="pequeno" icone={<X weight="bold" size={16} aria-hidden="true" />} onClick={onFechar}>
              Fechar
            </Botao>
          </header>
          <div className={`${estilos.corpo} ${semRecuo ? estilos.semRecuo : ''}`}>{children}</div>
          {rodape && <footer className={estilos.rodape}>{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}
