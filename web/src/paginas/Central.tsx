// Central de Operações: a primeira tela. Faixa de 6 indicadores ao vivo, mapa de Marília (equipamentos agrupados,
// agentes andando, bairros pintados pelo índice de atenção, calor das ocorrências), filtros que valem para o mapa e
// para os números, feed de alertas e painel de regiões ao lado, ficha lateral do marcador e os controles da
// demonstração. Abaixo de 1100 px a coluna da direita vira gaveta.
//
// Fluxo dos dados: tudo vem do cache do TanStack Query, mantido vivo pelo SSE (useStream). O mapa consulta as
// próprias posições (só ele re-renderiza a cada 2 s); esta página só re-renderiza com indicadores, alertas e regiões.
import { Faders, ListBullets, SquaresFour, WarningDiamond, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CATEGORIAS_AGENTE, COR_CRITICIDADE, COR_SITUACAO, ORGAOS, REGIOES, ROTULO_CATEGORIA_AGENTE, ROTULO_SITUACAO, ROTULO_SITUACAO_AGENTE,
  SITUACOES_AGENTE, SITUACOES_EQUIPAMENTO,
} from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import type { Alerta } from '../../../shared/modelos';
import { filtrosCentralSchema, type FiltrosCentral } from '../../../shared/schemas';
import { TIPOS_EQUIPAMENTO } from '../../../shared/tipos-equipamento';
import { chaves, limparFiltros, useAlertas, useBairros, useIndicadores, useRegioes } from '../api/consultas';
import { Botao } from '../componentes/Botao';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/BarraFiltros';
import { ControlesSimulacao } from '../componentes/ControlesSimulacao';
import { FaixaIndicadores } from '../componentes/FaixaIndicadores';
import { FeedAlertas } from '../componentes/FeedAlertas';
import { FichaLateral } from '../componentes/FichaLateral';
import { rotuloCurtoDoTipo } from '../componentes/IconeTipo';
import { MapaOperacional, type CamadasVisiveis, type ControleMapa, type SelecaoMapa } from '../componentes/MapaOperacional';
import { Notificacao, type DadosNotificacao } from '../componentes/Notificacao';
import { PainelRegioes } from '../componentes/PainelRegioes';
import { filtrarAlertasPorLugar, filtrarRegioesPorLugar, temRecorteDeLugar } from '../util/alertasPorLugar';
import { contagemAteLimite } from '../util/numeros';
import { useConsulta } from '../util/useConsulta';
import estilos from './Central.module.css';

/** /api/alertas devolve no máximo 200 (os mais recentes, sem o total): chegando a isso, a contagem vira "200+". */
const LIMITE_ALERTAS = 200;

// ------------------------------------------------------------------------------------------------ filtros na URL

const GRUPO_AMBOS = 'Equipamentos e agentes';
const GRUPO_EQUIPAMENTOS = 'Só equipamentos';
const GRUPO_AGENTES = 'Só agentes';
/** Fora de serviço não aparece no mapa, então não vira opção de filtro (a API aceita). */
const SITUACOES_AGENTE_NO_MAPA = SITUACOES_AGENTE.filter((s) => s !== 'fora_de_servico');

const ROTULO_MANUTENCAO: Record<string, string> = { imediata: 'Manutenção imediata', proxima: 'Manutenção nos próximos 7 dias', atrasada: 'Manutenção atrasada' };

/** Filtros guardados na URL (`?situacao=furtado,mau_funcionamento&regiao=Centro`): link compartilhável. Valor inválido é ignorado. */
function lerFiltros(params: URLSearchParams): FiltrosCentral {
  const bruto = Object.fromEntries(params.entries());
  const r = filtrosCentralSchema.safeParse(bruto);
  if (r.success) return limparFiltros(r.data) as FiltrosCentral;
  const invalidos = new Set(r.error.issues.map((i) => String(i.path[0])));
  const sem = Object.fromEntries(Object.entries(bruto).filter(([k]) => !invalidos.has(k)));
  const r2 = filtrosCentralSchema.safeParse(sem);
  return r2.success ? (limparFiltros(r2.data) as FiltrosCentral) : {};
}

// ------------------------------------------------------------------------------------------------ preferências locais

const CHAVE_CAMADAS = 'fogo:camadas';
const CAMADAS_PADRAO: CamadasVisiveis = { equipamentos: true, agentes: true, bairros: true, calor: false };

function lerCamadas(): CamadasVisiveis {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_CAMADAS) ?? 'null') as Partial<CamadasVisiveis> | null;
    return salvo ? { ...CAMADAS_PADRAO, ...salvo } : CAMADAS_PADRAO;
  } catch {
    return CAMADAS_PADRAO;
  }
}

const ROTULO_CAMADA: Record<keyof CamadasVisiveis, string> = {
  equipamentos: 'Equipamentos',
  agentes: 'Agentes',
  bairros: 'Bairros',
  calor: 'Calor de ocorrências',
};

const CONSULTA_ESTREITA = '(max-width: 1100px)';
/** Celular: a Central ocupa a altura da tela e os controles da simulação descem para baixo do mapa. */
const CONSULTA_CELULAR = '(max-width: 720px)';
/** Regiões não têm evento no SSE: quando chegam alertas, relê o índice dos bairros (no máximo a cada 4 s). */
const INTERVALO_REGIOES_MS = 4000;

type Aba = 'alertas' | 'regioes';

export default function Central() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const local = useLocation();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltros(params), [params]);
  const qtdFiltros = Object.keys(filtros).length;
  const filtrado = qtdFiltros > 0;

  const indicadores = useIndicadores(filtros, { atualizarACada: filtrado ? 5000 : undefined });
  const alertasTodos = useAlertas({ status: 'abertos', limite: LIMITE_ALERTAS });
  const regioesTodas = useRegioes();
  const bairros = useBairros();

  const [camadas, setCamadas] = useState<CamadasVisiveis>(lerCamadas);
  const [selecao, setSelecao] = useState<SelecaoMapa | null>(null);
  const [aba, setAba] = useState<Aba>('alertas');
  const [filtrosAbertos, setFiltrosAbertos] = useState(filtrado);
  const [colunaAberta, setColunaAberta] = useState(false);
  const [notificacao, setNotificacao] = useState<DadosNotificacao | null>(null);
  const [injetadoId, setInjetadoId] = useState<number>();
  const estreita = useConsulta(CONSULTA_ESTREITA);
  const celular = useConsulta(CONSULTA_CELULAR);
  const controle = useRef<ControleMapa>(null);

  // Alertas e regiões seguem o recorte de lugar (região e bairro), como a placa de alertas críticos; a API de alertas não filtra por lugar.
  const recorte = useMemo(() => ({ regiao: filtros.regiao, bairroId: filtros.bairroId }), [filtros.regiao, filtros.bairroId]);
  const recortado = temRecorteDeLugar(recorte);
  const alertas = useMemo(
    () => ({ ...alertasTodos, data: filtrarAlertasPorLugar(alertasTodos.data, recorte, bairros.data) }),
    [alertasTodos, recorte, bairros.data],
  );
  const regioes = useMemo(
    () => ({ ...regioesTodas, data: filtrarRegioesPorLugar(regioesTodas.data, recorte) }),
    [regioesTodas, recorte],
  );

  const nomesBairros = useMemo(() => new Map((bairros.data ?? []).map((b) => [b.id, b.nome])), [bairros.data]);
  const nomeDoBairro = useCallback((id: number) => nomesBairros.get(id), [nomesBairros]);

  // ---- regiões relidas quando os alertas mudam (o primeiro carregamento já veio junto)
  const primeiraLeitura = useRef(true);
  const ultimaRegioes = useRef(Date.now());
  const relerRegioes = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!alertasTodos.data) return;
    if (primeiraLeitura.current) {
      primeiraLeitura.current = false;
      return;
    }
    if (relerRegioes.current) return;
    const espera = Math.max(0, INTERVALO_REGIOES_MS - (Date.now() - ultimaRegioes.current));
    relerRegioes.current = setTimeout(() => {
      relerRegioes.current = undefined;
      ultimaRegioes.current = Date.now();
      void qc.invalidateQueries({ queryKey: chaves.regioes() });
    }, espera);
  }, [alertasTodos.data, qc]);
  useEffect(() => () => {
    clearTimeout(relerRegioes.current);
    relerRegioes.current = undefined;
  }, []);

  // ---- ações do mapa
  /** Leva a câmera até o alerta, faz o anel pulsar no ponto e o bairro piscar na cor da criticidade. */
  const focarAlerta = useCallback((a: Alerta) => {
    const cor = COR_CRITICIDADE[a.criticidade];
    if (a.lat !== undefined && a.lng !== undefined) controle.current?.focarPonto(a.lat, a.lng, cor);
    else if (a.bairroId !== undefined) controle.current?.focarBairro(a.bairroId);
    if (a.bairroId !== undefined) controle.current?.destacarBairro(a.bairroId, cor, true);
    if (window.matchMedia(CONSULTA_ESTREITA).matches) setColunaAberta(false);
  }, []);

  const aoChegarAlertas = useCallback((novos: Alerta[]) => {
    for (const a of novos.slice(0, 8)) {
      if (a.bairroId !== undefined) controle.current?.destacarBairro(a.bairroId, COR_CRITICIDADE[a.criticidade]);
    }
  }, []);

  const aoChegarCritico = useCallback((a: Alerta) => {
    setNotificacao({
      id: a.id,
      titulo: 'Alerta crítico',
      texto: a.titulo,
      tom: 'critico',
      acao: { rotulo: 'Ver no mapa', onClick: () => focarAlerta(a) },
    });
  }, [focarAlerta]);

  const fecharNotificacao = useCallback(() => setNotificacao(null), []);

  const aoSelecionarMarcador = useCallback((s: SelecaoMapa) => {
    setSelecao(s);
    if (window.matchMedia(CONSULTA_ESTREITA).matches) setColunaAberta(true);
  }, []);

  const focarBairro = useCallback((id: number) => {
    controle.current?.focarBairro(id);
    if (window.matchMedia(CONSULTA_ESTREITA).matches) setColunaAberta(false);
  }, []);

  // "Ver no mapa" vindo da tela de Alertas: foca o alerta assim que o mapa existe e limpa o pedido.
  useEffect(() => {
    const foco = (local.state as { focoAlerta?: Alerta } | null)?.focoAlerta;
    if (!foco) return;
    // Sem limpar o tempo no efeito: a troca de endereço abaixo re-executa este efeito e cancelaria o foco.
    // Se a tela fechar antes, `controle.current` já é nulo e nada acontece.
    setTimeout(() => focarAlerta(foco), 300);
    navegar({ search: local.search }, { replace: true, state: null });
  }, [local.state, local.search, navegar, focarAlerta]);

  // ---- filtros
  const mudarFiltro = (chave: string, valor: ValorFiltro) => {
    setParams((atual) => {
      const novo = new URLSearchParams(atual);
      const texto = Array.isArray(valor) ? valor.join(',') : valor;
      if (texto) novo.set(chave, texto);
      else novo.delete(chave);
      // Região trocada: bairro de outra região deixa de valer.
      if (chave === 'regiao' && texto && bairros.data) {
        const b = bairros.data.find((x) => String(x.id) === novo.get('bairroId'));
        if (b && b.regiao !== texto) novo.delete('bairroId');
      }
      return novo;
    }, { replace: true });
  };

  const definicoes: DefinicaoFiltro[] = useMemo(() => {
    const listaBairros = (bairros.data ?? [])
      .filter((b) => !filtros.regiao || b.regiao === filtros.regiao)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return [
      // Cada grupo diz o que afeta: o recorte do lugar vale para os dois; o resto, só para o que o nome diz.
      { grupo: GRUPO_AMBOS, tipo: 'selecao', chave: 'regiao', rotulo: 'Região', rotuloTodos: 'Todas', opcoes: REGIOES.map((r) => ({ valor: r, rotulo: r })) },
      { grupo: GRUPO_AMBOS, tipo: 'selecao', chave: 'bairroId', rotulo: 'Bairro', rotuloTodos: 'Todos', opcoes: listaBairros.map((b) => ({ valor: String(b.id), rotulo: b.nome })) },
      { grupo: GRUPO_AMBOS, tipo: 'selecao', chave: 'orgao', rotulo: 'Órgão', rotuloTodos: 'Todos', opcoes: ORGAOS.map((o) => ({ valor: o, rotulo: o })) },
      { grupo: GRUPO_EQUIPAMENTOS, tipo: 'pilulas', chave: 'situacao', rotulo: 'Situação do equipamento', opcoes: SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s], cor: COR_SITUACAO[s] })) },
      { grupo: GRUPO_EQUIPAMENTOS, tipo: 'selecao', chave: 'tipo', rotulo: 'Tipo', rotuloTodos: 'Todos', opcoes: TIPOS_EQUIPAMENTO.map((t) => ({ valor: t.id, rotulo: rotuloCurtoDoTipo(t.id) })) },
      {
        grupo: GRUPO_EQUIPAMENTOS, tipo: 'selecao', chave: 'manutencao', rotulo: 'Manutenção', rotuloTodos: 'Qualquer',
        opcoes: [{ valor: 'imediata', rotulo: 'Imediata' }, { valor: 'proxima', rotulo: 'Próximos 7 dias' }, { valor: 'atrasada', rotulo: 'Atrasada' }],
      },
      { grupo: GRUPO_AGENTES, tipo: 'pilulas', chave: 'categoriaAgente', rotulo: 'Categoria do agente', opcoes: CATEGORIAS_AGENTE.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA_AGENTE[c] })) },
      { grupo: GRUPO_AGENTES, tipo: 'pilulas', chave: 'situacaoAgente', rotulo: 'Situação do agente', opcoes: SITUACOES_AGENTE_NO_MAPA.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO_AGENTE[s] })) },
    ];
  }, [bairros.data, filtros.regiao]);

  const valores: Record<string, ValorFiltro> = {
    situacao: filtros.situacao,
    categoriaAgente: filtros.categoriaAgente,
    situacaoAgente: filtros.situacaoAgente,
    tipo: filtros.tipo?.[0],
    regiao: filtros.regiao,
    bairroId: filtros.bairroId ? String(filtros.bairroId) : undefined,
    orgao: filtros.orgao,
    manutencao: filtros.manutencao,
  };

  const resumoFiltros = filtrado
    ? [
        ...(filtros.situacao ?? []).map((s) => ROTULO_SITUACAO[s]),
        ...(filtros.tipo ?? []).map((t) => rotuloCurtoDoTipo(t)),
        ...(filtros.categoriaAgente ?? []).map((c) => ROTULO_CATEGORIA_AGENTE[c]),
        ...(filtros.situacaoAgente ?? []).map((s) => `Agente ${ROTULO_SITUACAO_AGENTE[s].toLowerCase()}`),
        filtros.regiao && `Região ${filtros.regiao}`,
        filtros.bairroId && nomeDoBairro(filtros.bairroId),
        filtros.orgao,
        filtros.manutencao && ROTULO_MANUTENCAO[filtros.manutencao],
      ].filter(Boolean).join(', ')
    : 'Toda a cidade';

  // ---- camadas
  const alternarCamada = (c: keyof CamadasVisiveis) => {
    setCamadas((atual) => {
      const nova = { ...atual, [c]: !atual[c] };
      try {
        localStorage.setItem(CHAVE_CAMADAS, JSON.stringify(nova));
      } catch {
        /* sem armazenamento: vale só nesta aba */
      }
      return nova;
    });
  };

  // ---- abas (setas trocam de aba, como pede o padrão de abas)
  const teclarAba = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const proxima: Aba = aba === 'alertas' ? 'regioes' : 'alertas';
    setAba(proxima);
    document.getElementById(`aba-${proxima}`)?.focus();
  };

  const abertos = alertas.data?.length ?? 0;
  const criticos = alertas.data?.filter((a) => a.criticidade === 'critica').length ?? 0;
  // No limite pode haver mais do que veio: "200+" abertos e "pelo menos N" críticos (contados entre os mais recentes).
  const noLimite = (alertasTodos.data?.length ?? 0) >= LIMITE_ALERTAS;
  const textoAbertos = recortado ? formatarNumero(abertos) : contagemAteLimite(abertos, LIMITE_ALERTAS);
  const lugar = filtros.bairroId !== undefined ? nomeDoBairro(filtros.bairroId) : filtros.regiao && `região ${filtros.regiao}`;
  const textoCriticos = `${formatarNumero(criticos)}${noLimite ? '+' : ''}`;
  const regioesComAtencao = regioes.data?.filter((r) => r.nivel !== 'normal').length ?? 0;
  const colunaVisivel = !estreita || colunaAberta;

  // Em tela grande a barra flutua no canto do mapa; no celular fica logo abaixo dele (ver `encaixado`).
  const controlesSimulacao = (
    <ControlesSimulacao
      encaixado={celular}
      onInjetado={(_tipo, novos) => {
        const comLugar = novos.find((a) => a.lat !== undefined && a.lng !== undefined) ?? novos[0];
        if (!comLugar) return;
        focarAlerta(comLugar);
        setInjetadoId(comLugar.id);
        setAba('alertas');
        setSelecao(null);
      }}
    />
  );

  return (
    <div className={estilos.central}>
      <h1 className="so-leitor">Central de Operações</h1>
      <FaixaIndicadores indicadores={indicadores.data} filtrado={filtrado} />

      <div className={estilos.corpo}>
        <section className={estilos.areaMapa} aria-label="Mapa e filtros">
          <div className={estilos.ferramentas}>
            <button
              id="botao-filtros"
              type="button"
              className={`${estilos.botaoFiltros} ${filtrado ? estilos.comFiltros : ''}`}
              aria-expanded={filtrosAbertos}
              aria-controls="filtros-central"
              onClick={() => setFiltrosAbertos((a) => !a)}
            >
              <Faders weight="fill" size={16} aria-hidden="true" />
              Filtros
              {filtrado && <span className={estilos.contador}>{qtdFiltros}</span>}
            </button>
            <p className={estilos.resumo} title={resumoFiltros}>{resumoFiltros}</p>
            <div className={estilos.camadas} role="group" aria-label="Camadas do mapa">
              {(Object.keys(ROTULO_CAMADA) as (keyof CamadasVisiveis)[]).map((c) => (
                <button key={c} type="button" className={estilos.camada} aria-pressed={camadas[c]} onClick={() => alternarCamada(c)}>
                  <span className={`${estilos.amostraCamada} ${estilos[`amostra_${c}`]}`} aria-hidden="true" />
                  {ROTULO_CAMADA[c]}
                </button>
              ))}
            </div>
          </div>

          {filtrosAbertos && (
            <div
              id="filtros-central"
              className={estilos.filtros}
              role="region"
              aria-label="Filtros do mapa"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFiltrosAbertos(false);
                  document.getElementById('botao-filtros')?.focus();
                }
              }}
            >
              <div className={estilos.topoFiltros}>
                <h2>Filtros</h2>
                <Botao variante="fantasma" tamanho="pequeno" icone={<X weight="bold" size={14} aria-hidden="true" />} onClick={() => setFiltrosAbertos(false)}>
                  Fechar
                </Botao>
              </div>
              <BarraFiltros filtros={definicoes} valores={valores} onChange={mudarFiltro} onLimpar={() => setParams({}, { replace: true })} />
              <p className={estilos.ajudaFiltros}>
                Região, bairro e órgão valem para equipamentos e agentes (do agente, conta a base). Situação, tipo e manutenção
                escondem só equipamentos; categoria e situação do agente, só agentes. Região e bairro também recortam a lista de
                alertas e o painel de regiões.
              </p>
            </div>
          )}

          <div className={estilos.moldura}>
            <MapaOperacional
              ref={controle}
              filtros={filtros}
              camadas={camadas}
              selecao={selecao}
              onSelecionar={aoSelecionarMarcador}
              alertasAbertos={alertasTodos.data}
              regioes={regioesTodas.data}
              bairros={bairros.data}
            />
            {!celular && controlesSimulacao}
            <Notificacao notificacao={notificacao} onFechar={fecharNotificacao} posicao="canto-pai" />
            {estreita && (
              <button type="button" className={estilos.abrirColuna} onClick={() => setColunaAberta(true)} aria-haspopup="dialog">
                <WarningDiamond weight="fill" size={16} aria-hidden="true" />
                Alertas e regiões
                <span className={`${estilos.contador} ${criticos ? estilos.contadorCritico : ''}`}>{textoAbertos}</span>
              </button>
            )}
          </div>
          {celular && controlesSimulacao}
        </section>

        {estreita && colunaAberta && <div className={estilos.veu} onClick={() => setColunaAberta(false)} aria-hidden="true" />}

        <aside
          className={`${estilos.coluna} ${estreita ? estilos.gaveta : ''} ${colunaAberta ? estilos.gavetaAberta : ''}`}
          aria-label="Alertas, regiões e ficha"
          inert={!colunaVisivel}
          onKeyDown={(e) => {
            if (estreita && e.key === 'Escape' && !selecao) setColunaAberta(false);
          }}
        >
          {estreita && (
            <div className={estilos.topoGaveta}>
              <button type="button" className={estilos.fecharGaveta} onClick={() => setColunaAberta(false)}>Voltar ao mapa</button>
            </div>
          )}

          {selecao && (
            <FichaLateral selecao={selecao} onFechar={() => setSelecao(null)} nomeDoBairro={nomeDoBairro} />
          )}

          <div className={estilos.abas} hidden={Boolean(selecao)}>
            <div className={estilos.listaAbas} role="tablist" aria-label="Painéis da Central" onKeyDown={teclarAba}>
              <button
                id="aba-alertas"
                type="button"
                role="tab"
                aria-selected={aba === 'alertas'}
                aria-controls="painel-alertas"
                tabIndex={aba === 'alertas' ? 0 : -1}
                className={estilos.aba}
                onClick={() => setAba('alertas')}
              >
                <ListBullets weight="fill" size={16} aria-hidden="true" />
                Alertas
                <span className={`${estilos.contador} ${criticos ? estilos.contadorCritico : ''}`}>{textoAbertos}</span>
              </button>
              <button
                id="aba-regioes"
                type="button"
                role="tab"
                aria-selected={aba === 'regioes'}
                aria-controls="painel-regioes"
                tabIndex={aba === 'regioes' ? 0 : -1}
                className={estilos.aba}
                onClick={() => setAba('regioes')}
              >
                <SquaresFour weight="fill" size={16} aria-hidden="true" />
                Regiões
                {regioesComAtencao > 0 && <span className={`${estilos.contador} ${estilos.contadorAtencao}`}>{regioesComAtencao}</span>}
              </button>
            </div>

            <div id="painel-alertas" role="tabpanel" aria-labelledby="aba-alertas" className={estilos.painel} hidden={aba !== 'alertas'}>
              <div className={estilos.cabecalhoPainel}>
                <p>
                  {criticos > 0 ? `${textoCriticos} ${criticos === 1 && !noLimite ? 'crítico' : 'críticos'} · ` : ''}
                  {textoAbertos} {abertos === 1 ? 'aberto' : 'abertos'}{recortado && lugar ? ` em ${lugar}` : ''}
                </p>
                <Link to="/alertas">{recortado ? 'Ver todos da cidade' : 'Ver todos'}</Link>
              </div>
              <FeedAlertas
                alertas={alertas.data}
                carregando={alertas.isPending}
                nomeDoBairro={nomeDoBairro}
                onSelecionar={focarAlerta}
                onNovos={aoChegarAlertas}
                onNovoCritico={aoChegarCritico}
                focoId={injetadoId}
              />
            </div>
            <div id="painel-regioes" role="tabpanel" aria-labelledby="aba-regioes" className={estilos.painel} hidden={aba !== 'regioes'}>
              <PainelRegioes regioes={regioes.data} carregando={regioes.isPending} onFocarBairro={focarBairro} recorte={recortado ? lugar || undefined : undefined} />
            </div>
          </div>
        </aside>
      </div>

    </div>
  );
}
