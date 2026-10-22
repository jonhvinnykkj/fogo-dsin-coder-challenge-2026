// Tela de entrada. Usuário e senha; no modo demonstração, também um botão por papel (entrada com um clique).
import { LockKey, SignIn, WarningCircle } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DESCRICAO_PAPEL, PAPEIS, ROTULO_PAPEL, type Papel } from '../../../shared/seguranca';
import { mensagemDeErro } from '../api/cliente';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { useModoAcesso, useSessao } from '../sessao/Sessao';
import estilos from './Entrar.module.css';

export default function Entrar() {
  const { usuario, entrar, entrarDemo } = useSessao();
  const modo = useModoAcesso();
  const navegar = useNavigate();
  const destino = (useLocation().state as { de?: string } | null)?.de ?? '/';
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState<'senha' | Papel>();

  if (usuario) return <Navigate to={destino} replace />;

  const executar = async (qual: 'senha' | Papel, acao: () => Promise<unknown>) => {
    setErro(undefined);
    setEnviando(qual);
    try {
      await acao();
      navegar(destino, { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEnviando(undefined);
    }
  };

  const aoEnviar = (e: FormEvent) => {
    e.preventDefault();
    void executar('senha', () => entrar(login, senha));
  };

  return (
    <div className={estilos.fundo}>
      <main className={estilos.cartao}>
        <span className={estilos.placa}>F.O.G.O.</span>
        <h1 className={estilos.titulo}>Entrar na central</h1>
        <p className={estilos.subtitulo}>Ferramenta Onisciente de Gestão e Operações · Marília</p>

        <form className={estilos.formulario} onSubmit={aoEnviar} noValidate>
          <Campo rotulo="Usuário">
            {(p) => <input {...p} name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} required />}
          </Campo>
          <Campo rotulo="Senha">
            {(p) => <input {...p} name="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />}
          </Campo>
          {erro && (
            <p className={estilos.erro} role="alert">
              <WarningCircle weight="fill" size={18} aria-hidden="true" />
              {erro}
            </p>
          )}
          <Botao type="submit" variante="primario" disabled={!login || !senha || enviando !== undefined} icone={<SignIn weight="fill" size={18} aria-hidden="true" />}>
            {enviando === 'senha' ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>

        {modo.data?.demo && (
          <section className={estilos.demo} aria-labelledby="entrar-demo">
            <h2 id="entrar-demo" className={estilos.demoTitulo}>Demonstração: entrar com um clique como</h2>
            <ul className={estilos.papeis}>
              {PAPEIS.map((papel) => (
                <li key={papel}>
                  <button type="button" className={estilos.papel} disabled={enviando !== undefined} onClick={() => void executar(papel, () => entrarDemo(papel))}>
                    <span className={estilos.papelNome}>{enviando === papel ? 'Entrando…' : ROTULO_PAPEL[papel]}</span>
                    <span className={estilos.papelDescricao}>{DESCRICAO_PAPEL[papel]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={estilos.rodape}>
          <LockKey weight="fill" size={16} aria-hidden="true" />
          Sessão de 8 horas, guardada num cookie protegido. Cada ação fica registrada na auditoria.
        </p>
      </main>
    </div>
  );
}
