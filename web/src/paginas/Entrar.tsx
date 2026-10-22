// Tela de entrada. Usuário e senha; no modo demonstração, também um botão por papel (entrada com um clique).
import { LockKey, SignIn, WarningCircle } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DESCRICAO_PAPEL, PAPEIS, ROTULO_PAPEL, type Papel, type UsuarioSessao } from '../../../shared/seguranca';
import { mensagemDeErro } from '../api/cliente';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { useModoAcesso, useSessao } from '../sessao/Sessao';
import estilos from './Entrar.module.css';

/** O papel que mostra o sistema inteiro: o que a comissão de avaliação deve escolher. */
const PAPEL_RECOMENDADO: Papel = 'gestor';

export default function Entrar() {
  const { usuario, entrar, entrarDemo } = useSessao();
  const modo = useModoAcesso();
  const navegar = useNavigate();
  const de = (useLocation().state as { de?: string } | null)?.de;
  /** Sem destino pedido, o agente vai para o Modo Campo (a tela dele); os demais, para a Central. */
  const destinoDe = (papel: Papel) => de ?? (papel === 'agente' ? '/campo' : '/');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState<'senha' | Papel>();

  if (usuario) return <Navigate to={destinoDe(usuario.papel)} replace />;

  const executar = async (qual: 'senha' | Papel, acao: () => Promise<UsuarioSessao>) => {
    setErro(undefined);
    setEnviando(qual);
    try {
      const entrou = await acao();
      navegar(destinoDe(entrou.papel), { replace: true });
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

        {/* Enquanto /api/auth/modo não responde, os botões já ocupam o lugar (desligados): se a seção só aparecesse
            depois, o cartão cresceria e empurraria tudo, e um toque no lugar de um papel cairia em outro. */}
        {(modo.isPending || modo.data?.demo) && (
          <section className={estilos.demo} aria-labelledby="entrar-demo" aria-busy={modo.isPending}>
            <h2 id="entrar-demo" className={estilos.demoTitulo}>Demonstração: entrar com um clique como</h2>
            <ul className={estilos.papeis}>
              {PAPEIS.map((papel) => (
                <li key={papel} className={papel === PAPEL_RECOMENDADO ? estilos.recomendado : undefined}>
                  <button type="button" className={estilos.papel} disabled={modo.isPending || enviando !== undefined} onClick={() => void executar(papel, () => entrarDemo(papel))}>
                    {papel === PAPEL_RECOMENDADO && <span className={estilos.etiqueta}>Recomendado para avaliar: vê tudo</span>}
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
