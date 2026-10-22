// Casca do app: faixa grafite no topo (marca, conexão ao vivo, relógio da simulação, tema), navegação lateral e
// a área das telas. No celular a navegação vira um menu em gaveta.
import { List } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { AlternarTema } from './AlternarTema';
import { Gaveta } from './Gaveta';
import { IndicadorConexao } from './IndicadorConexao';
import { Navegacao } from './Navegacao';
import { MenuUsuario } from './MenuUsuario';
import { RelogioSimulacao } from './RelogioSimulacao';
import estilos from './Shell.module.css';

const CHAVE_MENU = 'fogo:menu';

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === 'recolhido';
  } catch {
    return false;
  }
}

export function Shell() {
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const [menuAberto, setMenuAberto] = useState(false);

  const alternarRecolhida = () => {
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE_MENU, r ? 'aberto' : 'recolhido');
      } catch {
        /* sem armazenamento: vale só nesta aba */
      }
      return !r;
    });
  };

  return (
    <div className={`${estilos.casca} ${recolhida ? estilos.recolhida : ''}`}>
      <a href="#conteudo" className={estilos.pular}>Pular para o conteúdo</a>

      <header className={estilos.faixa}>
        <button type="button" className={estilos.botaoMenu} onClick={() => setMenuAberto(true)} aria-haspopup="dialog">
          <List weight="fill" size={20} aria-hidden="true" />
          <span className={estilos.rotuloMenu}>Menu</span>
        </button>
        <Link to="/" className={estilos.marca} title="Ir para a Central">
          <span className={estilos.placa}>F.O.G.O.</span>
        </Link>
        <p className={estilos.subtitulo}>Ferramenta Onisciente de Gestão e Operações · Marília</p>
        <div className={estilos.status}>
          <RelogioSimulacao />
          <IndicadorConexao />
          <span className={estilos.temaNaFaixa}>
            <AlternarTema />
          </span>
          <MenuUsuario />
        </div>
      </header>

      <aside className={estilos.lateral}>
        <Navegacao recolhida={recolhida} onAlternarRecolhida={alternarRecolhida} />
      </aside>

      <main id="conteudo" className={estilos.conteudo} tabIndex={-1}>
        <Outlet />
      </main>

      <Gaveta aberta={menuAberto} onFechar={() => setMenuAberto(false)} titulo="Menu" lado="esquerda" largura={300} semRecuo rodape={<AlternarTema onde="menu" />}>
        <Navegacao onNavegar={() => setMenuAberto(false)} />
      </Gaveta>
    </div>
  );
}
