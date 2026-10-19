// Rotas da interface (todas as telas carregadas sob demanda, menos a casca).
import { Signpost } from '@phosphor-icons/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link, useRouteError, type RouteObject } from 'react-router-dom';
import { AvisoErro } from './componentes/AvisoErro';
import { classeBotao } from './componentes/Botao';
import { EstadoVazio } from './componentes/EstadoVazio';
import { Shell } from './componentes/Shell';
import { ExigePermissao, ExigeSessao } from './sessao/Sessao';
import { TempoRealProvider } from './tempo-real/TempoReal';

function NaoEncontrada() {
  return (
    <div className="pagina">
      <EstadoVazio
        tamanho="pagina"
        titulo="Página não encontrada"
        descricao="O endereço não corresponde a nenhuma tela do F.O.G.O. Confira o link ou volte para a Central."
        icone={<Signpost weight="fill" />}
        acao={<Link to="/" className={classeBotao('primario')}>Ir para a Central</Link>}
      />
    </div>
  );
}

function ErroDeRota() {
  const erro = useRouteError();
  return (
    <div className="pagina">
      <AvisoErro erro={erro} titulo="Esta tela encontrou um problema" onTentarDeNovo={() => window.location.reload()} />
    </div>
  );
}

// Demais telas: carregadas sob demanda (gráficos e formulários pesam; a Central não precisa deles de início).
const Equipamentos = lazy(() => import('./paginas/Equipamentos'));
const EquipamentoFicha = lazy(() => import('./paginas/EquipamentoFicha'));
const EquipamentoFormulario = lazy(() => import('./paginas/EquipamentoFormulario'));
const Agentes = lazy(() => import('./paginas/Agentes'));
const AgenteFicha = lazy(() => import('./paginas/AgenteFicha'));
const AgenteFormulario = lazy(() => import('./paginas/AgenteFormulario'));
const Manutencao = lazy(() => import('./paginas/Manutencao'));
// A Central (com o Leaflet) é a primeira tela: o arquivo dela começa a baixar já, junto com o resto do app, em vez de
// esperar a primeira renderização pedir. Separada, o pacote principal fica leve para quem abre direto outra tela.
const carregarCentral = () => import('./paginas/Central');
void carregarCentral();
const Central = lazy(carregarCentral);
const Alertas = lazy(() => import('./paginas/Alertas'));
const Previsoes = lazy(() => import('./paginas/Previsoes'));
const Auditoria = lazy(() => import('./paginas/Auditoria'));
const Entrar = lazy(() => import('./paginas/Entrar'));

function Carregando({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando…" /></div>}>{children}</Suspense>;
}

// Vitrine dos componentes base: só em desenvolvimento (fica fora do pacote final).
const Vitrine = import.meta.env.DEV ? lazy(() => import('./paginas/Vitrine')) : null;

const filhas: RouteObject[] = [
  { index: true, element: <Carregando><Central /></Carregando> },
  { path: 'equipamentos', element: <Carregando><Equipamentos /></Carregando> },
  { path: 'equipamentos/novo', element: <Carregando><ExigePermissao acao="cadastrar"><EquipamentoFormulario /></ExigePermissao></Carregando> },
  { path: 'equipamentos/:id', element: <Carregando><EquipamentoFicha /></Carregando> },
  { path: 'equipamentos/:id/editar', element: <Carregando><ExigePermissao acao="cadastrar"><EquipamentoFormulario /></ExigePermissao></Carregando> },
  { path: 'agentes', element: <Carregando><Agentes /></Carregando> },
  { path: 'agentes/novo', element: <Carregando><ExigePermissao acao="cadastrar"><AgenteFormulario /></ExigePermissao></Carregando> },
  { path: 'agentes/:id', element: <Carregando><AgenteFicha /></Carregando> },
  { path: 'agentes/:id/editar', element: <Carregando><ExigePermissao acao="cadastrar"><AgenteFormulario /></ExigePermissao></Carregando> },
  { path: 'manutencao', element: <Carregando><Manutencao /></Carregando> },
  { path: 'alertas', element: <Carregando><Alertas /></Carregando> },
  { path: 'previsoes', element: <Carregando><Previsoes /></Carregando> },
  { path: 'auditoria', element: <Carregando><ExigePermissao acao="auditar"><Auditoria /></ExigePermissao></Carregando> },
  ...(Vitrine ? [{ path: 'vitrine', element: <Suspense fallback={null}><Vitrine /></Suspense> }] : []),
  { path: '*', element: <NaoEncontrada /> },
];

// Tudo fica atrás da sessão; o tempo real (SSE) só abre depois de entrar, com o cookie da sessão.
export const rotas: RouteObject[] = [
  { path: '/entrar', element: <Carregando><Entrar /></Carregando>, errorElement: <ErroDeRota /> },
  {
    path: '/',
    element: <ExigeSessao><TempoRealProvider><Shell /></TempoRealProvider></ExigeSessao>,
    errorElement: <ErroDeRota />,
    children: filhas,
  },
];

export function criarRoteador() {
  return createBrowserRouter(rotas);
}
