// Cidade Preditiva (Parte 3): o que deve acontecer amanhã em Marília e quanto cada previsão acertou no passado.
// Uma página de seções com índice lateral fixo. Cada seção pede a própria previsão e aparece assim que ela chega — o
// resumo e o mapa não esperam o teste retroativo, e os 7 dias (~450 KB) só são pedidos quando a grade chega perto da tela.
// Todos os números e textos vêm do servidor (`/api/previsoes/*`); aqui só se organiza para decidir rápido.
import {
  CalendarDots, ChartLineUp, ClockCounterClockwise, ListChecks, MapTrifold, Pulse, UsersThree, Wrench, type Icon,
} from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { formatarDataHora } from '../../../shared/formato';
import { useAlertas, useBairros, usePrevisao } from '../api/consultas';
import { CartaoBacktest } from '../componentes/CartaoBacktest';
import { GradeRiscoSemana } from '../componentes/GradeRiscoSemana';
import { GraficosTendencias } from '../componentes/GraficosTendencias';
import { EXPLICACAO_ANOMALIAS, ListaAnomalias } from '../componentes/ListaAnomalias';
import { ListaReforco } from '../componentes/ListaReforco';
import { MapaRisco } from '../componentes/MapaRisco';
import { RankingFalhas } from '../componentes/RankingFalhas';
import { ResumoDoDia } from '../componentes/ResumoDoDia';
import { SecaoPrevisao } from '../componentes/SecaoPrevisao';
import { useQuaseNaTela, useSecaoAtiva } from '../util/useSecoes';
import estilos from './Previsoes.module.css';

const SECOES: { id: string; rotulo: string; icone: Icon }[] = [
  { id: 'resumo', rotulo: 'Resumo do dia', icone: ListChecks },
  { id: 'risco', rotulo: 'Risco em 24 horas', icone: MapTrifold },
  { id: 'semana', rotulo: 'Próximos 7 dias', icone: CalendarDots },
  { id: 'retroativo', rotulo: 'Quanto acertou', icone: ClockCounterClockwise },
  { id: 'reforco', rotulo: 'Reforço de agentes', icone: UsersThree },
  { id: 'falhas', rotulo: 'Falhas prováveis', icone: Wrench },
  { id: 'anomalias', rotulo: 'Anomalias', icone: Pulse },
  { id: 'tendencias', rotulo: 'Tendências', icone: ChartLineUp },
];
const IDS = SECOES.map((s) => s.id);
const icone = (id: string) => SECOES.find((s) => s.id === id)!.icone;

const DIA_MS = 24 * 3_600_000;
/** Máximo de anomalias pedidas (a API não devolve o total; a lista avisa "200+" quando vem cheia). */
const LIMITE_ANOMALIAS = 200;

export default function Previsoes() {
  const resumo = usePrevisao('resumo');
  const risco = usePrevisao('risco', { horas: 24 });
  const [refSemana, semanaPerto] = useQuaseNaTela<HTMLElement>();
  const semana = usePrevisao('risco', { horas: 168 }, { ativa: semanaPerto });
  const backtest = usePrevisao('backtest');
  const reforco = usePrevisao('reforco');
  const falhas = usePrevisao('falhas');
  const tendencias = usePrevisao('tendencias');
  // "Desde" fixo ao abrir a página: uma chave estável para o cache (o tempo real acrescenta as novas por cima).
  const [desde] = useState(() => new Date(Date.now() - DIA_MS).toISOString());
  const anomalias = useAlertas({ tipo: 'anomalia_leitura', status: 'todos', desde, limite: LIMITE_ANOMALIAS });
  const bairros = useBairros();
  const [ativa, marcarAtiva] = useSecaoAtiva(IDS);

  const irPara = useCallback((id: string) => {
    const secao = document.getElementById(id);
    if (!secao) return;
    marcarAtiva(id);
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    secao.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${id}`);
    document.getElementById(`${id}-titulo`)?.focus({ preventScroll: true });
  }, [marcarAtiva]);

  return (
    <div className={`pagina ${estilos.pagina}`}>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Previsões</h1>
        <p className={estilos.subtitulo}>
          O que deve acontecer em Marília nas próximas 24 horas e nos próximos 7 dias, e quanto cada previsão acertou no passado.
        </p>
        {resumo.data && <p className={`${estilos.quando} numeros`}>Calculado em {formatarDataHora(resumo.data.geradoEm)}</p>}
      </header>

      <nav className={estilos.indice} aria-label="Seções desta página">
        <ul>
          {SECOES.map((s) => {
            const Icone = s.icone;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={estilos.itemIndice}
                  aria-current={ativa === s.id ? 'true' : undefined}
                  onClick={(ev) => {
                    ev.preventDefault();
                    irPara(s.id);
                  }}
                >
                  <Icone weight="fill" size={16} aria-hidden="true" />
                  {s.rotulo}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={estilos.secoes}>
        <SecaoPrevisao
          id="resumo"
          imediata
          titulo="Resumo do dia"
          icone={icone('resumo')}
          descricao="As 5 ações mais importantes de hoje, tiradas das quatro previsões, e o risco de cada bairro nas próximas 24 horas."
          consulta={resumo}
          explicacao={(r) => r.explicacao}
          alturaEsqueleto={520}
        >
          {(r) => <ResumoDoDia resumo={r} onIrPara={irPara} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="risco"
          imediata
          titulo="Risco nas próximas 24 horas"
          icone={icone('risco')}
          descricao="Quantas ocorrências cada bairro deve ter em cada hora. Toque a régua para ver o dia passar no mapa ou escolha uma hora."
          consulta={risco}
          explicacao={(r) => r.explicacao}
          calculadoEm={(r) => r.geradoEm}
          alturaEsqueleto={620}
        >
          {(r) => <MapaRisco previsao={r} bairros={bairros.data} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          ref={refSemana}
          id="semana"
          titulo="Próximos 7 dias"
          icone={icone('semana')}
          descricao="O risco de cada bairro em blocos de 3 horas, para planejar a escala da semana. Clique numa célula para ver o que pesa."
          consulta={semana}
          explicacao={(r) => r.explicacao}
          calculadoEm={(r) => r.geradoEm}
          alturaEsqueleto={560}
        >
          {(r) => <GradeRiscoSemana previsao={r} bairros={bairros.data} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="retroativo"
          titulo="Quanto o modelo acertou"
          icone={icone('retroativo')}
          descricao="O mapa de risco refeito para cada um dos 14 dias antes de hoje, só com os dados da véspera, e comparado com o que aconteceu."
          consulta={backtest}
          explicacao={(r) => r.explicacao}
          tituloExplicacao="Como o teste foi feito"
          alturaEsqueleto={480}
        >
          {(r) => <CartaoBacktest resultado={r} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="reforco"
          titulo="Reforço de agentes"
          icone={icone('reforco')}
          descricao="Para onde mover agentes em cada turno das próximas 24 horas, pela carga de ocorrências prevista por agente."
          consulta={reforco}
          explicacao={(r) => r.explicacao}
          calculadoEm={(r) => r.geradoEm}
        >
          {(r) => <ListaReforco recomendacoes={r.recomendacoes} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="falhas"
          titulo="Falhas prováveis"
          icone={icone('falhas')}
          descricao="Os 20 equipamentos em operação com maior chance de falhar nos próximos 7 dias, com o motivo de cada um. Agende a revisão antes que parem."
          consulta={falhas}
          explicacao={(r) => r.explicacao}
          calculadoEm={(r) => r.geradoEm}
          alturaEsqueleto={640}
        >
          {(r) => <RankingFalhas itens={r.itens} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="anomalias"
          titulo="Anomalias nas últimas 24 horas"
          icone={icone('anomalias')}
          descricao="Leituras muito diferentes do normal daquele equipamento naquela hora, com o esperado e o medido."
          consulta={anomalias}
          explicacao={() => EXPLICACAO_ANOMALIAS}
          tituloExplicacao="Como a detecção funciona"
        >
          {(a) => <ListaAnomalias alertas={a} bairros={bairros.data} limite={LIMITE_ANOMALIAS} />}
        </SecaoPrevisao>

        <SecaoPrevisao
          id="tendencias"
          titulo="Tendências"
          icone={icone('tendencias')}
          descricao="Para onde vai a disponibilidade de cada tipo de equipamento, como evolui o uso de patinetes e quais modelos mais falham."
          consulta={tendencias}
          explicacao={(r) => r.explicacao}
          alturaEsqueleto={620}
        >
          {(t) => <GraficosTendencias tendencias={t} />}
        </SecaoPrevisao>
      </div>
    </div>
  );
}
