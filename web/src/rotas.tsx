// Rotas da interface (todas as telas carregadas sob demanda, menos a casca).
import { Signpost } from '@phosphor-icons/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link, useRouteError, type RouteObject } from 'react-router-dom';
import { AvisoErro } from './componentes/AvisoErro';
import { classeBotao } from './componentes/Botao';
import { EstadoVazio } from './componentes/EstadoVazio';
import { Shell } from './componentes/Shell';

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
const Boletim = lazy(() => import('./paginas/Boletim'));
const Campo = lazy(() => import('./paginas/Campo'));

function Carregando({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando…" /></div>}>{children}</Suspense>;
}

// Vitrine dos componentes base: só em desenvolvimento (fica fora do pacote final).
const Vitrine = import.meta.env.DEV ? lazy(() => import('./paginas/Vitrine')) : null;

const filhas: RouteObject[] = [
  { index: true, element: <Carregando><Central /></Carregando> },
  { path: 'equipamentos', element: <Carregando><Equipamentos /></Carregando> },
  { path: 'equipamentos/novo', element: <Carregando><EquipamentoFormulario /></Carregando> },
  { path: 'equipamentos/:id', element: <Carregando><EquipamentoFicha /></Carregando> },
  { path: 'equipamentos/:id/editar', element: <Carregando><EquipamentoFormulario /></Carregando> },
  { path: 'agentes', element: <Carregando><Agentes /></Carregando> },
  { path: 'agentes/novo', element: <Carregando><AgenteFormulario /></Carregando> },
  { path: 'agentes/:id', element: <Carregando><AgenteFicha /></Carregando> },
  { path: 'agentes/:id/editar', element: <Carregando><AgenteFormulario /></Carregando> },
  { path: 'manutencao', element: <Carregando><Manutencao /></Carregando> },
  { path: 'alertas', element: <Carregando><Alertas /></Carregando> },
  { path: 'previsoes', element: <Carregando><Previsoes /></Carregando> },
  ...(Vitrine ? [{ path: 'vitrine', element: <Suspense fallback={null}><Vitrine /></Suspense> }] : []),
  { path: '*', element: <NaoEncontrada /> },
];

export const rotas: RouteObject[] = [
  { path: '/', element: <Shell />, errorElement: <ErroDeRota />, children: filhas },
  // Boletim do dia: folha para imprimir, fora da casca (na impressão sai só a folha, sem o menu).
  { path: '/boletim', element: <Carregando><Boletim /></Carregando>, errorElement: <ErroDeRota /> },
  // Modo Campo: celular do agente na rua, fora da casca do gestor (sem menu lateral).
  { path: '/campo', element: <Carregando><Campo /></Carregando>, errorElement: <ErroDeRota /> },
];

export function criarRoteador() {
  return createBrowserRouter(rotas);
}
