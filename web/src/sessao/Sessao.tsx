// Sessão na interface: quem está logado, entrar, sair e o que o papel pode fazer.
// O servidor é quem decide (toda rota confere o papel de novo); aqui só escondemos o que a pessoa não pode usar.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { pode, type Acao, type ModoAcesso, type Papel, type UsuarioSessao } from '../../../shared/seguranca';
import { api, EVENTO_SESSAO_EXPIRADA } from '../api/cliente';
import { EstadoVazio } from '../componentes/EstadoVazio';

const CHAVE_EU = ['sessao', 'eu'] as const;
const CHAVE_MODO = ['sessao', 'modo'] as const;

interface ValorSessao {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<UsuarioSessao>;
  entrarDemo: (papel: Papel) => Promise<UsuarioSessao>;
  sair: () => Promise<void>;
}

const ContextoSessao = createContext<ValorSessao | undefined>(undefined);

async function buscarEu(): Promise<UsuarioSessao | null> {
  return (await api.get<{ usuario: UsuarioSessao | null }>('/api/auth/eu')).usuario;
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const eu = useQuery({ queryKey: CHAVE_EU, queryFn: buscarEu, staleTime: Infinity, retry: 1 });

  const comecar = useCallback((usuario: UsuarioSessao) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' }); // nada do usuário anterior fica no cache
    qc.setQueryData(CHAVE_EU, usuario);
    return usuario;
  }, [qc]);

  const terminar = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' });
    qc.setQueryData(CHAVE_EU, null);
  }, [qc]);

  // Qualquer 401 da API (sessão venceu ou foi encerrada em outra aba) volta para a tela de entrada.
  useEffect(() => {
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, terminar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, terminar);
  }, [terminar]);

  const valor = useMemo<ValorSessao>(() => ({
    usuario: eu.data ?? null,
    carregando: eu.isPending,
    entrar: async (login, senha) => comecar(await api.post<UsuarioSessao>('/api/auth/entrar', { login, senha })),
    entrarDemo: async (papel) => comecar(await api.post<UsuarioSessao>('/api/auth/demo', { papel })),
    sair: async () => {
      try {
        await api.post('/api/auth/sair');
      } finally {
        terminar();
      }
    },
  }), [eu.data, eu.isPending, comecar, terminar]);

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}

export function useSessao(): ValorSessao {
  const valor = useContext(ContextoSessao);
  if (!valor) throw new Error('useSessao precisa do SessaoProvider');
  return valor;
}

/**
 * O papel logado pode fazer `acao`? Fora do SessaoProvider (testes de um componente isolado) responde sim:
 * esconder botões é conforto, a permissão de verdade é conferida no servidor.
 */
export function usePode(acao: Acao): boolean {
  const valor = useContext(ContextoSessao);
  if (!valor) return true;
  return pode(valor.usuario?.papel, acao);
}

/** Usuário logado, ou undefined fora do provider. */
export function useUsuario(): UsuarioSessao | null | undefined {
  return useContext(ContextoSessao)?.usuario;
}

export function useModoAcesso() {
  return useQuery({ queryKey: CHAVE_MODO, queryFn: () => api.get<ModoAcesso>('/api/auth/modo'), staleTime: Infinity });
}

/** Só mostra o conteúdo com sessão; sem ela, manda para /entrar lembrando de onde veio. */
export function ExigeSessao({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useSessao();
  const local = useLocation();
  if (carregando) return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando…" /></div>;
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname + local.search }} />;
  return <>{children}</>;
}

/** Só mostra a tela se o papel puder `acao` (ex.: formulário de cadastro só para o gestor). */
export function ExigePermissao({ acao, children }: { acao: Acao; children: ReactNode }) {
  const permitido = usePode(acao);
  if (!permitido) {
    return (
      <div className="pagina">
        <EstadoVazio tamanho="pagina" titulo="Sem permissão" descricao="O seu perfil não pode usar esta tela. Peça a um gestor se precisar." />
      </div>
    );
  }
  return <>{children}</>;
}
