// Conexão de tempo real com o servidor (Server-Sent Events em /api/stream).
//
// - Cada evento é aplicado direto no cache do TanStack Query (mapa, alertas, indicadores, relógio…): a tela muda sem
//   perguntar nada ao servidor.
// - Se a conexão cai (servidor reiniciou, Wi-Fi piscou, notebook dormiu), ela volta sozinha. Ao voltar, a tela
//   ressincroniza: busca de novo mapa, indicadores, alertas e regiões, porque eventos daquele intervalo se perderam.
// - O navegador já reconecta sozinho na maioria das quedas (`retry: 3000` do servidor). Quando ele desiste (o proxy
//   respondeu 502 com o servidor fora do ar) ou a conexão fica muda sem avisar (notebook acordando), quem reabre é este hook.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { EstadoInicialStream, EventoFogo } from '../../../shared/modelos';
import { aplicarEvento, aplicarIndicadores, aplicarSimulacao, ressincronizar } from './aplicarNoCache';

export const URL_STREAM = '/api/stream';
const EVENTOS: EventoFogo['tipo'][] = ['posicoes', 'equipamento', 'agente', 'alerta', 'ocorrencia', 'indicadores', 'simulacao'];

const FECHADA = 2; // EventSource.CLOSED
/** Espera antes de abrir outra conexão quando o navegador desistiu (o mesmo `retry` que o servidor manda). */
const ESPERA_REABRIR_MS = 3000;
/** O servidor manda indicadores a cada 5 s; 35 s sem nada é conexão morta. */
const SILENCIO_MAXIMO_MS = 35_000;
const VIGIA_MS = 5000;

export interface EstadoStream {
  conectado: boolean;
  ultimoEvento?: EventoFogo;
}

export function useStream(): EstadoStream {
  const qc = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const [ultimoEvento, setUltimoEvento] = useState<EventoFogo>();

  useEffect(() => {
    let fonte: EventSource | undefined;
    let caiu = false; // houve queda desde a última abertura → ressincronizar quando abrir
    let encerrado = false;
    let ultimoSinal = Date.now();
    let reabrir: ReturnType<typeof setTimeout> | undefined;

    const conectar = () => {
      if (encerrado) return;
      clearTimeout(reabrir);
      fonte?.close();
      const atual = new EventSource(URL_STREAM);
      fonte = atual;
      ultimoSinal = Date.now();
      const ativa = () => fonte === atual && !encerrado;

      atual.addEventListener('open', () => {
        if (!ativa()) return;
        ultimoSinal = Date.now();
        setConectado(true);
        if (caiu) {
          caiu = false;
          ressincronizar(qc);
        }
      });

      atual.addEventListener('error', () => {
        if (!ativa()) return;
        caiu = true;
        setConectado(false);
        if (atual.readyState === FECHADA) {
          clearTimeout(reabrir);
          reabrir = setTimeout(conectar, ESPERA_REABRIR_MS);
        }
      });

      atual.addEventListener('estado', (ev) => {
        if (!ativa()) return;
        ultimoSinal = Date.now();
        const estado = JSON.parse((ev as MessageEvent<string>).data) as EstadoInicialStream;
        aplicarSimulacao(qc, estado.simulacao);
        if (estado.indicadores) aplicarIndicadores(qc, estado.indicadores);
      });

      for (const nome of EVENTOS) {
        atual.addEventListener(nome, (ev) => {
          if (!ativa()) return;
          ultimoSinal = Date.now();
          let evento: EventoFogo;
          try {
            evento = JSON.parse((ev as MessageEvent<string>).data) as EventoFogo;
          } catch {
            return; // mensagem corrompida: ignora, a próxima traz o estado certo
          }
          aplicarEvento(qc, evento);
          setUltimoEvento(evento);
        });
      }
    };

    /** Conexão muda há tempo demais: fecha e abre outra (conta como queda, então ressincroniza). */
    const conferirSilencio = () => {
      if (encerrado || Date.now() - ultimoSinal <= SILENCIO_MAXIMO_MS) return;
      caiu = true;
      setConectado(false);
      conectar();
    };

    const vigia = setInterval(conferirSilencio, VIGIA_MS);
    const aoVoltarRede = () => {
      if (fonte?.readyState !== 1) {
        caiu = true;
        conectar();
      }
    };
    const aoVoltarAba = () => {
      if (document.visibilityState === 'visible') conferirSilencio();
    };
    window.addEventListener('online', aoVoltarRede);
    document.addEventListener('visibilitychange', aoVoltarAba);

    conectar();

    return () => {
      encerrado = true;
      clearTimeout(reabrir);
      clearInterval(vigia);
      window.removeEventListener('online', aoVoltarRede);
      document.removeEventListener('visibilitychange', aoVoltarAba);
      fonte?.close();
    };
  }, [qc]);

  return ultimoEvento ? { conectado, ultimoEvento } : { conectado };
}
