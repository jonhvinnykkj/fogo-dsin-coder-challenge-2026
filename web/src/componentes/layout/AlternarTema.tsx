// Liga e desliga a "Sala de controle" (tema escuro grafite). A escolha fica salva no navegador (`fogo:tema`).
import { Moon, Sun } from '@phosphor-icons/react';
import { useTema } from '../../estilo/tema';
import estilos from './AlternarTema.module.css';

interface Props {
  /** `faixa` = sobre a faixa grafite do topo; `menu` = dentro do menu do celular. */
  onde?: 'faixa' | 'menu';
}

export function AlternarTema({ onde = 'faixa' }: Props) {
  const { tema, alternar } = useTema();
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      className={`${estilos.botao} ${estilos[onde]}`}
      aria-pressed={escuro}
      onClick={alternar}
      title={escuro ? 'Voltar ao tema claro' : 'Tema escuro para salas com pouca luz'}
    >
      {escuro ? <Sun weight="fill" size={18} aria-hidden="true" /> : <Moon weight="fill" size={18} aria-hidden="true" />}
      <span>Sala de controle</span>
      <span className={estilos.chave} aria-hidden="true" />
    </button>
  );
}
