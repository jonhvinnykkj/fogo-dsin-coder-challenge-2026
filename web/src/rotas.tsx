// Rotas da interface. Telas ainda não construídas mostram um EstadoVazio com o nome da tela.
import {
  ChartLineUp, IdentificationBadge, MapTrifold, Signpost, TrafficCone, WarningDiamond, Wrench, type Icon,
} from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';
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

// Vitrine dos componentes base: só em desenvolvimento (fica fora do pacote final).
const Vitrine = import.meta.env.DEV ? lazy(() => import('./paginas/Vitrine')) : null;

const filhas: RouteObject[] = [
  { index: true, element: pendente('Central de Operações', 'Em construção: mapa ao vivo de Marília com indicadores, alertas chegando e a situação de cada região.', MapTrifold) },
  { path: 'equipamentos', element: pendente('Equipamentos', 'Em construção: inventário com busca, filtros por tipo, situação, bairro, região, órgão e manutenção.', TrafficCone) },
  { path: 'equipamentos/novo', element: pendente('Cadastrar equipamento', 'Em construção: formulário com os campos de cada tipo e escolha do ponto no mapa.', TrafficCone) },
  { path: 'equipamentos/:id', element: pendente('Ficha do equipamento', 'Em construção: dados, mini-mapa, linha do tempo de situação, manutenções, telemetria e alertas.', TrafficCone) },
  { path: 'equipamentos/:id/editar', element: pendente('Editar equipamento', 'Em construção: o mesmo formulário do cadastro, preenchido.', TrafficCone) },
  { path: 'agentes', element: pendente('Agentes', 'Em construção: agentes de trânsito, guardas e policiais com situação, turno e base.', IdentificationBadge) },
  { path: 'agentes/novo', element: pendente('Cadastrar agente', 'Em construção: formulário do agente com base escolhida no mapa.', IdentificationBadge) },
  { path: 'agentes/:id', element: pendente('Ficha do agente', 'Em construção: dados do agente e as últimas ocorrências atendidas.', IdentificationBadge) },
  { path: 'agentes/:id/editar', element: pendente('Editar agente', 'Em construção: o mesmo formulário do cadastro, preenchido.', IdentificationBadge) },
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
