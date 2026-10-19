// Trilha de auditoria (só gestor): quem fez o quê, quando e de onde, com o antes e o depois de cada registro.
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatarDataHora, formatarNumero } from '../../../shared/formato';
import { ROTULO_PAPEL, type RegistroAuditoria } from '../../../shared/seguranca';
import { api } from '../api/cliente';
import { AvisoErro } from '../componentes/AvisoErro';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { Tabela, type Coluna } from '../componentes/Tabela';
import estilos from './Lista.module.css';
import proprios from './Auditoria.module.css';

const POR_PAGINA = 50;

interface PaginaAuditoria {
  itens: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Só os campos que mudaram entre antes e depois (ex.: "situacao: operacional → furtado"). */
function mudancas(r: RegistroAuditoria): string[] {
  if (!r.antes || !r.depois || typeof r.antes !== 'object' || typeof r.depois !== 'object') return [];
  const antes = r.antes as Record<string, unknown>;
  const depois = r.depois as Record<string, unknown>;
  return Object.keys(depois)
    .filter((c) => c !== 'atualizado_em' && JSON.stringify(antes[c]) !== JSON.stringify(depois[c]))
    .map((c) => `${c}: ${String(antes[c] ?? '—')} → ${String(depois[c] ?? '—')}`);
}

export default function Auditoria() {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    queryKey: ['auditoria', pagina],
    queryFn: () => api.get<PaginaAuditoria>('/api/auditoria', { pagina, porPagina: POR_PAGINA }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const colunas: Coluna<RegistroAuditoria>[] = [
    { chave: 'em', titulo: 'Quando', semQuebra: true, render: (r) => formatarDataHora(r.em) },
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
        const lista = mudancas(r);
        return (
          <span className={proprios.duasLinhas}>
            <span>{r.acao}{r.entidadeId ? ` #${r.entidadeId}` : ''}</span>
            {lista.length > 0 && <span className={proprios.fraco}>{lista.slice(0, 3).join(' · ')}{lista.length > 3 ? ` · +${lista.length - 3}` : ''}</span>}
          </span>
        );
      },
    },
    {
      chave: 'resultado', titulo: 'Resultado', semQuebra: true,
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
          paginacao={total !== undefined ? { pagina, porPagina: POR_PAGINA, total, onMudar: setPagina } : undefined}
        />
      )}
    </div>
  );
}
