// Trilha de auditoria (só gestor): quem fez o quê, quando e de onde, com o antes e o depois de cada registro.
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { formatarDataHora, formatarNumero } from '../../../shared/formato';
import { ROTULO_PAPEL, type RegistroAuditoria } from '../../../shared/seguranca';
import { api } from '../api/cliente';
import { useBairros } from '../api/consultas';
import { AvisoErro } from '../componentes/base/AvisoErro';
import { EstadoVazio } from '../componentes/base/EstadoVazio';
import { BarraFiltros, type DefinicaoFiltro, type ValorFiltro } from '../componentes/base/BarraFiltros';
import { Tabela, type Coluna } from '../componentes/base/Tabela';
import { ENTIDADES_AUDITORIA, mudancasLegiveis } from '../util/auditoria';
import { useAtraso } from '../util/useAtraso';
import { useFiltrosUrl } from '../util/useFiltrosUrl';
import estilos from './Lista.module.css';
import proprios from './Auditoria.module.css';

const POR_PAGINA = 50;

interface PaginaAuditoria {
  itens: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

const DEFINICOES: DefinicaoFiltro[] = [
  { tipo: 'selecao', chave: 'entidade', rotulo: 'O que mudou', rotuloTodos: 'Tudo', opcoes: ENTIDADES_AUDITORIA.map((e) => ({ valor: e.valor, rotulo: e.rotulo })) },
];

export default function Auditoria() {
  const { ler, mudar, limpar } = useFiltrosUrl();
  const bairros = useBairros();
  const nomesBairros = useMemo(() => new Map((bairros.data ?? []).map((b) => [b.id, b.nome])), [bairros.data]);
  const pagina = Math.max(1, Number(ler('pagina') ?? 1) || 1);
  const entidade = ler('entidade');
  // O login é digitado: a consulta só sai depois de uma pausa na digitação. A API compara o login inteiro (sem diferenciar maiúsculas).
  const [digitado, setDigitado] = useState(ler('login') ?? '');
  const atrasado = useAtraso(digitado.trim(), 400);
  const loginUrl = ler('login');
  // Passa para a URL (e volta à página 1) só quando a digitação assentou.
  useEffect(() => {
    if (atrasado === digitado.trim() && atrasado !== (loginUrl ?? '')) mudar('login', atrasado || undefined);
  }, [atrasado, digitado, loginUrl, mudar]);
  const loginAplicado = loginUrl;
  const consulta = useQuery({
    queryKey: ['auditoria', pagina, entidade ?? '', loginAplicado ?? ''],
    queryFn: () => api.get<PaginaAuditoria>('/api/auditoria', { pagina, porPagina: POR_PAGINA, ...(entidade ? { entidade } : {}), ...(loginAplicado ? { login: loginAplicado } : {}) }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const colunas: Coluna<RegistroAuditoria>[] = [
    {
      // Data e hora em duas linhas: numa só a coluna ocupava 130 px e empurrava o resultado para fora da tela do celular.
      chave: 'em', titulo: 'Quando',
      render: (r) => {
        const [data, ...hora] = formatarDataHora(r.em).split(' ');
        return (
          <span className={proprios.duasLinhas}>
            <span className={proprios.semQuebra}>{data}</span>
            <span className={proprios.fraco}>{hora.join(' ')}</span>
          </span>
        );
      },
    },
    {
      chave: 'quem', titulo: 'Quem',
      render: (r) => (
        <span className={proprios.duasLinhas}>
          <span>{r.login ?? 'sem login'}</span>
          {r.papel && <span className={proprios.fraco}>{ROTULO_PAPEL[r.papel]}</span>}
        </span>
      ),
    },
    {
      chave: 'acao', titulo: 'Ação',
      render: (r) => {
        const lista = mudancasLegiveis(r, nomesBairros).map((m) => `${m.campo}: ${m.de} → ${m.para}`);
        return (
          <span className={proprios.duasLinhas}>
            <span>{r.acao}{r.entidadeId ? ` #${r.entidadeId}` : ''}</span>
            <span className={`${proprios.soNoCelular} ${r.status >= 400 ? proprios.recusada : proprios.ok}`}>{r.status >= 400 ? `Recusada (${r.status})` : 'Feita'}</span>
            {lista.length > 0 && <span className={proprios.fraco}>{lista.slice(0, 3).join(' · ')}{lista.length > 3 ? ` · +${lista.length - 3}` : ''}</span>}
          </span>
        );
      },
    },
    {
      chave: 'resultado', titulo: 'Resultado', semQuebra: true, esconderNoCelular: true,
      render: (r) => <span className={r.status >= 400 ? proprios.recusada : proprios.ok}>{r.status >= 400 ? `Recusada (${r.status})` : 'Feita'}</span>,
    },
    { chave: 'ip', titulo: 'Origem', esconderNoCelular: true, semQuebra: true, render: (r) => r.ip ?? '—' },
  ];

  const total = consulta.data?.total;
  return (
    <div className={`pagina ${estilos.pagina}`}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Auditoria</h1>
        {total !== undefined && <p className={estilos.total}>{formatarNumero(total)} {total === 1 ? 'registro' : 'registros'}</p>}
      </header>
      <p className={proprios.explicacao}>
        Toda alteração feita pela API fica aqui: quem fez, com qual perfil, de onde, e como o registro estava antes e depois.
        Tentativas recusadas por falta de permissão e entradas com senha errada também aparecem. Senhas e tokens nunca são gravados.
      </p>
      <BarraFiltros
        filtros={DEFINICOES}
        valores={{ entidade }}
        onChange={(chave, valor) => mudar(chave, Array.isArray(valor) ? valor.join(',') : valor)}
        busca={{ valor: digitado, onChange: setDigitado, placeholder: 'Login inteiro (ex.: gestor)', rotulo: 'Filtrar por login' }}
        onLimpar={() => { setDigitado(''); limpar(); }}
      />
      {consulta.isError ? (
        <AvisoErro erro={consulta.error} titulo="Não foi possível carregar a auditoria" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} />
      ) : (
        <Tabela
          legenda="Registros de auditoria"
          colunas={colunas}
          linhas={consulta.data?.itens}
          chaveLinha={(r) => r.id}
          carregando={consulta.isPending}
          vazio={<EstadoVazio icone={<ClockCounterClockwise weight="fill" />} titulo="Nada registrado ainda" descricao="As alterações feitas no sistema aparecem aqui." />}
          paginacao={total !== undefined ? { pagina, porPagina: POR_PAGINA, total, onMudar: (p) => mudar('pagina', String(p)) } : undefined}
        />
      )}
    </div>
  );
}
