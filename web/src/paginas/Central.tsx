// Central de Operações: a primeira tela. Faixa de 6 indicadores ao vivo, mapa de Marília (equipamentos agrupados,
// agentes andando, bairros pintados pelo índice de atenção, calor das ocorrências), filtros que valem para o mapa e
// para os números, feed de alertas e painel de regiões ao lado, ficha lateral do marcador e os controles da
// demonstração. Abaixo de 1100 px a coluna da direita vira gaveta.
//
// Fluxo dos dados: tudo vem do cache do TanStack Query, mantido vivo pelo SSE (useStream). O mapa consulta as
// próprias posições (só ele re-renderiza a cada 2 s); esta página só re-renderiza com indicadores, alertas e regiões.
import { Faders, ListBullets, SquaresFour, WarningDiamond } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  COR_CRITICIDADE, COR_SITUACAO, ORGAOS, REGIOES, ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO,
} from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import type { Alerta } from '../../../shared/modelos';
import { filtrosCentralSchema, type FiltrosCentral } from '../../../shared/schemas';
import { TIPOS_EQUIPAMENTO } from '../../../shared/tipos-equipamento';
import { chaves, limparFiltros, useAlertas, useBairros, useIndicadores, useRegioes } from '../api/consultas';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/BarraFiltros';
import { ControlesSimulacao } from '../componentes/ControlesSimulacao';
import { FaixaIndicadores } from '../componentes/FaixaIndicadores';
import { FeedAlertas } from '../componentes/FeedAlertas';
import { FichaLateral } from '../componentes/FichaLateral';
import { rotuloCurtoDoTipo } from '../componentes/IconeTipo';
import { MapaOperacional, type CamadasVisiveis, type ControleMapa, type SelecaoMapa } from '../componentes/MapaOperacional';
import { Notificacao, type DadosNotificacao } from '../componentes/Notificacao';
import { PainelRegioes } from '../componentes/PainelRegioes';
import estilos from './Central.module.css';

// ------------------------------------------------------------------------------------------------ filtros na URL

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
function useTelaEstreita(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(CONSULTA_ESTREITA);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(CONSULTA_ESTREITA).matches,
    () => false,
  );
}

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
  const alertas = useAlertas({ status: 'abertos' });
  const regioes = useRegioes();
  const bairros = useBairros();

  const [camadas, setCamadas] = useState<CamadasVisiveis>(lerCamadas);
  const [selecao, setSelecao] = useState<SelecaoMapa | null>(null);
  const [aba, setAba] = useState<Aba>('alertas');
  const [filtrosAbertos, setFiltrosAbertos] = useState(filtrado);
  const [colunaAberta, setColunaAberta] = useState(false);
  const [notificacao, setNotificacao] = useState<DadosNotificacao | null>(null);
  const [injetadoId, setInjetadoId] = useState<number>();
  const estreita = useTelaEstreita();
  const controle = useRef<ControleMapa>(null);

  const nomesBairros = useMemo(() => new Map((bairros.data ?? []).map((b) => [b.id, b.nome])), [bairros.data]);
  const nomeDoBairro = useCallback((id: number) => nomesBairros.get(id), [nomesBairros]);

  // ---- regiões relidas quando os alertas mudam (o primeiro carregamento já veio junto)
  const primeiraLeitura = useRef(true);
  const ultimaRegioes = useRef(Date.now());
  const relerRegioes = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!alertas.data) return;
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
  }, [alertas.data, qc]);
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
      { tipo: 'pilulas', chave: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s], cor: COR_SITUACAO[s] })) },
      { tipo: 'selecao', chave: 'tipo', rotulo: 'Tipo', rotuloTodos: 'Todos', opcoes: TIPOS_EQUIPAMENTO.map((t) => ({ valor: t.id, rotulo: rotuloCurtoDoTipo(t.id) })) },
      { tipo: 'selecao', chave: 'regiao', rotulo: 'Região', rotuloTodos: 'Todas', opcoes: REGIOES.map((r) => ({ valor: r, rotulo: r })) },
      { tipo: 'selecao', chave: 'bairroId', rotulo: 'Bairro', rotuloTodos: 'Todos', opcoes: listaBairros.map((b) => ({ valor: String(b.id), rotulo: b.nome })) },
      { tipo: 'selecao', chave: 'orgao', rotulo: 'Órgão', rotuloTodos: 'Todos', opcoes: ORGAOS.map((o) => ({ valor: o, rotulo: o })) },
      {
        tipo: 'selecao', chave: 'manutencao', rotulo: 'Manutenção', rotuloTodos: 'Qualquer',
        opcoes: [{ valor: 'imediata', rotulo: 'Imediata' }, { valor: 'proxima', rotulo: 'Próximos 7 dias' }, { valor: 'atrasada', rotulo: 'Atrasada' }],
      },
    ];
  }, [bairros.data, filtros.regiao]);

  const valores: Record<string, ValorFiltro> = {
    situacao: filtros.situacao,
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
  const regioesComAtencao = regioes.data?.filter((r) => r.nivel !== 'normal').length ?? 0;
  const colunaVisivel = !estreita || colunaAberta;

  return (
    <div className={estilos.central}>
      <h1 className="so-leitor">Central de Operações</h1>
      <FaixaIndicadores indicadores={indicadores.data} filtrado={filtrado} />

      <div className={estilos.corpo}>
        <section className={estilos.areaMapa} aria-label="Mapa e filtros">
          <div className={estilos.ferramentas}>
            <button
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
            <div id="filtros-central" className={estilos.filtros}>
              <BarraFiltros filtros={definicoes} valores={valores} onChange={mudarFiltro} onLimpar={() => setParams({}, { replace: true })} />
            </div>
          )}

          <div className={estilos.moldura}>
            <MapaOperacional
              ref={controle}
              filtros={filtros}
              camadas={camadas}
              selecao={selecao}
              onSelecionar={aoSelecionarMarcador}
              alertasAbertos={alertas.data}
              regioes={regioes.data}
              bairros={bairros.data}
            />
            <ControlesSimulacao onInjetado={(_tipo, novos) => {
              const comLugar = novos.find((a) => a.lat !== undefined && a.lng !== undefined) ?? novos[0];
              if (!comLugar) return;
              focarAlerta(comLugar);
              setInjetadoId(comLugar.id);
              setAba('alertas');
              setSelecao(null);
            }}
            />
            <Notificacao notificacao={notificacao} onFechar={fecharNotificacao} posicao="canto-pai" />
            {estreita && (
              <button type="button" className={estilos.abrirColuna} onClick={() => setColunaAberta(true)} aria-haspopup="dialog">
                <WarningDiamond weight="fill" size={16} aria-hidden="true" />
                Alertas e regiões
                <span className={`${estilos.contador} ${criticos ? estilos.contadorCritico : ''}`}>{formatarNumero(abertos)}</span>
              </button>
            )}
          </div>
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
                <span className={`${estilos.contador} ${criticos ? estilos.contadorCritico : ''}`}>{formatarNumero(abertos)}</span>
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
                  {criticos > 0 ? `${formatarNumero(criticos)} ${criticos === 1 ? 'crítico' : 'críticos'} · ` : ''}
                  {formatarNumero(abertos)} {abertos === 1 ? 'aberto' : 'abertos'}
                </p>
                <Link to="/alertas">Ver todos</Link>
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
              <PainelRegioes regioes={regioes.data} carregando={regioes.isPending} onFocarBairro={focarBairro} />
            </div>
          </div>
        </aside>
      </div>

    </div>
  );
}
