// Inventário de equipamentos: busca (espera 300 ms), filtros na URL, paginação e acesso à ficha.
import { Plus, TrafficCone } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ORGAOS, REGIOES, ROTULO_SITUACAO, SITUACOES_EQUIPAMENTO, COR_SITUACAO } from '../../../shared/dominio';
import { formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Equipamento } from '../../../shared/modelos';
import type { FiltrosEquipamento } from '../../../shared/schemas';
import { TIPOS_EQUIPAMENTO } from '../../../shared/tipos-equipamento';
import { useBairros, useEquipamentos } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/BarraFiltros';
import { classeBotao } from '../componentes/Botao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacao } from '../componentes/EtiquetaSituacao';
import { IconeTipo } from '../componentes/IconeTipo';
import { Tabela, type Coluna } from '../componentes/Tabela';
import { formatarDia, hojeIso } from '../util/datas';
import { useAtraso } from '../util/useAtraso';
import { useFiltrosUrl } from '../util/useFiltrosUrl';
import estilos from './Lista.module.css';
import { usePode } from '../sessao/Sessao';

const POR_PAGINA = 25;
const CHAVES_FILTRO = ['tipo', 'situacao', 'bairroId', 'regiao', 'orgao', 'manutencao'] as const;

export default function Equipamentos() {
  const podeCadastrar = usePode('cadastrar');
  const navegar = useNavigate();
  const url = useFiltrosUrl();
  const bairros = useBairros();

  // Busca: o texto aparece na hora; a URL (e a consulta) só mudam 300 ms depois da última tecla.
  const [texto, setTexto] = useState(url.ler('busca') ?? '');
  const textoEsperado = useAtraso(texto, 300);
  useEffect(() => {
    if (textoEsperado.trim() !== (url.ler('busca') ?? '')) url.mudar('busca', textoEsperado.trim() || undefined);
    // `url.mudar` é estável; `url.ler` lê a URL no momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoEsperado]);

  const pagina = Math.max(1, Number(url.ler('pagina')) || 1);
  const filtros = {
    busca: url.ler('busca'),
    tipo: url.ler('tipo'),
    situacao: url.ler('situacao'),
    bairroId: url.ler('bairroId') ? Number(url.ler('bairroId')) : undefined,
    regiao: url.ler('regiao'),
    orgao: url.ler('orgao'),
    manutencao: url.ler('manutencao'),
    pagina,
    porPagina: POR_PAGINA,
  } as Partial<FiltrosEquipamento>;
  const lista = useEquipamentos(filtros);

  const definicoes = useMemo<DefinicaoFiltro[]>(() => [
    { tipo: 'selecao', chave: 'tipo', rotulo: 'Tipo', rotuloTodos: 'Todos os tipos', opcoes: TIPOS_EQUIPAMENTO.map((t) => ({ valor: t.id, rotulo: t.rotulo })) },
    { tipo: 'selecao', chave: 'situacao', rotulo: 'Situação', rotuloTodos: 'Todas', opcoes: SITUACOES_EQUIPAMENTO.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s], cor: COR_SITUACAO[s] })) },
    { tipo: 'selecao', chave: 'regiao', rotulo: 'Região', rotuloTodos: 'Todas', opcoes: REGIOES.map((r) => ({ valor: r, rotulo: r })) },
    {
      tipo: 'selecao', chave: 'bairroId', rotulo: 'Bairro', rotuloTodos: 'Todos',
      opcoes: [...(bairros.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((b) => ({ valor: String(b.id), rotulo: b.nome })),
    },
    { tipo: 'selecao', chave: 'orgao', rotulo: 'Órgão', rotuloTodos: 'Todos', opcoes: ORGAOS.map((o) => ({ valor: o, rotulo: o })) },
    {
      tipo: 'selecao', chave: 'manutencao', rotulo: 'Manutenção', rotuloTodos: 'Qualquer',
      opcoes: [
        { valor: 'imediata', rotulo: 'Imediata' },
        { valor: 'atrasada', rotulo: 'Atrasada' },
        { valor: 'proxima', rotulo: 'Nos próximos 7 dias' },
      ],
    },
  ], [bairros.data]);

  const valores: Record<string, ValorFiltro> = Object.fromEntries(CHAVES_FILTRO.map((c) => [c, url.ler(c)]));

  const agora = new Date();
  const hoje = hojeIso(agora);
  const colunas: Coluna<Equipamento>[] = [
    {
      chave: 'codigo', titulo: 'Código', semQuebra: true,
      render: (e) => (
        <span className={estilos.duasLinhas}>
          <Link to={`/equipamentos/${e.id}`} className={estilos.codigo} onClick={(ev) => ev.stopPropagation()}>{e.codigo}</Link>
          <span className={estilos.soCelular}><IconeTipo tipo={e.tipo} rotulo="curto" tamanho={16} /></span>
        </span>
      ),
    },
    { chave: 'tipo', titulo: 'Tipo', render: (e) => <IconeTipo tipo={e.tipo} rotulo="curto" />, esconderNoCelular: true },
    { chave: 'situacao', titulo: 'Situação', render: (e) => <EtiquetaSituacao situacao={e.situacao} tamanho="compacta" /> },
    { chave: 'bairro', titulo: 'Bairro', render: (e) => e.bairroNome, esconderNoCelular: true },
    {
      chave: 'endereco', titulo: 'Logradouro e referência', esconderNoCelular: true,
      render: (e) => (
        <span className={estilos.duasLinhas}>
          <span>{e.logradouro}</span>
          {e.referencia && <span className={estilos.secundaria}>{e.referencia}</span>}
        </span>
      ),
    },
    {
      chave: 'manutencao', titulo: 'Próxima manutenção', esconderNoCelular: true, semQuebra: true,
      render: (e) => (
        <>
          {e.proximaManutencao ? formatarDia(e.proximaManutencao) : <span className={estilos.fraco}>Sem data</span>}
          {e.manutencaoNecessidade === 'imediata' && <span className={estilos.imediata}>Imediata</span>}
          {e.proximaManutencao && e.proximaManutencao.slice(0, 10) < hoje && e.situacao !== 'desativado' && e.situacao !== 'nao_instalado' && <span className={estilos.atrasada}>Atrasada</span>}
        </>
      ),
    },
    {
      chave: 'sinal', titulo: 'Último sinal', alinhar: 'direita', esconderNoCelular: true, semQuebra: true,
      render: (e) => (e.ultimoSinalEm ? formatarRelativo(e.ultimoSinalEm, agora) : <span className={estilos.fraco}>Sem sinal</span>),
    },
  ];

  const total = lista.data?.total;
  const limpar = () => {
    setTexto('');
    url.limpar();
  };

  return (
    <div className={`pagina ${estilos.pagina}`}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Equipamentos</h1>
        {total !== undefined && <p className={estilos.total}>{formatarNumero(total)} {total === 1 ? 'equipamento' : 'equipamentos'}{url.temAlgum ? ' com esses filtros' : ' cadastrados'}</p>}
        {podeCadastrar && (
          <Link to="/equipamentos/novo" className={`${classeBotao('primario')} ${estilos.novo}`}>
            <Plus weight="fill" size={18} aria-hidden="true" />
            <span>Cadastrar equipamento</span>
          </Link>
        )}
      </header>

      <BarraFiltros
        filtros={definicoes}
        valores={valores}
        onChange={(chave, valor) => url.mudar(chave, typeof valor === 'string' ? valor : undefined)}
        busca={{ valor: texto, onChange: setTexto, placeholder: 'Buscar por código, série, marca, rua…', rotulo: 'Buscar equipamentos' }}
        onLimpar={limpar}
      />

      {lista.isError ? (
        <AvisoErro erro={lista.error} titulo="Não foi possível carregar os equipamentos" onTentarDeNovo={() => void lista.refetch()} tentando={lista.isFetching} />
      ) : (
        <Tabela
          legenda="Equipamentos cadastrados"
          colunas={colunas}
          linhas={lista.data?.itens}
          chaveLinha={(e) => e.id}
          carregando={lista.isPending}
          onLinha={(e) => navegar(`/equipamentos/${e.id}`)}
          vazio={(
            <EstadoVazio
              icone={<TrafficCone weight="fill" />}
              titulo="Nenhum equipamento encontrado"
              descricao={url.temAlgum || texto ? 'Nenhum equipamento combina com a busca e os filtros. Tente tirar algum filtro.' : 'Ainda não há equipamentos cadastrados.'}
            />
          )}
          paginacao={total !== undefined ? { pagina, porPagina: POR_PAGINA, total, onMudar: (p) => url.mudar('pagina', p > 1 ? String(p) : undefined) } : undefined}
        />
      )}
    </div>
  );
}
