// Tela de Alertas: tabela filtrável (criticidade, tipo, status) que se atualiza sozinha pelo tempo real, com
// Reconhecer, Resolver e "Ver no mapa" (abre a Central focada no alerta).
import { CaretLeft, CaretRight, Crosshair, MapPin } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  COR_CRITICIDADE, CRITICIDADES, ROTULO_CRITICIDADE, ROTULO_TIPO_ALERTA, TIPOS_ALERTA, type Criticidade,
} from '../../../shared/dominio';
import { formatarDataHora, formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Alerta } from '../../../shared/modelos';
import { mensagemDeErro } from '../api/cliente';
import { useAlertas, useBairros, useReconhecerAlerta, useResolverAlerta, type FiltrosAlertas } from '../api/consultas';
import { AvisoErro } from '../componentes/base/AvisoErro';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/base/BarraFiltros';
import { Botao } from '../componentes/base/Botao';
import { EtiquetaCriticidade, ordenarAlertas, TipoAlerta } from '../componentes/etiquetas/EtiquetaAlerta';
import { Tabela, type Coluna } from '../componentes/base/Tabela';
import { useOrdemSemPular } from '../util/ordemEstavel';
import { useAgora } from '../util/useAgora';
import { useConsulta } from '../util/useConsulta';
import { useFiltrosUrl } from '../util/useFiltrosUrl';
import lista from './Lista.module.css';
import estilos from './Alertas.module.css';
import { usePode } from '../sessao/Sessao';

const POR_PAGINA = 25;
/** Mesmo corte do restante do app: no celular a tabela vira lista de cartões e as ações ficam à vista. */
const CONSULTA_CELULAR = '(max-width: 720px)';

const DEFINICOES: DefinicaoFiltro[] = [
  { tipo: 'pilulas', chave: 'criticidade', rotulo: 'Criticidade', opcoes: CRITICIDADES.map((c) => ({ valor: c, rotulo: ROTULO_CRITICIDADE[c], cor: COR_CRITICIDADE[c] })) },
  { tipo: 'selecao', chave: 'tipo', rotulo: 'Tipo', rotuloTodos: 'Todos', opcoes: TIPOS_ALERTA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_ALERTA[t] })) },
  { tipo: 'selecao', chave: 'status', rotulo: 'Mostrar', rotuloTodos: 'Abertos', opcoes: [{ valor: 'todos', rotulo: 'Todos, inclusive resolvidos' }] },
];

function situacaoDoAlerta(a: Alerta): { rotulo: string; classe: string } {
  if (a.resolvidoEm) return { rotulo: 'Resolvido', classe: 'resolvido' };
  if (a.reconhecidoEm) return { rotulo: 'Reconhecido', classe: 'reconhecido' };
  return { rotulo: 'Aberto', classe: 'aberto' };
}

export default function Alertas() {
  const { ler, mudar, limpar } = useFiltrosUrl();
  const navegar = useNavigate();
  const agora = useAgora(30_000);
  const bairros = useBairros();
  const reconhecer = useReconhecerAlerta();
  const resolver = useResolverAlerta();
  const podeOperar = usePode('operar');
  const celular = useConsulta(CONSULTA_CELULAR);

  const criticidade = ler('criticidade') as Criticidade | undefined;
  const filtros: FiltrosAlertas = {
    status: ler('status') === 'todos' ? 'todos' : 'abertos',
    ...(criticidade && CRITICIDADES.includes(criticidade) ? { criticidade } : {}),
    ...(ler('tipo') ? { tipo: ler('tipo') } : {}),
    limite: 200,
  };
  const consulta = useAlertas(filtros);
  const pagina = Math.max(1, Number(ler('pagina') ?? 1) || 1);

  const nomes = useMemo(() => new Map((bairros.data ?? []).map((b) => [b.id, b.nome])), [bairros.data]);
  // Reconhecer não muda o lugar do alerta (o clique seguinte no mesmo ponto não pode atingir outro).
  const ordenados = useOrdemSemPular(consulta.data, ordenarAlertas);
  const linhas = ordenados?.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const criticos = consulta.data?.filter((a) => a.criticidade === 'critica' && !a.resolvidoEm).length ?? 0;

  const valores: Record<string, ValorFiltro> = {
    criticidade: criticidade ? [criticidade] : undefined,
    tipo: ler('tipo'),
    status: ler('status'),
  };
  // A API filtra uma criticidade por vez: escolher outra pílula troca a escolha.
  const aoMudar = (chave: string, valor: ValorFiltro) => {
    if (chave === 'criticidade' && Array.isArray(valor)) mudar(chave, valor.at(-1));
    else mudar(chave, Array.isArray(valor) ? valor.join(',') : valor);
  };

  const ocupado = (id: number) => (reconhecer.isPending && reconhecer.variables === id) || (resolver.isPending && resolver.variables === id);

  const botoesDeAcao = (a: Alerta) => (
    <span className={estilos.acoes}>
      {podeOperar && !a.resolvidoEm && !a.reconhecidoEm && (
        <Botao tamanho="pequeno" disabled={ocupado(a.id)} onClick={() => reconhecer.mutate(a.id)}>Reconhecer</Botao>
      )}
      {podeOperar && !a.resolvidoEm && (
        <Botao tamanho="pequeno" disabled={ocupado(a.id)} onClick={() => resolver.mutate(a.id)}>Resolver</Botao>
      )}
      {a.lat !== undefined && a.lng !== undefined && (
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          icone={<Crosshair weight="fill" size={14} aria-hidden="true" />}
          onClick={() => navegar('/', { state: { focoAlerta: a } })}
        >
          Ver no mapa
        </Botao>
      )}
    </span>
  );

  const colunas: Coluna<Alerta>[] = [
    { chave: 'criticidade', titulo: 'Criticidade', render: (a) => <EtiquetaCriticidade criticidade={a.criticidade} />, semQuebra: true, largura: '108px' },
    {
      chave: 'alerta', titulo: 'Alerta',
      render: (a) => (
        <span className={lista.duasLinhas}>
          <span className={estilos.tipo}><TipoAlerta tipo={a.tipo} tamanho={14} /></span>
          <strong>{a.titulo}</strong>
          <span className={`${lista.secundaria} ${estilos.descricao}`}>{a.descricao}</span>
        </span>
      ),
    },
    { chave: 'bairro', titulo: 'Bairro', render: (a) => (a.bairroId !== undefined ? nomes.get(a.bairroId) ?? '—' : '—'), esconderNoCelular: true },
    {
      chave: 'quando', titulo: 'Criado', semQuebra: true, esconderNoCelular: true,
      render: (a) => (
        <span className={lista.duasLinhas}>
          <span>{formatarRelativo(a.criadoEm, agora)}</span>
          <span className={lista.secundaria}>{formatarDataHora(a.criadoEm)}</span>
        </span>
      ),
    },
    {
      chave: 'situacao', titulo: 'Situação', semQuebra: true,
      render: (a) => {
        const s = situacaoDoAlerta(a);
        return <span className={`${estilos.situacao} ${estilos[s.classe]}`}>{s.rotulo}</span>;
      },
    },
    {
      chave: 'acoes', titulo: 'Ações', alinhar: 'direita', semQuebra: true,
      render: botoesDeAcao,
    },
  ];

  const total = consulta.data?.length ?? 0;
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));
  const erroAcao = reconhecer.error ?? resolver.error;

  return (
    <div className={`pagina ${lista.pagina}`}>
      <header className={lista.cabecalho}>
        <h1 className={lista.titulo}>Alertas</h1>
        {consulta.data && (
          <p className={lista.total}>
            {formatarNumero(total)} {filtros.status === 'todos' ? (total === 1 ? 'alerta' : 'alertas') : total === 1 ? 'aberto' : 'abertos'}
            {criticos > 0 && `, ${formatarNumero(criticos)} ${criticos === 1 ? 'crítico' : 'críticos'}`}
            {total >= 200 && ' (os 200 mais recentes)'}
          </p>
        )}
      </header>

      <BarraFiltros filtros={DEFINICOES} valores={valores} onChange={aoMudar} onLimpar={limpar} />

      {erroAcao && <p className={estilos.erro} role="alert">Não foi possível atualizar o alerta: {mensagemDeErro(erroAcao)}</p>}
      {consulta.isError && !consulta.data ? (
        <AvisoErro erro={consulta.error} titulo="Não foi possível carregar os alertas" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} />
      ) : celular ? (
        <>
          <ul className={estilos.cartoes} aria-label="Alertas, críticos primeiro" aria-busy={consulta.isPending || undefined}>
            {linhas?.map((a) => {
              const sit = situacaoDoAlerta(a);
              const bairro = a.bairroId !== undefined ? nomes.get(a.bairroId) : undefined;
              return (
                <li key={a.id} className={`${estilos.cartao} ${estilos[`cartao_${a.criticidade}`]}`} data-id={a.id}>
                  <div className={estilos.cartaoTopo}>
                    <EtiquetaCriticidade criticidade={a.criticidade} />
                    <span className={estilos.tipo}><TipoAlerta tipo={a.tipo} tamanho={14} /></span>
                    <span className={`${estilos.situacao} ${estilos[sit.classe]}`}>{sit.rotulo}</span>
                  </div>
                  <strong>{a.titulo}</strong>
                  <p className={`${lista.secundaria} ${estilos.descricao}`}>{a.descricao}</p>
                  <p className={`${lista.secundaria} ${estilos.cartaoLocal}`}>
                    {bairro && <><MapPin weight="fill" size={13} aria-hidden="true" />{bairro} · </>}
                    {formatarRelativo(a.criadoEm, agora)}
                  </p>
                  {botoesDeAcao(a)}
                </li>
              );
            })}
          </ul>
          {!consulta.isPending && total === 0 && (
            <p className={estilos.cartoesVazio}>{filtros.status === 'abertos' ? 'Nenhum alerta aberto com estes filtros.' : 'Nenhum alerta com estes filtros.'}</p>
          )}
          {total > POR_PAGINA && (
            <nav className={estilos.paginas} aria-label="Paginação">
              <Botao tamanho="pequeno" icone={<CaretLeft weight="fill" size={14} aria-hidden="true" />} disabled={pagina <= 1} onClick={() => mudar('pagina', String(pagina - 1))}>Anterior</Botao>
              <span className="numeros" aria-current="page">{formatarNumero(pagina)} de {formatarNumero(ultimaPagina)}</span>
              <Botao tamanho="pequeno" disabled={pagina >= ultimaPagina} onClick={() => mudar('pagina', String(pagina + 1))}>
                Próxima <CaretRight weight="fill" size={14} aria-hidden="true" />
              </Botao>
            </nav>
          )}
        </>
      ) : (
        <Tabela
          colunas={colunas}
          linhas={linhas}
          chaveLinha={(a) => a.id}
          legenda="Alertas, críticos primeiro"
          carregando={consulta.isPending}
          vazio={filtros.status === 'abertos' ? 'Nenhum alerta aberto com estes filtros. Quando algo acontecer na cidade, ele aparece aqui na hora.' : 'Nenhum alerta com estes filtros.'}
          paginacao={{ pagina, porPagina: POR_PAGINA, total, onMudar: (p) => mudar('pagina', String(p)) }}
        />
      )}
    </div>
  );
}
