// Anomalias das últimas 24 horas: alertas `anomalia_leitura` com o esperado × o medido (lidos da descrição que o servidor
// escreve). Abertas primeiro, depois as mais recentes. Novas chegam pelo tempo real (o cache de alertas já é vivo).
import { ArrowDown, ArrowUp, Pulse } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatarNumero, formatarRelativo } from '../../../shared/formato';
import type { Alerta, Bairro, ExplicacaoPrevisao } from '../../../shared/modelos';
import { lerAnomalia } from '../util/anomalia';
import { useAgora } from '../util/useAgora';
import { Botao } from './Botao';
import { EstadoVazio } from './EstadoVazio';
import { EtiquetaCriticidade } from './EtiquetaAlerta';
import estilos from './ListaAnomalias.module.css';

export const POR_VEZ = 8;

/**
 * O servidor não manda `explicacao` para as anomalias (elas viram alertas, não uma rota de previsão). Este texto descreve o
 * detector de server/tempo-real/anomalias.ts e as regras de server/tempo-real/motor-alertas.ts. Ainda não há uma medida de
 * acerto (quantos alertas eram mesmo falha), então a confiabilidade fica vazia e o cartão diz isso.
 */
export const EXPLICACAO_ANOMALIAS: ExplicacaoPrevisao = {
  oQuePreve: 'Leituras de equipamento muito fora do normal daquele equipamento naquela hora: radar zerado no pico, velocidade despencando, excessos de peso seguidos, bateria ou conexão caindo.',
  dadosUsados: [
    'Telemetria de hora em hora de cada equipamento (fluxo, velocidade, conexão, bateria, pesagens…)',
    'O normal de cada equipamento: média e variação das próprias leituras na mesma hora, em dias parecidos (dia útil, sábado ou domingo), sem as horas em que ficou desconectado',
    'Pelo menos 5 dias parecidos de histórico antes de julgar uma leitura',
  ],
  comoAjuda: 'Avisa antes da reclamação: a leitura a 3 variações habituais ou mais do normal, em 2 leituras seguidas ou muito fora de uma vez, vira alerta com o esperado e o medido. O alerta fecha sozinho após 3 leituras normais seguidas.',
  confiabilidade: [],
};

interface Props {
  alertas: Alerta[];
  bairros: Bairro[] | undefined;
  /**
   * Limite da consulta (`/api/alertas` devolve no máximo `limite`, mais recentes primeiro, sem o total). Se vier exatamente
   * o limite, pode haver mais: a contagem vira "200+" e as abertas são contadas entre as mais recentes.
   */
  limite?: number;
}

const situacao = (a: Alerta) => (!a.resolvidoEm ? 'Aberta' : a.resolucao === 'automatica' ? 'Fechou sozinha' : 'Resolvida');

export function ListaAnomalias({ alertas, bairros, limite }: Props) {
  const agora = useAgora(30_000);
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const nomes = useMemo(() => new Map((bairros ?? []).map((b) => [b.id, b.nome])), [bairros]);
  const ordenadas = useMemo(
    () => [...alertas].sort((a, b) => Number(Boolean(a.resolvidoEm)) - Number(Boolean(b.resolvidoEm)) || b.criadoEm.localeCompare(a.criadoEm)),
    [alertas],
  );
  const abertas = alertas.filter((a) => !a.resolvidoEm).length;

  if (alertas.length === 0) {
    return (
      <EstadoVazio
        icone={<Pulse weight="fill" />}
        titulo="Nenhuma leitura fora do normal nas últimas 24 horas"
        descricao="Quando um equipamento medir muito diferente do que costuma naquela hora, o alerta aparece aqui com o esperado e o medido."
      />
    );
  }

  return (
    <div className={estilos.anomalias}>
      {limite !== undefined && alertas.length >= limite ? (
        <p className={estilos.resumo}>
          <strong className="numeros">{formatarNumero(limite)}+</strong> leituras fora do normal nas últimas 24 horas. Entre as {formatarNumero(limite)} mais recentes,{' '}
          <strong className="numeros">{formatarNumero(abertas)}</strong> {abertas === 1 ? 'continua aberta' : 'continuam abertas'}.
        </p>
      ) : (
        <p className={estilos.resumo}>
          <strong className="numeros">{formatarNumero(alertas.length)}</strong> {alertas.length === 1 ? 'leitura fora do normal' : 'leituras fora do normal'} nas últimas 24 horas;{' '}
          <strong className="numeros">{formatarNumero(abertas)}</strong> {abertas === 1 ? 'continua aberta' : 'continuam abertas'}.
        </p>
      )}

      <ul className={estilos.lista}>
        {ordenadas.slice(0, mostrar).map((a) => {
          const leitura = lerAnomalia(a.descricao);
          const bairro = a.bairroId !== undefined ? nomes.get(a.bairroId) : undefined;
          return (
            <li key={a.id} className={estilos.item} data-aberta={!a.resolvidoEm || undefined}>
              <div className={estilos.cabeca}>
                <EtiquetaCriticidade criticidade={a.criticidade} />
                <strong className={estilos.titulo}>{a.titulo}</strong>
              </div>
              <p className={estilos.meta}>
                <span>{formatarRelativo(a.criadoEm, agora)}</span>
                <span className={estilos.situacao} data-situacao={situacao(a)}>{situacao(a)}</span>
                {bairro && <span>{bairro}</span>}
                {a.equipamentoId !== undefined && <Link to={`/equipamentos/${a.equipamentoId}`} className={estilos.ficha}>Abrir ficha</Link>}
              </p>

              {leitura ? (
                <div className={estilos.comparacao}>
                  <span className={estilos.metrica}>{leitura.metrica}</span>
                  <div className={estilos.par}>
                    <span className={estilos.valorEsperado}>
                      <span className={estilos.rotuloValor}>Esperado</span>
                      <span className={`${estilos.numero} numeros`}>{leitura.esperado}</span>
                      <span className={estilos.unidade}>{leitura.unidade}</span>
                    </span>
                    <span className={estilos.valorMedido}>
                      <span className={estilos.rotuloValor}>Medido</span>
                      <span className={`${estilos.numero} numeros`}>{leitura.medido}</span>
                      <span className={estilos.unidade}>{leitura.unidade}</span>
                    </span>
                  </div>
                  <span className={estilos.sentido}>
                    {leitura.sentido === 'abaixo' ? <ArrowDown weight="fill" size={14} aria-hidden="true" /> : <ArrowUp weight="fill" size={14} aria-hidden="true" />}
                    {leitura.sentido} do normal; costuma variar {leitura.variacao} em {leitura.dias} dias parecidos
                  </span>
                </div>
              ) : (
                <p className={estilos.descricao}>{a.descricao}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className={estilos.rodape}>
        {mostrar < ordenadas.length && (
          <Botao variante="secundario" onClick={() => setMostrar((m) => m + POR_VEZ)}>
            Mostrar mais {Math.min(POR_VEZ, ordenadas.length - mostrar)}
          </Botao>
        )}
        <Link to="/alertas?tipo=anomalia_leitura&status=todos" className={estilos.todas}>Ver todas na tela de Alertas</Link>
      </div>
    </div>
  );
}
