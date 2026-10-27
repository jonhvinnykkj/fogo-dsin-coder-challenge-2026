// Boletim do dia: a cidade numa folha A4 para o gestor imprimir ou salvar em PDF e levar à reunião, mais a exportação
// em CSV. Fora da casca (sem menu): na impressão sai só a folha. Tudo vem das rotas que as telas já usam (Central,
// Previsões, Manutenção); aqui só se recorta e escreve em português.
import { ArrowLeft, DownloadSimple, Printer } from '@phosphor-icons/react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  COR_CRITICIDADE, COR_NIVEL_ATENCAO, COR_NIVEL_RISCO, COR_SITUACAO, ROTULO_NIVEL_ATENCAO, ROTULO_NIVEL_RISCO,
} from '../../../shared/dominio';
import { formatarChance, formatarDataHora, formatarNumero, formatarPct, formatarRelativo } from '../../../shared/formato';
import type { Agente, Equipamento, Indicadores, PainelManutencao } from '../../../shared/modelos';
import { api, mensagemDeErro } from '../api/cliente';
import { useAlertas, useIndicadores, usePainelManutencao, usePrevisao, useRegioes } from '../api/consultas';
import { baixarCsv } from '../boletim/csv';
import { buscarTodas, csvAgentes, csvEquipamentos, csvManutencoesPendentes, nomeDoArquivo } from '../boletim/exportacoes';
import { bairrosDeMaiorRisco, horaDoPico, prazoDaManutencao, textoReforco } from '../boletim/montar';
import estilos from '../boletim/Boletim.module.css';
import { Botao, classeBotao } from '../componentes/base/Botao';
import { rotuloCurtoDoTipo } from '../componentes/etiquetas/IconeTipo';
import { corDoTexto } from '../estilo/contraste';
import { formatarDia, hojeIso } from '../util/datas';
import { rotuloRegiao, textoOcorrencias } from '../util/risco';

/** O que cabe numa folha; o resto fica no CSV ou na tela correspondente. */
const MAX_ALERTAS = 6;
const MAX_MANUTENCOES = 8;
const MAX_FALHAS = 10;
const MAX_BAIRROS = 5;

const fmtDiaPorExtenso = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hora = (iso: string) => formatarDataHora(iso).slice(-5); // "dd/mm/aaaa HH:mm" → "HH:mm"
const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;

type Consulta = { isPending: boolean; isError: boolean; error: unknown };

/** Uma seção da folha: título, e o conteúdo só quando os dados chegaram (senão, uma linha dizendo o que houve). */
function Secao({ titulo, consultas, children, className }: { titulo: string; consultas: Consulta[]; children: () => ReactNode; className?: string }) {
  const id = useId();
  const erro = consultas.find((c) => c.isError);
  return (
    <section aria-labelledby={id} className={`${estilos.secao} ${className ?? ''}`}>
      <h2 id={id} className={estilos.tituloSecao}>{titulo}</h2>
      {erro ? <p className={estilos.aviso}>Não foi possível carregar: {mensagemDeErro(erro.error)}</p>
        : consultas.some((c) => c.isPending) ? <p className={estilos.aviso}>Carregando…</p>
          : children()}
    </section>
  );
}

function Selo({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={estilos.selo} style={{ borderColor: cor, backgroundColor: cor, color: corDoTexto(cor) }}>{children}</span>;
}

function FaixaDoBoletim({ ind }: { ind: Indicadores }) {
  const blocos: { rotulo: string; valor: string; detalhe: string; cor?: string }[] = [
    { rotulo: 'Equipamentos', valor: formatarNumero(ind.totalEquipamentos), detalhe: plural(ind.naoInstalados, 'não instalado', 'não instalados') },
    { rotulo: 'Operacionais', valor: formatarNumero(ind.operacionais), detalhe: plural(ind.desativados, 'desativado', 'desativados'), cor: COR_SITUACAO.operacional },
    { rotulo: 'Indisponíveis', valor: formatarNumero(ind.indisponiveis), detalhe: 'falha, manutenção ou furto', cor: COR_SITUACAO.mau_funcionamento },
    { rotulo: 'Disponibilidade', valor: formatarPct(ind.disponibilidadePct), detalhe: 'dos que deveriam funcionar' },
    { rotulo: 'Agentes em atividade', valor: formatarNumero(ind.agentesEmAtividade), detalhe: `de ${formatarNumero(ind.agentesTotal)} cadastrados` },
    {
      rotulo: 'Alertas críticos', valor: formatarNumero(ind.alertasCriticosAbertos), detalhe: plural(ind.alertasAbertos, 'alerta aberto ao todo', 'alertas abertos ao todo'),
      ...(ind.alertasCriticosAbertos > 0 && { cor: COR_CRITICIDADE.critica }),
    },
  ];
  return (
    <ul className={estilos.indicadores}>
      {blocos.map((b) => (
        <li key={b.rotulo} className={estilos.indicador} style={b.cor ? { borderTopColor: b.cor } : undefined}>
          <span className={`${estilos.valorIndicador} numeros`}>{b.valor}</span>
          <span className={estilos.rotuloIndicador}>{b.rotulo}</span>
          <span className={estilos.detalhe}>{b.detalhe}</span>
        </li>
      ))}
    </ul>
  );
}

type Exportacao = 'equipamentos' | 'agentes' | 'manutencoes';

export default function Boletim() {
  const [emitidoEm] = useState(() => new Date());
  const iso = emitidoEm.toISOString();
  const hoje = hojeIso(emitidoEm);

  const indicadores = useIndicadores();
  const regioes = useRegioes();
  const alertas = useAlertas({ status: 'abertos', criticidade: 'critica', limite: 50 });
  const painel = usePainelManutencao();
  const resumo = usePrevisao('resumo');
  const risco = usePrevisao('risco');
  const reforco = usePrevisao('reforco');
  const falhas = usePrevisao('falhas');

  const [exportando, setExportando] = useState<Exportacao>();
  const [erroExportacao, setErroExportacao] = useState<string>();

  const bairros = useMemo(
    () => (resumo.data && risco.data ? bairrosDeMaiorRisco(resumo.data, risco.data, MAX_BAIRROS) : []),
    [resumo.data, risco.data],
  );

  const exportar = async (qual: Exportacao) => {
    setExportando(qual);
    setErroExportacao(undefined);
    try {
      if (qual === 'equipamentos') baixarCsv(nomeDoArquivo('equipamentos'), csvEquipamentos(await buscarTodas<Equipamento>('/api/equipamentos')));
      else if (qual === 'agentes') baixarCsv(nomeDoArquivo('agentes'), csvAgentes(await buscarTodas<Agente>('/api/agentes')));
      else {
        const dados = painel.data ?? (await api.get<PainelManutencao>('/api/manutencao/painel'));
        baixarCsv(nomeDoArquivo('manutencoes-pendentes'), csvManutencoesPendentes(dados, hojeIso()));
      }
    } catch (e) {
      setErroExportacao(`Não foi possível gerar o CSV: ${mensagemDeErro(e)}`);
    } finally {
      setExportando(undefined);
    }
  };

  const botaoCsv = (qual: Exportacao, rotulo: string) => (
    <Botao variante="secundario" icone={<DownloadSimple weight="fill" size={18} aria-hidden="true" />} disabled={exportando !== undefined} onClick={() => void exportar(qual)}>
      {exportando === qual ? 'Gerando…' : rotulo}
    </Botao>
  );

  return (
    <div className={estilos.tela}>
      <div className={estilos.acoes}>
        <Link to="/" className={classeBotao('fantasma')}>
          <ArrowLeft weight="bold" size={18} aria-hidden="true" />
          <span>Voltar à Central</span>
        </Link>
        <Botao variante="primario" icone={<Printer weight="fill" size={18} aria-hidden="true" />} onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </Botao>
        <div role="group" aria-label="Exportar CSV" className={estilos.exportar}>
          <span className={estilos.rotuloExportar}>Exportar CSV:</span>
          {botaoCsv('equipamentos', 'Inventário de equipamentos')}
          {botaoCsv('agentes', 'Agentes')}
          {botaoCsv('manutencoes', 'Manutenções pendentes')}
        </div>
        {erroExportacao && <p role="alert" className={estilos.erroExportacao}>{erroExportacao}</p>}
      </div>

      <article className={estilos.folha}>
        <header className={estilos.cabecalho}>
          <span className={estilos.marca}>F.O.G.O.</span>
          <div>
            <h1 className={estilos.titulo}>Boletim do dia</h1>
            <p className={estilos.data}>Marília/SP · {fmtDiaPorExtenso.format(emitidoEm)} · emitido às {hora(iso)}</p>
            <p className={estilos.detalhe}>Situação ao vivo da Central e previsões das próximas 24 horas.</p>
          </div>
        </header>

        <Secao titulo="Resumo do dia" consultas={[resumo]}>
          {() => (
            <ol className={estilos.resumo}>
              {resumo.data!.recomendacoes.map((r) => (
                <li key={r.titulo}>
                  <span className={`${estilos.prioridade} ${estilos[r.prioridade]}`}>{r.prioridade === 'alta' ? 'Alta' : r.prioridade === 'media' ? 'Média' : 'Baixa'}</span>
                  <span className={estilos.recomendacao}>{r.titulo}</span>
                  <span className={`${estilos.detalhe} ${estilos.soNaTela}`}>{r.detalhe}</span>
                </li>
              ))}
            </ol>
          )}
        </Secao>

        <Secao titulo="Indicadores" consultas={[indicadores]}>
          {() => <FaixaDoBoletim ind={indicadores.data!} />}
        </Secao>

        <Secao titulo="Situação das regiões" consultas={[regioes]}>
          {() => (
            <ul className={estilos.regioes}>
              {regioes.data!.map((r) => (
                <li key={r.regiao} className={estilos.regiao} style={{ borderTopColor: COR_NIVEL_ATENCAO[r.nivel] }}>
                  <span className={estilos.forte}>{rotuloRegiao(r.regiao)}</span>
                  <span className={estilos.indiceRegiao}>
                    <span className="numeros">{r.indice}</span>
                    <Selo cor={COR_NIVEL_ATENCAO[r.nivel]}>{ROTULO_NIVEL_ATENCAO[r.nivel]}</Selo>
                  </span>
                  <span className={estilos.detalhe}>{r.motivos.slice(0, 2).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Bairros de maior risco nas próximas 24 h" consultas={[resumo, risco]}>
          {() => (
            <table className={estilos.tabela}>
              <thead><tr><th>Bairro</th><th>Pico</th><th className={estilos.num}>Índice</th><th>Esperadas</th><th>Por quê</th></tr></thead>
              <tbody>
                {bairros.map((b) => (
                  <tr key={b.bairroId}>
                    <td className={estilos.forte}>{b.nome}</td>
                    <td className={estilos.semQuebra}>{b.picoInicio ? `pico às ${horaDoPico(b.picoInicio)}` : '—'}</td>
                    <td className={estilos.num}><Selo cor={COR_NIVEL_RISCO[b.nivel]}>{b.indice} · {ROTULO_NIVEL_RISCO[b.nivel]}</Selo></td>
                    <td className={`${estilos.semQuebra} numeros`}>{textoOcorrencias(b.esperadas)}</td>
                    <td className={estilos.detalhe}>{b.porque}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        <div className={estilos.duasColunas}>
          <Secao titulo="Alertas críticos abertos" consultas={[alertas]}>
            {() => {
              const lista = alertas.data!;
              if (!lista.length) return <p className={estilos.aviso}>Nenhum alerta crítico aberto.</p>;
              return (
                <>
                  <ul className={estilos.lista}>
                    {lista.slice(0, MAX_ALERTAS).map((a) => (
                      <li key={a.id}>
                        <span className={estilos.forte}>{a.titulo}</span>
                        <span className={estilos.detalhe}> · aberto {formatarRelativo(a.criadoEm, emitidoEm)} ({hora(a.criadoEm)})</span>
                      </li>
                    ))}
                  </ul>
                  {lista.length > MAX_ALERTAS && <p className={estilos.aviso}>e mais {lista.length - MAX_ALERTAS} na tela de Alertas.</p>}
                </>
              );
            }}
          </Secao>

          <Secao titulo="Reforço de agentes" consultas={[reforco]}>
            {() => {
              const recs = reforco.data!.recomendacoes;
              if (!recs.length) return <p className={estilos.aviso}>Nenhum remanejamento recomendado: a carga por agente está equilibrada entre as regiões.</p>;
              return (
                <ul className={estilos.lista}>
                  {recs.map((r) => (
                    <li key={`${r.inicio}-${r.regiaoOrigem}-${r.regiaoDestino}`}>{textoReforco(r)}</li>
                  ))}
                </ul>
              );
            }}
          </Secao>
        </div>

        <div className={estilos.duasColunas}>
          <Secao titulo="Manutenção vencida ou nos próximos 7 dias" consultas={[painel]}>
            {() => {
              const itens = [...painel.data!.atrasadas, ...painel.data!.proximos7];
              if (!itens.length) return <p className={estilos.aviso}>Nenhuma manutenção vencida nem prevista para os próximos 7 dias.</p>;
              return (
                <>
                  <table className={estilos.tabela}>
                    <thead><tr><th>Código</th><th>Equipamento</th><th>Prazo</th></tr></thead>
                    <tbody>
                      {itens.slice(0, MAX_MANUTENCOES).map((e) => (
                        <tr key={e.id}>
                          <td className={estilos.forte}>{e.codigo}</td>
                          <td>{rotuloCurtoDoTipo(e.tipo)}<span className={estilos.soNaTela}> · {e.bairroNome}</span></td>
                          <td
                            className={`${estilos.semQuebra} ${e.proximaManutencao && e.proximaManutencao < hoje ? estilos.vencida : ''}`}
                            title={e.proximaManutencao ? formatarDia(e.proximaManutencao) : undefined}
                          >
                            {e.proximaManutencao ? prazoDaManutencao(e.proximaManutencao, hoje) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {itens.length > MAX_MANUTENCOES && (
                    <p className={estilos.aviso}>e mais {itens.length - MAX_MANUTENCOES}: a lista completa (com bairro e data) está no CSV de manutenções pendentes.</p>
                  )}
                </>
              );
            }}
          </Secao>

          <Secao titulo="Maior chance de falha em 7 dias" consultas={[falhas]}>
            {() => (
              <table className={estilos.tabela}>
                <thead><tr><th>Código</th><th>Equipamento</th><th className={estilos.num}>Chance</th><th className={estilos.soNaTela}>Principal motivo</th></tr></thead>
                <tbody>
                  {falhas.data!.itens.slice(0, MAX_FALHAS).map((f) => {
                    const principal = [...f.fatores].sort((a, b) => b.contribuicao - a.contribuicao)[0];
                    return (
                      <tr key={f.equipamentoId}>
                        <td className={estilos.forte}>{f.codigo}</td>
                        <td>{rotuloCurtoDoTipo(f.tipo)} {f.modelo}</td>
                        <td className={`${estilos.num} numeros`}>{formatarChance(f.probabilidade)}</td>
                        <td className={`${estilos.detalhe} ${estilos.soNaTela}`}>{principal?.nome ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Secao>
        </div>

        <footer className={estilos.rodape}>
          F.O.G.O. — Ferramenta Onisciente de Gestão e Operações · Boletim emitido em {formatarDataHora(iso)} · Dados sintéticos de demonstração.
        </footer>
      </article>
    </div>
  );
}
