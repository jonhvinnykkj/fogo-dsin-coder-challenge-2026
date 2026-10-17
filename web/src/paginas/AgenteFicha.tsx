// Ficha do agente: dados, posição atual e base no mini-mapa, situação, turno e as últimas ocorrências atendidas.
import { ArrowsClockwise, CaretLeft, PencilSimple, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Marker } from 'react-leaflet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  COR_CRITICIDADE, COR_SITUACAO_AGENTE, HORARIO_TURNO, ROTULO_CATEGORIA_AGENTE, ROTULO_TIPO_OCORRENCIA, ROTULO_TURNO, type Criticidade,
} from '../../../shared/dominio';
import { formatarDataHora, formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { AgenteDetalhe, Ocorrencia } from '../../../shared/modelos';
import { useAgente, useBairros, useEquipamento, useExcluirAgente } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao, classeBotao } from '../componentes/Botao';
import { DialogoExcluir } from '../componentes/DialogoExcluir';
import { DialogoSituacaoAgente } from '../componentes/DialogoSituacaoAgente';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacaoAgente } from '../componentes/EtiquetaSituacaoAgente';
import { ListaDados } from '../componentes/ListaDados';
import { MapaBase } from '../componentes/MapaBase';
import { Tabela, type Coluna } from '../componentes/Tabela';
import { corDoTexto } from '../estilo/contraste';
import { iconeBloco } from '../mapa/marcadores';
import estilos from './Ficha.module.css';

const GRAVIDADE: Record<Ocorrencia['gravidade'], { rotulo: string; criticidade: Criticidade }> = {
  1: { rotulo: 'Baixa', criticidade: 'baixa' },
  2: { rotulo: 'Média', criticidade: 'media' },
  3: { rotulo: 'Alta', criticidade: 'alta' },
  4: { rotulo: 'Crítica', criticidade: 'critica' },
};

const hh = (h: number) => `${String(h).padStart(2, '0')}h`;

export default function AgenteFicha() {
  const { id } = useParams();
  const idNumero = Number(id);
  const valido = Number.isInteger(idNumero) && idNumero > 0;
  const consulta = useAgente(valido ? idNumero : undefined);

  if (!valido) {
    return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Agente não encontrado" descricao="O endereço não corresponde a nenhum agente cadastrado." acao={<Link to="/agentes" className={classeBotao('primario')}>Ver agentes</Link>} /></div>;
  }
  if (consulta.isPending) return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando agente…" /></div>;
  if (consulta.isError) {
    return (
      <div className="pagina">
        <AvisoErro erro={consulta.error} titulo="Não foi possível abrir o agente" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} />
        <p><Link to="/agentes">Voltar para a lista de agentes</Link></p>
      </div>
    );
  }
  return <Ficha ag={consulta.data} />;
}

function Ficha({ ag }: { ag: AgenteDetalhe }) {
  const navegar = useNavigate();
  const bairros = useBairros();
  const veiculo = useEquipamento(ag.equipamentoId);
  const excluir = useExcluirAgente();
  const [situacaoAberta, setSituacaoAberta] = useState(false);
  const [excluirAberto, setExcluirAberto] = useState(false);
  const agora = new Date();
  const nomeBairro = (id: number) => bairros.data?.find((b) => b.id === id)?.nome ?? '—';
  const turno = HORARIO_TURNO[ag.turno];
  const corSituacao = COR_SITUACAO_AGENTE[ag.situacao];

  const colunas: Coluna<Ocorrencia>[] = [
    { chave: 'tipo', titulo: 'Ocorrência', render: (o) => <strong>{ROTULO_TIPO_OCORRENCIA[o.tipo]}</strong>, semQuebra: true },
    {
      chave: 'gravidade', titulo: 'Gravidade', semQuebra: true,
      render: (o) => {
        const g = GRAVIDADE[o.gravidade];
        const cor = COR_CRITICIDADE[g.criticidade];
        return <span className={estilos.crit} style={{ background: cor, color: corDoTexto(cor) }}>{g.rotulo}</span>;
      },
    },
    { chave: 'bairro', titulo: 'Bairro', render: (o) => nomeBairro(o.bairroId), esconderNoCelular: true },
    { chave: 'inicio', titulo: 'Início', render: (o) => formatarDataHora(o.inicio), semQuebra: true },
    { chave: 'fim', titulo: 'Fim', render: (o) => (o.fim ? formatarDataHora(o.fim) : 'Em andamento'), semQuebra: true, esconderNoCelular: true },
    { chave: 'descricao', titulo: 'Descrição', render: (o) => o.descricao, esconderNoCelular: true },
  ];

  return (
    <div className={`pagina ${estilos.pagina}`}>
      <Link to="/agentes" className={estilos.voltar}>
        <CaretLeft weight="bold" size={16} aria-hidden="true" />
        Voltar para agentes
      </Link>

      <header className={estilos.cabecalho}>
        <div className={estilos.identidade}>
          <div className={estilos.linhaTitulo}>
            <h1 className={estilos.titulo}>{ag.nome}</h1>
            <EtiquetaSituacaoAgente situacao={ag.situacao} />
          </div>
          <p className={estilos.subtitulo}>
            <span>{ROTULO_CATEGORIA_AGENTE[ag.categoria]}</span>
            <span>Matrícula {ag.matricula}</span>
            <span>Turno da {ROTULO_TURNO[ag.turno].toLowerCase()}</span>
          </p>
        </div>
        <div className={estilos.acoes}>
          <Link to={`/agentes/${ag.id}/editar`} className={classeBotao('secundario')}>
            <PencilSimple weight="fill" size={18} aria-hidden="true" />
            <span>Editar</span>
          </Link>
          <Botao icone={<ArrowsClockwise weight="bold" size={18} aria-hidden="true" />} onClick={() => setSituacaoAberta(true)}>Mudar situação</Botao>
          <Botao variante="fantasma" icone={<Trash weight="fill" size={18} aria-hidden="true" />} onClick={() => { excluir.reset(); setExcluirAberto(true); }}>Excluir</Botao>
        </div>
      </header>

      <div className={estilos.corpo}>
        <div className={estilos.coluna}>
          <section className={estilos.secao} aria-labelledby="a-dados">
            <h2 id="a-dados">Dados do agente</h2>
            <ListaDados itens={[
              { rotulo: 'Matrícula', valor: ag.matricula },
              { rotulo: 'Categoria', valor: ROTULO_CATEGORIA_AGENTE[ag.categoria] },
              { rotulo: 'Órgão', valor: ag.orgao },
              { rotulo: 'Turno', valor: `${ROTULO_TURNO[ag.turno]} · ${hh(turno.inicio)} às ${hh(turno.fim)}` },
              { rotulo: 'Telefone', valor: ag.telefone },
              { rotulo: 'Último sinal', valor: ag.ultimoSinalEm ? `${formatarRelativo(ag.ultimoSinalEm, agora)} (${formatarDataHora(ag.ultimoSinalEm)})` : 'Sem sinal' },
              { rotulo: 'Base', valor: `${ag.baseLogradouro} · ${ag.baseBairroNome}`, larga: true },
              { rotulo: 'Região da base', valor: ag.regiao },
              { rotulo: 'Ponto da base', valor: <span className="numeros">{formatarNumero(ag.lat, 5)}, {formatarNumero(ag.lng, 5)}</span> },
              {
                rotulo: 'Veículo vinculado',
                valor: ag.equipamentoId
                  ? <Link to={`/equipamentos/${ag.equipamentoId}`}>{veiculo.data ? `${veiculo.data.codigo} · ${veiculo.data.marca} ${veiculo.data.modelo}` : 'Ver equipamento'}</Link>
                  : undefined,
              },
              { rotulo: 'Cadastrado em', valor: formatarDataHora(ag.criadoEm) },
            ]} />
          </section>

          <section className={estilos.secaoSemRecuo} aria-labelledby="a-ocorrencias">
            <h2 id="a-ocorrencias">Ocorrências atendidas</h2>
            <Tabela
              legenda={`Últimas ocorrências atendidas por ${ag.nome}`}
              colunas={colunas}
              linhas={ag.ocorrencias}
              chaveLinha={(o) => o.id}
              vazio={<EstadoVazio titulo="Nenhuma ocorrência atendida" descricao="Quando o agente atender uma ocorrência, ela aparece aqui (as 20 mais recentes)." />}
            />
          </section>
        </div>

        <div className={estilos.coluna}>
          <section className={estilos.secao} aria-labelledby="a-mapa">
            <h2 id="a-mapa">Posição no mapa</h2>
            <div className={estilos.mapa}>
              <MapaBase key={`${ag.latAtual},${ag.lngAtual}`} rotulo={`Mapa com a posição de ${ag.nome}`} centro={[ag.latAtual, ag.lngAtual]} zoom={15} mostrarLimite={false}>
                <Marker position={[ag.lat, ag.lng]} icon={iconeBloco('#1E1E1F', { tamanho: 18 })} interactive={false} />
                <Marker position={[ag.latAtual, ag.lngAtual]} icon={iconeBloco(corSituacao, { tamanho: 28 })} interactive={false} />
              </MapaBase>
            </div>
            <p className={estilos.nota}>Bloco colorido: posição atual ({ag.ultimoSinalEm ? formatarRelativo(ag.ultimoSinalEm, agora) : 'sem sinal'}). Bloco grafite: base cadastrada.</p>
          </section>
        </div>
      </div>

      <DialogoSituacaoAgente aberto={situacaoAberta} onFechar={() => setSituacaoAberta(false)} agente={ag} />
      <DialogoExcluir
        aberto={excluirAberto}
        onFechar={() => setExcluirAberto(false)}
        titulo="Excluir agente"
        nome={`${ag.nome} · matrícula ${ag.matricula}`}
        pendente={excluir.isPending}
        erro={excluir.error}
        onConfirmar={() => excluir.mutate(ag.id, { onSuccess: () => navegar('/agentes') })}
        alternativa={ag.situacao === 'fora_de_servico' ? undefined : (
          <Botao variante="primario" icone={<ArrowsClockwise weight="bold" size={18} aria-hidden="true" />} onClick={() => { setExcluirAberto(false); setSituacaoAberta(true); }}>
            Mudar para “Fora de serviço”
          </Botao>
        )}
      />
    </div>
  );
}
