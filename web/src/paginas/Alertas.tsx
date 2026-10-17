// Tela de Alertas: tabela filtrável (criticidade, tipo, status) que se atualiza sozinha pelo tempo real, com
// Reconhecer, Resolver e "Ver no mapa" (abre a Central focada no alerta).
import { Crosshair } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  COR_CRITICIDADE, CRITICIDADES, ROTULO_CRITICIDADE, ROTULO_TIPO_ALERTA, TIPOS_ALERTA, type Criticidade,
} from '../../../shared/dominio';
import { formatarDataHora, formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Alerta } from '../../../shared/modelos';
import { mensagemDeErro } from '../api/cliente';
import { useAlertas, useBairros, useReconhecerAlerta, useResolverAlerta, type FiltrosAlertas } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/BarraFiltros';
import { Botao } from '../componentes/Botao';
import { EtiquetaCriticidade, ordenarAlertas, TipoAlerta } from '../componentes/EtiquetaAlerta';
import { Tabela, type Coluna } from '../componentes/Tabela';
import { useAgora } from '../util/useAgora';
import { useFiltrosUrl } from '../util/useFiltrosUrl';
import lista from './Lista.module.css';
import estilos from './Alertas.module.css';

const POR_PAGINA = 25;

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
  const ordenados = useMemo(() => (consulta.data ? ordenarAlertas(consulta.data) : undefined), [consulta.data]);
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
      render: (a) => (
        <span className={estilos.acoes}>
          {!a.resolvidoEm && !a.reconhecidoEm && (
            <Botao tamanho="pequeno" disabled={ocupado(a.id)} onClick={() => reconhecer.mutate(a.id)}>Reconhecer</Botao>
          )}
          {!a.resolvidoEm && (
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
      ),
    },
  ];

  const total = consulta.data?.length ?? 0;
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
