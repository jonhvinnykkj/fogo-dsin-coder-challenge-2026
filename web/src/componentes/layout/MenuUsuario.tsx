// Quem está logado (nome e papel) e o botão de sair, na faixa do topo.
import { SignOut, UserCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { ROTULO_PAPEL } from '../../../../shared/seguranca';
import { useSessao } from '../../sessao/Sessao';
import estilos from './MenuUsuario.module.css';

export function MenuUsuario() {
  const { usuario, sair } = useSessao();
  const navegar = useNavigate();
  if (!usuario) return null;

  return (
    <div className={estilos.usuario}>
      <UserCircle weight="fill" size={22} aria-hidden="true" className={estilos.icone} />
      <span className={estilos.textos}>
        <span className={estilos.nome}>{usuario.nome}</span>
        <span className={estilos.papel}>{ROTULO_PAPEL[usuario.papel]}</span>
      </span>
      <button
        type="button"
        className={estilos.sair}
        onClick={() => void sair().finally(() => navegar('/entrar', { replace: true }))}
        title="Sair do sistema"
      >
        <SignOut weight="bold" size={18} aria-hidden="true" />
        <span className="so-leitor">Sair do sistema</span>
      </button>
    </div>
  );
}
