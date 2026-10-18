// Ficha lateral da Central: resumo do marcador clicado (equipamento ou agente) no lugar do feed, com as ações do dia a
// dia e o caminho para a ficha completa. Esc fecha. Os dados seguem vivos: o tempo real invalida a ficha quando o
// equipamento ou o agente muda.
import { Lightning, MapPin, Wrench, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  HORARIO_TURNO, ROTULO_CATEGORIA_AGENTE, ROTULO_NECESSIDADE_MANUTENCAO, ROTULO_TIPO_OCORRENCIA, ROTULO_TURNO,
} from '../../../shared/dominio';
import { formatarDataHora, formatarEndereco, formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { AgenteDetalhe, EquipamentoDetalhe } from '../../../shared/modelos';
import { METRICA_PRINCIPAL, metricaDoTipo } from '../../../shared/telemetria';
import { mensagemDeErro } from '../api/cliente';
import { useAgente, useEquipamento, useInjetarEvento, useTelemetria } from '../api/consultas';
import { formatarDia } from '../util/datas';
import { useAgora } from '../util/useAgora';
import { AvisoErro } from './AvisoErro';
import { Botao, classeBotao } from './Botao';
import { DialogoManutencao } from './DialogoManutencao';
import { EtiquetaCriticidade, ordenarAlertas } from './EtiquetaAlerta';
import { EtiquetaSituacao } from './EtiquetaSituacao';
import { EtiquetaSituacaoAgente } from './EtiquetaSituacaoAgente';
import { IconeTipo } from './IconeTipo';
import { ListaDados } from './ListaDados';
import type { SelecaoMapa } from './MapaOperacional';
import estilos from './FichaLateral.module.css';

interface Props {
  selecao: SelecaoMapa;
  onFechar: () => void;
  nomeDoBairro?: (id: number) => string | undefined;
}

const hh = (h: number) => `${String(h).padStart(2, '0')}h`;

export function FichaLateral({ selecao, onFechar, nomeDoBairro }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);

  // Ao abrir (ou trocar de marcador) o foco vai para o título: quem usa teclado ou leitor de tela sabe onde está.
  useEffect(() => {
    titulo.current?.focus();
  }, [selecao.tipo, selecao.id]);

  return (
    <section
      className={estilos.ficha}
      aria-label={selecao.tipo === 'equipamento' ? 'Ficha do equipamento' : 'Ficha do agente'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onFechar();
      }}
    >
      {selecao.tipo === 'equipamento'
        ? <ResumoEquipamento id={selecao.id} titulo={titulo} onFechar={onFechar} />
        : <ResumoAgente id={selecao.id} titulo={titulo} onFechar={onFechar} nomeDoBairro={nomeDoBairro} />}
    </section>
  );
}

function Cabecalho({ titulo, refTitulo, onFechar, children }: {
  titulo: string; refTitulo: RefObject<HTMLHeadingElement | null>; onFechar: () => void; children?: ReactNode;
}) {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.titulos}>
        <h2 ref={refTitulo} tabIndex={-1} className={estilos.titulo}>{titulo}</h2>
        {children}
      </div>
      <Botao variante="fantasma" tamanho="pequeno" icone={<X weight="bold" size={16} aria-hidden="true" />} onClick={onFechar}>
        Fechar
      </Botao>
    </header>
  );
}

function ResumoEquipamento({ id, titulo, onFechar }: { id: number; titulo: RefObject<HTMLHeadingElement | null>; onFechar: () => void }) {
  const consulta = useEquipamento(id);
  const agora = useAgora(30_000);
  const [manutencaoAberta, setManutencaoAberta] = useState(false);
  const simular = useInjetarEvento();

  if (consulta.isPending) return <Cabecalho titulo="Carregando…" refTitulo={titulo} onFechar={onFechar} />;
  if (consulta.isError) {
    return (
      <>
        <Cabecalho titulo="Equipamento" refTitulo={titulo} onFechar={onFechar} />
        <div className={estilos.corpo}><AvisoErro erro={consulta.error} titulo="Não foi possível abrir o equipamento" onTentarDeNovo={() => void consulta.refetch()} /></div>
      </>
    );
  }
  const eq: EquipamentoDetalhe = consulta.data;
  const abertos = ordenarAlertas(eq.alertas.filter((a) => !a.resolvidoEm));

  return (
    <>
      <Cabecalho titulo={eq.codigo} refTitulo={titulo} onFechar={onFechar}>
        <div className={estilos.linha}>
          <IconeTipo tipo={eq.tipo} />
        </div>
      </Cabecalho>
      <div className={estilos.corpo}>
        <div className={estilos.situacao}>
          <EtiquetaSituacao situacao={eq.situacao} />
          <span className={estilos.marcaModelo}>{eq.marca} {eq.modelo}</span>
        </div>
        <MetricaAtual eq={eq} />
        <ListaDados
          itens={[
            { rotulo: 'Bairro', valor: `${eq.bairroNome} · região ${eq.regiao}` },
            { rotulo: 'Último sinal', valor: eq.ultimoSinalEm ? `${formatarRelativo(eq.ultimoSinalEm, agora)} (${formatarDataHora(eq.ultimoSinalEm)})` : 'Nunca transmitiu' },
            { rotulo: 'Órgão responsável', valor: eq.orgao },
            {
              rotulo: 'Manutenção',
              valor: eq.manutencaoNecessidade === 'imediata'
                ? 'Imediata'
                : eq.proximaManutencao ? `${ROTULO_NECESSIDADE_MANUTENCAO[eq.manutencaoNecessidade]} · próxima em ${formatarDia(eq.proximaManutencao)}` : ROTULO_NECESSIDADE_MANUTENCAO[eq.manutencaoNecessidade],
            },
            { rotulo: 'Endereço', valor: formatarEndereco(eq), larga: true },
          ]}
        />

        <section className={estilos.secao} aria-labelledby={`alertas-${eq.id}`}>
          <h3 id={`alertas-${eq.id}`}>Alertas abertos</h3>
          {abertos.length === 0 ? (
            <p className={estilos.vazio}>Nenhum alerta aberto para este equipamento.</p>
          ) : (
            <ul className={estilos.alertas}>
              {abertos.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <EtiquetaCriticidade criticidade={a.criticidade} />
                  <span className={estilos.alertaTexto}>
                    <strong>{a.titulo}</strong>
                    <span>{formatarRelativo(a.criadoEm, agora)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {simular.isError && <p className={estilos.erro} role="alert">Não foi possível simular: {mensagemDeErro(simular.error)}</p>}
      </div>
      <footer className={estilos.rodape}>
        <Link to={`/equipamentos/${eq.id}`} className={classeBotao('primario', 'pequeno')}>Abrir ficha completa</Link>
        <Botao tamanho="pequeno" icone={<Wrench weight="fill" size={16} aria-hidden="true" />} onClick={() => setManutencaoAberta(true)}>
          Registrar manutenção
        </Botao>
        {eq.situacao === 'operacional' && (
          <Botao
            variante="fantasma"
            tamanho="pequeno"
            icone={<Lightning weight="fill" size={16} aria-hidden="true" />}
            disabled={simular.isPending}
            onClick={() => simular.mutate({ tipo: 'falha', alvoId: eq.id })}
            title="Demonstração: este equipamento para de funcionar e o alerta chega na hora"
          >
            Simular falha
          </Botao>
        )}
      </footer>
      <DialogoManutencao aberto={manutencaoAberta} onFechar={() => setManutencaoAberta(false)} equipamento={eq} />
    </>
  );
}

/** Métrica principal do tipo (fluxo do radar, conexão da câmera…) na hora corrente. */
function MetricaAtual({ eq }: { eq: EquipamentoDetalhe }) {
  const telemetria = useTelemetria(eq.id, 3);
  const chave = METRICA_PRINCIPAL[eq.tipo];
  const def = metricaDoTipo(eq.tipo, chave);
  const ultimo = telemetria.data?.at(-1);
  const valor = ultimo?.metricas[chave];
  if (!def) return null;
  return (
    <div className={estilos.metrica}>
      <span className={`${estilos.metricaValor} numeros`}>
        {valor === undefined ? '—' : formatarNumero(valor, valor >= 100 || Number.isInteger(valor) ? 0 : 1)}
        {valor !== undefined && <span className={estilos.unidade}>{def.unidade}</span>}
      </span>
      <span className={estilos.metricaRotulo}>
        {def.rotulo}
        <span>{telemetria.isPending ? 'carregando…' : ultimo ? 'média da hora corrente' : 'sem leituras nas últimas 3 h'}</span>
      </span>
    </div>
  );
}

function ResumoAgente({ id, titulo, onFechar, nomeDoBairro }: {
  id: number; titulo: RefObject<HTMLHeadingElement | null>; onFechar: () => void; nomeDoBairro?: (id: number) => string | undefined;
}) {
  const consulta = useAgente(id);
  const agora = useAgora(30_000);

  if (consulta.isPending) return <Cabecalho titulo="Carregando…" refTitulo={titulo} onFechar={onFechar} />;
  if (consulta.isError) {
    return (
      <>
        <Cabecalho titulo="Agente" refTitulo={titulo} onFechar={onFechar} />
        <div className={estilos.corpo}><AvisoErro erro={consulta.error} titulo="Não foi possível abrir o agente" onTentarDeNovo={() => void consulta.refetch()} /></div>
      </>
    );
  }
  const ag: AgenteDetalhe = consulta.data;
  const atual = ag.ocorrencias.find((o) => !o.fim);
  const turno = HORARIO_TURNO[ag.turno];

  return (
    <>
      <Cabecalho titulo={ag.nome} refTitulo={titulo} onFechar={onFechar}>
        <p className={estilos.linha}>{ROTULO_CATEGORIA_AGENTE[ag.categoria]} · matrícula {ag.matricula}</p>
      </Cabecalho>
      <div className={estilos.corpo}>
        <div className={estilos.situacao}>
          <EtiquetaSituacaoAgente situacao={ag.situacao} />
        </div>
        <section className={`${estilos.ocorrencia} ${atual ? estilos.emOcorrencia : ''}`} aria-labelledby={`oc-${ag.id}`}>
          <h3 id={`oc-${ag.id}`}>Ocorrência atual</h3>
          {atual ? (
            <>
              <p className={estilos.ocorrenciaTitulo}>{ROTULO_TIPO_OCORRENCIA[atual.tipo]} · gravidade {atual.gravidade} de 4</p>
              <p>
                <MapPin weight="fill" size={14} aria-hidden="true" /> {nomeDoBairro?.(atual.bairroId) ?? 'Bairro desconhecido'}, começou {formatarRelativo(atual.inicio, agora)}
              </p>
              <p className={estilos.ocorrenciaDescricao}>{atual.descricao}</p>
            </>
          ) : (
            <p className={estilos.vazio}>Sem ocorrência no momento.</p>
          )}
        </section>
        <ListaDados
          itens={[
            { rotulo: 'Turno', valor: `${ROTULO_TURNO[ag.turno]} (${hh(turno.inicio)} às ${hh(turno.fim)})` },
            { rotulo: 'Órgão', valor: ag.orgao },
            { rotulo: 'Base', valor: `${ag.baseBairroNome} · região ${ag.regiao}` },
            { rotulo: 'Último sinal', valor: ag.ultimoSinalEm ? formatarRelativo(ag.ultimoSinalEm, agora) : 'Sem sinal' },
          ]}
        />
      </div>
      <footer className={estilos.rodape}>
        <Link to={`/agentes/${ag.id}`} className={classeBotao('primario', 'pequeno')}>Abrir ficha completa</Link>
      </footer>
    </>
  );
}
