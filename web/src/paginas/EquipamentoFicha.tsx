// Ficha do equipamento: dados, mini-mapa, características, linha do tempo da situação, manutenções,
// telemetria das últimas 48 h e alertas ligados. Ações: editar, mudar situação, registrar manutenção, desativar, excluir.
import { ArrowsClockwise, CaretLeft, Key, PencilSimple, Prohibit, Trash, Wrench } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import {
  COR_CRITICIDADE, ROTULO_CRITICIDADE, ROTULO_NECESSIDADE_MANUTENCAO, ROTULO_SITUACAO, COR_SITUACAO, type SituacaoEquipamento,
} from '../../../shared/dominio';
import { formatarCidadeUf, formatarDataHora, formatarEndereco, formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Alerta, EquipamentoDetalhe, Manutencao } from '../../../shared/modelos';
import { tipoPorId, unidadeParaValor, type CampoCaracteristica } from '../../../shared/tipos-equipamento';
import { useEquipamento, useExcluirEquipamento, useTelemetria } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao, classeBotao } from '../componentes/Botao';
import { DialogoExcluir } from '../componentes/DialogoExcluir';
import { DialogoManutencao } from '../componentes/DialogoManutencao';
import { DialogoSituacao } from '../componentes/DialogoSituacao';
import { DialogoGerarToken } from '../componentes/DialogoToken';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacao } from '../componentes/EtiquetaSituacao';
import { GraficoTelemetria } from '../componentes/GraficoTelemetria';
import { IconeTipo } from '../componentes/IconeTipo';
import { ListaDados } from '../componentes/ListaDados';
import { MapaBase } from '../componentes/MapaBase';
import { Tabela, type Coluna } from '../componentes/Tabela';
import { corDoTexto } from '../estilo/contraste';
import { iconeBloco } from '../mapa/marcadores';
import { formatarDia } from '../util/datas';
import estilos from './Ficha.module.css';
import { usePode } from '../sessao/Sessao';

function valorDaCaracteristica(c: CampoCaracteristica, valor: unknown): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (c.tipo === 'booleano') return valor === true ? 'Sim' : 'Não';
  if (c.tipo === 'numero' && typeof valor === 'number') {
    const unidade = unidadeParaValor(c.unidade, valor);
    return `${formatarNumero(valor, Number.isInteger(valor) ? 0 : 1)}${unidade ? ` ${unidade}` : ''}`;
  }
  const texto = String(valor);
  return c.tipo === 'opcao' ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

export default function EquipamentoFicha() {
  const { id } = useParams();
  const idNumero = Number(id);
  const valido = Number.isInteger(idNumero) && idNumero > 0;
  const consulta = useEquipamento(valido ? idNumero : undefined);

  if (!valido) return <NaoEncontrado />;
  if (consulta.isPending) return <div className="pagina"><EstadoVazio tamanho="pagina" titulo="Carregando equipamento…" /></div>;
  if (consulta.isError) {
    return (
      <div className="pagina">
        <AvisoErro erro={consulta.error} titulo="Não foi possível abrir o equipamento" onTentarDeNovo={() => void consulta.refetch()} tentando={consulta.isFetching} />
        <p><Link to="/equipamentos">Voltar para a lista de equipamentos</Link></p>
      </div>
    );
  }
  return <Ficha eq={consulta.data} />;
}

function NaoEncontrado() {
  return (
    <div className="pagina">
      <EstadoVazio tamanho="pagina" titulo="Equipamento não encontrado" descricao="O endereço não corresponde a nenhum equipamento cadastrado." acao={<Link to="/equipamentos" className={classeBotao('primario')}>Ver equipamentos</Link>} />
    </div>
  );
}

function Ficha({ eq }: { eq: EquipamentoDetalhe }) {
  const podeCadastrar = usePode('cadastrar');
  const podeOperar = usePode('operar');
  const podeExcluir = usePode('excluir');
  const navegar = useNavigate();
  const def = tipoPorId(eq.tipo);
  const excluir = useExcluirEquipamento();
  const telemetria = useTelemetria(eq.id, 48, !excluir.isSuccess);
  const [situacaoAberta, setSituacaoAberta] = useState<{ inicial?: SituacaoEquipamento } | null>(null);
  const [manutencaoAberta, setManutencaoAberta] = useState(false);
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [tokenAberto, setTokenAberto] = useState(false);

  const posicao: [number, number] = def.movel ? [eq.latAtual, eq.lngAtual] : [eq.lat, eq.lng];
  const agora = new Date();

  const colunasManutencao: Coluna<Manutencao>[] = [
    { chave: 'tipo', titulo: 'Tipo', render: (m) => (m.tipo === 'corretiva' ? 'Corretiva' : 'Preventiva'), semQuebra: true },
    { chave: 'descricao', titulo: 'Descrição', render: (m) => m.descricao },
    { chave: 'aberta', titulo: 'Aberta em', render: (m) => formatarDataHora(m.abertaEm), semQuebra: true, esconderNoCelular: true },
    {
      chave: 'situacao', titulo: 'Situação', semQuebra: true,
      render: (m) => (m.concluidaEm ? `Concluída em ${formatarDia(m.concluidaEm)}` : m.previstaPara ? `Prevista para ${formatarDia(m.previstaPara)}` : 'Aberta'),
    },
  ];

  return (
    <div className={`pagina ${estilos.pagina}`}>
      <Link to="/equipamentos" className={estilos.voltar}>
        <CaretLeft weight="fill" size={16} aria-hidden="true" />
        Voltar para equipamentos
      </Link>

      <header className={estilos.cabecalho}>
        <div className={estilos.identidade}>
          <div className={estilos.linhaTitulo}>
            <h1 className={estilos.titulo}>{eq.codigo}</h1>
            <EtiquetaSituacao situacao={eq.situacao} />
          </div>
          <p className={estilos.subtitulo}>
            <IconeTipo tipo={eq.tipo} />
            <span>{eq.marca} {eq.modelo}</span>
            <span>{eq.bairroNome} · região {eq.regiao}</span>
          </p>
        </div>
        <div className={estilos.acoes}>
          {podeCadastrar && (
            <Link to={`/equipamentos/${eq.id}/editar`} className={classeBotao('secundario')}>
              <PencilSimple weight="fill" size={18} aria-hidden="true" />
              <span>Editar</span>
            </Link>
          )}
          {podeOperar && (
            <>
              <Botao icone={<ArrowsClockwise weight="fill" size={18} aria-hidden="true" />} onClick={() => setSituacaoAberta({})}>Mudar situação</Botao>
              <Botao icone={<Wrench weight="fill" size={18} aria-hidden="true" />} onClick={() => setManutencaoAberta(true)}>Registrar manutenção</Botao>
              <Botao icone={<Prohibit weight="fill" size={18} aria-hidden="true" />} disabled={eq.situacao === 'desativado'} onClick={() => setSituacaoAberta({ inicial: 'desativado' })}>Desativar</Botao>
            </>
          )}
          {podeCadastrar && (
            <Botao icone={<Key weight="fill" size={18} aria-hidden="true" />} onClick={() => setTokenAberto(true)}>Gerar token novo</Botao>
          )}
          {podeExcluir && (
            <Botao variante="fantasma" icone={<Trash weight="fill" size={18} aria-hidden="true" />} onClick={() => { excluir.reset(); setExcluirAberto(true); }}>Excluir</Botao>
          )}
        </div>
      </header>

      <div className={estilos.corpo}>
        <div className={estilos.coluna}>
          <section className={estilos.secao} aria-labelledby="f-dados">
            <h2 id="f-dados">Dados do equipamento</h2>
            <ListaDados itens={[
              { rotulo: 'Número de série', valor: eq.numeroSerie },
              { rotulo: 'Marca e modelo', valor: `${eq.marca} ${eq.modelo}` },
              { rotulo: 'Órgão responsável', valor: eq.orgao },
              { rotulo: 'Instalado em', valor: eq.instaladoEm ? formatarDia(eq.instaladoEm) : undefined },
              { rotulo: 'Último sinal', valor: eq.ultimoSinalEm ? `${formatarRelativo(eq.ultimoSinalEm, agora)} (${formatarDataHora(eq.ultimoSinalEm)})` : 'Sem sinal' },
              { rotulo: 'Cadastrado em', valor: formatarDataHora(eq.criadoEm) },
              { rotulo: 'Logradouro', valor: eq.logradouro, larga: true },
              { rotulo: 'Referência', valor: eq.referencia },
              { rotulo: 'CEP', valor: eq.cep },
              { rotulo: 'Bairro e região', valor: `${eq.bairroNome} · região ${eq.regiao}` },
              { rotulo: 'Cidade/UF', valor: formatarCidadeUf(eq.cidade, eq.uf) },
              { rotulo: 'Endereço completo', valor: formatarEndereco(eq), larga: true },
              { rotulo: 'Ponto cadastrado', valor: <span className="numeros">{formatarNumero(eq.lat, 5)}, {formatarNumero(eq.lng, 5)}</span> },
              ...(def.movel ? [{ rotulo: 'Posição atual', valor: <span className="numeros">{formatarNumero(eq.latAtual, 5)}, {formatarNumero(eq.lngAtual, 5)}</span> }] : []),
              { rotulo: 'Necessidade de manutenção', valor: ROTULO_NECESSIDADE_MANUTENCAO[eq.manutencaoNecessidade] + (eq.manutencaoPeriodicidadeDias ? ` · a cada ${formatarNumero(eq.manutencaoPeriodicidadeDias)} dias` : '') },
              { rotulo: 'Última manutenção', valor: eq.ultimaManutencao ? formatarDia(eq.ultimaManutencao) : undefined },
              { rotulo: 'Próxima manutenção', valor: eq.proximaManutencao ? formatarDia(eq.proximaManutencao) : undefined },
            ]} />
          </section>

          <section className={estilos.secao} aria-labelledby="f-caracteristicas">
            <h2 id="f-caracteristicas">Características do tipo</h2>
            <ListaDados itens={def.campos.map((c) => ({ rotulo: c.rotulo, valor: valorDaCaracteristica(c, eq.caracteristicas[c.chave]) }))} />
          </section>

          <section className={estilos.secao} aria-labelledby="f-telemetria">
            <h2 id="f-telemetria">Telemetria das últimas 48 horas</h2>
            {telemetria.isPending ? (
              <p className={estilos.nota}>Carregando leituras…</p>
            ) : telemetria.isError ? (
              <AvisoErro erro={telemetria.error} titulo="Não foi possível carregar a telemetria" onTentarDeNovo={() => void telemetria.refetch()} tentando={telemetria.isFetching} />
            ) : (
              <GraficoTelemetria tipo={eq.tipo} pontos={telemetria.data} />
            )}
          </section>

          <section className={estilos.secaoSemRecuo} aria-labelledby="f-manutencoes">
            <h2 id="f-manutencoes">Manutenções</h2>
            <Tabela
              legenda={`Manutenções de ${eq.codigo}`}
              colunas={colunasManutencao}
              linhas={eq.manutencoes}
              chaveLinha={(m) => m.id}
              vazio={<EstadoVazio titulo="Nenhuma manutenção registrada" descricao="Use “Registrar manutenção” para anotar um conserto ou uma revisão." />}
            />
          </section>
        </div>

        <div className={estilos.coluna}>
          <section className={estilos.secao} aria-labelledby="f-mapa">
            <h2 id="f-mapa">{def.movel ? 'Posição atual' : 'Localização'}</h2>
            <div className={estilos.mapa}>
              <MapaBase key={`${posicao[0]},${posicao[1]}`} rotulo={`Mapa com a posição de ${eq.codigo}`} centro={posicao} zoom={16} mostrarLimite={false}>
                <Marker position={posicao} icon={iconeBloco(COR_SITUACAO[eq.situacao], { tamanho: 28, tracejado: eq.situacao === 'nao_instalado' })} interactive={false} />
              </MapaBase>
            </div>
            <p className={estilos.nota}>{eq.logradouro}{eq.referencia ? ` · ${eq.referencia}` : ''}</p>
          </section>

          <section className={estilos.secao} aria-labelledby="f-situacao">
            <h2 id="f-situacao">Linha do tempo da situação</h2>
            <ol className={estilos.tempo}>
              {eq.historico.map((h) => (
                <li key={h.id} className={estilos.marco}>
                  <span className={estilos.ponto} style={{ background: COR_SITUACAO[h.para] }} aria-hidden="true" />
                  <span className={estilos.marcoTitulo}>
                    {ROTULO_SITUACAO[h.de]} → <EtiquetaSituacao situacao={h.para} tamanho="compacta" />
                  </span>
                  <span className={estilos.marcoData}>{formatarDataHora(h.em)}</span>
                  <span className={estilos.marcoTexto}>{h.motivo}</span>
                </li>
              ))}
              <li className={estilos.marco}>
                <span className={estilos.ponto} aria-hidden="true" />
                <span className={estilos.marcoTitulo}>Cadastrado no F.O.G.O.</span>
                <span className={estilos.marcoData}>{formatarDataHora(eq.criadoEm)}</span>
              </li>
            </ol>
            {eq.historico.length === 0 && <p className={estilos.nota}>Nenhuma mudança de situação registrada desde o cadastro.</p>}
          </section>

          <section className={estilos.secao} aria-labelledby="f-alertas">
            <h2 id="f-alertas">Alertas ligados</h2>
            {eq.alertas.length === 0 ? (
              <EstadoVazio titulo="Nenhum alerta para este equipamento" />
            ) : (
              <ul className={estilos.alertas}>
                {eq.alertas.map((a) => <ItemAlerta key={a.id} alerta={a} />)}
              </ul>
            )}
            <Link to="/alertas" className={classeBotao('secundario', 'pequeno')}>Ver todos os alertas</Link>
          </section>
        </div>
      </div>

      <DialogoSituacao
        key={`situacao-${situacaoAberta?.inicial ?? 'livre'}`}
        aberto={situacaoAberta !== null}
        onFechar={() => setSituacaoAberta(null)}
        equipamento={eq}
        situacaoInicial={situacaoAberta?.inicial}
      />
      <DialogoGerarToken aberto={tokenAberto} onFechar={() => setTokenAberto(false)} equipamento={eq} />
      <DialogoManutencao aberto={manutencaoAberta} onFechar={() => setManutencaoAberta(false)} equipamento={eq} />
      <DialogoExcluir
        aberto={excluirAberto}
        onFechar={() => setExcluirAberto(false)}
        titulo="Excluir equipamento"
        nome={`${eq.codigo} · ${eq.marca} ${eq.modelo}`}
        pendente={excluir.isPending}
        erro={excluir.error}
        onConfirmar={() => excluir.mutate(eq.id, { onSuccess: () => navegar('/equipamentos') })}
        alternativa={eq.situacao === 'desativado' ? undefined : (
          <Botao variante="primario" icone={<Prohibit weight="fill" size={18} aria-hidden="true" />} onClick={() => { setExcluirAberto(false); setSituacaoAberta({ inicial: 'desativado' }); }}>
            Desativar em vez de excluir
          </Botao>
        )}
      />
    </div>
  );
}

function ItemAlerta({ alerta }: { alerta: Alerta }) {
  const cor = COR_CRITICIDADE[alerta.criticidade];
  const estado = alerta.resolvidoEm ? 'Resolvido' : alerta.reconhecidoEm ? 'Reconhecido' : 'Aberto';
  return (
    <li className={estilos.alerta}>
      <span className={estilos.crit} style={{ background: cor, color: corDoTexto(cor) }}>{ROTULO_CRITICIDADE[alerta.criticidade]}</span>
      <span className={estilos.alertaTexto}>
        <strong>{alerta.titulo}</strong>
        <span>{estado} · {formatarDataHora(alerta.criadoEm)}</span>
      </span>
    </li>
  );
}
