// Lista de agentes (trânsito, guarda municipal, policial militar): busca, filtros na URL e paginação.
import { IdentificationBadge, Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CATEGORIAS_AGENTE, COR_SITUACAO_AGENTE, ORGAOS, REGIOES, ROTULO_CATEGORIA_AGENTE, ROTULO_SITUACAO_AGENTE, ROTULO_TURNO, SITUACOES_AGENTE, TURNOS,
} from '../../../shared/dominio';
import { formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Agente } from '../../../shared/modelos';
import type { FiltrosAgente } from '../../../shared/schemas';
import { useAgentes, useBairros } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/BarraFiltros';
import { classeBotao } from '../componentes/Botao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacaoAgente } from '../componentes/EtiquetaSituacaoAgente';
import { Tabela, type Coluna } from '../componentes/Tabela';
import { useAtraso } from '../util/useAtraso';
import { useFiltrosUrl } from '../util/useFiltrosUrl';
import estilos from './Lista.module.css';

const POR_PAGINA = 25;
const CHAVES_FILTRO = ['categoria', 'situacao', 'turno', 'regiao', 'bairroId', 'orgao'] as const;

export default function Agentes() {
  const navegar = useNavigate();
  const url = useFiltrosUrl();
  const bairros = useBairros();

  const [texto, setTexto] = useState(url.ler('busca') ?? '');
  const textoEsperado = useAtraso(texto, 300);
  useEffect(() => {
    if (textoEsperado.trim() !== (url.ler('busca') ?? '')) url.mudar('busca', textoEsperado.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoEsperado]);

  const pagina = Math.max(1, Number(url.ler('pagina')) || 1);
  const lista = useAgentes({
    busca: url.ler('busca'),
    categoria: url.ler('categoria'),
    situacao: url.ler('situacao'),
    turno: url.ler('turno'),
    regiao: url.ler('regiao'),
    bairroId: url.ler('bairroId') ? Number(url.ler('bairroId')) : undefined,
    orgao: url.ler('orgao'),
    pagina,
    porPagina: POR_PAGINA,
  } as Partial<FiltrosAgente>);

  const definicoes = useMemo<DefinicaoFiltro[]>(() => [
    { tipo: 'selecao', chave: 'categoria', rotulo: 'Categoria', rotuloTodos: 'Todas', opcoes: CATEGORIAS_AGENTE.map((c) => ({ valor: c, rotulo: ROTULO_CATEGORIA_AGENTE[c] })) },
    { tipo: 'selecao', chave: 'situacao', rotulo: 'Situação', rotuloTodos: 'Todas', opcoes: SITUACOES_AGENTE.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO_AGENTE[s], cor: COR_SITUACAO_AGENTE[s] })) },
    { tipo: 'selecao', chave: 'turno', rotulo: 'Turno', rotuloTodos: 'Todos', opcoes: TURNOS.map((t) => ({ valor: t, rotulo: ROTULO_TURNO[t] })) },
    { tipo: 'selecao', chave: 'regiao', rotulo: 'Região', rotuloTodos: 'Todas', opcoes: REGIOES.map((r) => ({ valor: r, rotulo: r })) },
    {
      tipo: 'selecao', chave: 'bairroId', rotulo: 'Bairro da base', rotuloTodos: 'Todos',
      opcoes: [...(bairros.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => ({ valor: String(b.id), rotulo: b.nome })),
    },
    { tipo: 'selecao', chave: 'orgao', rotulo: 'Órgão', rotuloTodos: 'Todos', opcoes: ORGAOS.map((o) => ({ valor: o, rotulo: o })) },
  ], [bairros.data]);
  const valores: Record<string, ValorFiltro> = Object.fromEntries(CHAVES_FILTRO.map((c) => [c, url.ler(c)]));

  const agora = new Date();
  const colunas: Coluna<Agente>[] = [
    {
      chave: 'nome', titulo: 'Agente',
      render: (a) => (
        <span className={estilos.duasLinhas}>
          <Link to={`/agentes/${a.id}`} className={estilos.codigo} onClick={(ev) => ev.stopPropagation()}>{a.nome}</Link>
          <span className={estilos.secundaria}>Matrícula {a.matricula}</span>
        </span>
      ),
    },
    { chave: 'categoria', titulo: 'Categoria', render: (a) => ROTULO_CATEGORIA_AGENTE[a.categoria], esconderNoCelular: true },
    { chave: 'situacao', titulo: 'Situação', render: (a) => <EtiquetaSituacaoAgente situacao={a.situacao} tamanho="compacta" /> },
    { chave: 'turno', titulo: 'Turno', render: (a) => ROTULO_TURNO[a.turno], esconderNoCelular: true },
    {
      chave: 'base', titulo: 'Base', esconderNoCelular: true,
      render: (a) => (
        <span className={estilos.duasLinhas}>
          <span>{a.baseBairroNome}</span>
          <span className={estilos.secundaria}>{a.baseLogradouro}</span>
        </span>
      ),
    },
    { chave: 'orgao', titulo: 'Órgão', render: (a) => a.orgao, esconderNoCelular: true },
    {
      chave: 'sinal', titulo: 'Último sinal', alinhar: 'direita', esconderNoCelular: true, semQuebra: true,
      render: (a) => (a.ultimoSinalEm ? formatarRelativo(a.ultimoSinalEm, agora) : <span className={estilos.fraco}>Sem sinal</span>),
    },
  ];

  const total = lista.data?.total;
  return (
    <div className={`pagina ${estilos.pagina}`}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Agentes</h1>
        {total !== undefined && <p className={estilos.total}>{formatarNumero(total)} {total === 1 ? 'agente' : 'agentes'}{url.temAlgum ? ' com esses filtros' : ' cadastrados'}</p>}
        <Link to="/agentes/novo" className={`${classeBotao('primario')} ${estilos.novo}`}>
          <Plus weight="fill" size={18} aria-hidden="true" />
          <span>Cadastrar agente</span>
        </Link>
      </header>

      <BarraFiltros
        filtros={definicoes}
        valores={valores}
        onChange={(chave, valor) => url.mudar(chave, typeof valor === 'string' ? valor : undefined)}
        busca={{ valor: texto, onChange: setTexto, placeholder: 'Buscar por nome ou matrícula…', rotulo: 'Buscar agentes' }}
        onLimpar={() => { setTexto(''); url.limpar(); }}
      />

      {lista.isError ? (
        <AvisoErro erro={lista.error} titulo="Não foi possível carregar os agentes" onTentarDeNovo={() => void lista.refetch()} tentando={lista.isFetching} />
      ) : (
        <Tabela
          legenda="Agentes cadastrados"
          colunas={colunas}
          linhas={lista.data?.itens}
          chaveLinha={(a) => a.id}
          carregando={lista.isPending}
          onLinha={(a) => navegar(`/agentes/${a.id}`)}
          vazio={<EstadoVazio icone={<IdentificationBadge weight="fill" />} titulo="Nenhum agente encontrado" descricao={url.temAlgum || texto ? 'Nenhum agente combina com a busca e os filtros. Tente tirar algum filtro.' : 'Ainda não há agentes cadastrados.'} />}
          paginacao={total !== undefined ? { pagina, porPagina: POR_PAGINA, total, onMudar: (p) => url.mudar('pagina', p > 1 ? String(p) : undefined) } : undefined}
        />
      )}
    </div>
  );
}
