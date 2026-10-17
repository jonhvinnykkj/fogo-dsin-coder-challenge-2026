// Relógio da simulação na faixa do topo. O servidor manda o relógio (evento `estado`/`simulacao` do SSE, ou
// GET /api/simulacao) e a tela anda sozinha a partir dele, corrigindo a diferença entre o relógio do servidor e o do
// navegador. A velocidade (1×, 10×, 60×) acelera os acontecimentos da cidade, não os ponteiros.
import { Clock, Pause } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useSimulacao } from '../api/consultas';
import estilos from './RelogioSimulacao.module.css';

const FUSO = 'America/Sao_Paulo';
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function RelogioSimulacao() {
  const { data: simulacao, dataUpdatedAt } = useSimulacao();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!simulacao) return null;

  const diferenca = new Date(simulacao.relogio).getTime() - dataUpdatedAt;
  const instante = new Date(agora + diferenca);
  const [hh, mm, ss] = fmtHora.format(instante).split(':');
  const data = fmtData.format(instante).replace(/\.,/, ',');

  return (
    <div className={estilos.relogio} title="Relógio da simulação (horário de Marília)">
      <span className="so-leitor">Relógio da simulação:</span>
      <Clock weight="fill" size={18} aria-hidden="true" className={estilos.icone} />
      <span className={estilos.data}>{data}</span>
      <time className={`${estilos.hora} numeros`} dateTime={instante.toISOString()}>
        {hh}:{mm}
        <span className={estilos.segundos}>:{ss}</span>
      </time>
      {simulacao.pausado ? (
        <span className={`${estilos.velocidade} ${estilos.pausada}`}>
          <Pause weight="fill" size={12} aria-hidden="true" />
          Pausada
        </span>
      ) : (
        <span className={`${estilos.velocidade} numeros`} title="Velocidade da simulação">
          <span className="so-leitor">Velocidade </span>
          {simulacao.velocidade}×
        </span>
      )}
    </div>
  );
}
