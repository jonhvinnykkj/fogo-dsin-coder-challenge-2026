// Rotas da interface. Telas ainda não construídas mostram um EstadoVazio com o nome da tela.
import {
  ChartLineUp, MapTrifold, Signpost, WarningDiamond, Wrench, type Icon,
} from '@phosphor-icons/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link, useRouteError, type RouteObject } from 'react-router-dom';
import { AvisoErro } from './componentes/AvisoErro';
import { classeBotao } from './componentes/Botao';
import { EstadoVazio } from './componentes/EstadoVazio';
import { Shell } from './componentes/Shell';

function pendente(titulo: string, descricao: string, Icone: Icon) {
  return (
    <div className="pagina">
      <EstadoVazio tamanho="pagina" titulo={titulo} descricao={descricao} icone={<Icone weight="fill" />} />
    </div>
  );
}

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

// Telas do inventário: carregadas sob demanda (mapa e gráficos pesam; a Central não precisa deles de início).
const Equipamentos = lazy(() => import('./paginas/Equipamentos'));
const EquipamentoFicha = lazy(() => import('./paginas/EquipamentoFicha'));
const EquipamentoFormulario = lazy(() => import('./paginas/EquipamentoFormulario'));
const Agentes = lazy(() => import('./paginas/Agentes'));
const AgenteFicha = lazy(() => import('./paginas/AgenteFicha'));
const AgenteFormulario = lazy(() => import('./paginas/AgenteFormulario'));

function Carregando({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando…" /></div>}>{children}</Suspense>;
}

// Vitrine dos componentes base: só em desenvolvimento (fica fora do pacote final).
const Vitrine = import.meta.env.DEV ? lazy(() => import('./paginas/Vitrine')) : null;

const filhas: RouteObject[] = [
  { index: true, element: pendente('Central de Operações', 'Em construção: mapa ao vivo de Marília com indicadores, alertas chegando e a situação de cada região.', MapTrifold) },
  { path: 'equipamentos', element: <Carregando><Equipamentos /></Carregando> },
  { path: 'equipamentos/novo', element: <Carregando><EquipamentoFormulario /></Carregando> },
  { path: 'equipamentos/:id', element: <Carregando><EquipamentoFicha /></Carregando> },
  { path: 'equipamentos/:id/editar', element: <Carregando><EquipamentoFormulario /></Carregando> },
  { path: 'agentes', element: <Carregando><Agentes /></Carregando> },
  { path: 'agentes/novo', element: <Carregando><AgenteFormulario /></Carregando> },
  { path: 'agentes/:id', element: <Carregando><AgenteFicha /></Carregando> },
  { path: 'agentes/:id/editar', element: <Carregando><AgenteFormulario /></Carregando> },
  { path: 'manutencao', element: pendente('Manutenção', 'Em construção: atrasadas, imediatas e as programadas para os próximos 7 e 30 dias.', Wrench) },
  { path: 'alertas', element: pendente('Alertas', 'Em construção: alertas ao vivo, críticos primeiro, com reconhecer e resolver.', WarningDiamond) },
  { path: 'previsoes', element: pendente('Previsões', 'Em construção: risco por bairro e hora, reforço de agentes, falhas prováveis e tendências.', ChartLineUp) },
  ...(Vitrine ? [{ path: 'vitrine', element: <Suspense fallback={null}><Vitrine /></Suspense> }] : []),
  { path: '*', element: <NaoEncontrada /> },
];

export const rotas: RouteObject[] = [{ path: '/', element: <Shell />, errorElement: <ErroDeRota />, children: filhas }];

export function criarRoteador() {
  return createBrowserRouter(rotas);
}
