// Despachos ao vivo para o agente do Modo Campo, pelo mesmo /api/stream da Central.
//
// Ouvinte próprio, e não o "último evento" do provedor geral: um despacho chega junto com outros eventos do mesmo tick
// (ocorrência, agente, alerta) e o React juntaria tudo numa renderização só, perdendo a ocorrência. Aqui cada evento é
// tratado na hora. Se a conexão cair, o navegador reconecta; o despacho também se renova sozinho (useDespacho).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { EventoFogo, Ocorrencia } from '../../../shared/modelos';
import { chavesCampo } from '../api/campo';
import { chaves } from '../api/consultas';
import { URL_STREAM } from '../tempo-real/useStream';

const FECHADA = 2; // EventSource.CLOSED
const ESPERA_REABRIR_MS = 3000;

/** Cada `data` do /api/stream é o evento inteiro (`{ tipo, dados }`), como o useStream lê. */
function ler(ev: Event): EventoFogo | undefined {
  try {
    return JSON.parse((ev as MessageEvent<string>).data) as EventoFogo;
  } catch {
    return undefined; // mensagem corrompida: a próxima renovação do despacho cobre
  }
}

/** Chama `aoNovoDespacho` uma vez por ocorrência aberta que chega para este agente. */
export function useDespachosAoVivo(agenteId: number, aoNovoDespacho: (o: Ocorrencia) => void): { conectado: boolean } {
  const qc = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const aviso = useRef(aoNovoDespacho);
  aviso.current = aoNovoDespacho;

  useEffect(() => {
    const vistos = new Set<number>();
    let fonte: EventSource | undefined;
    let reabrir: ReturnType<typeof setTimeout> | undefined;
    let encerrado = false;

    const conectar = () => {
      if (encerrado) return;
      const atual = new EventSource(URL_STREAM);
      fonte = atual;
      atual.addEventListener('open', () => setConectado(true));
      atual.addEventListener('error', () => {
        setConectado(false);
        if (atual.readyState === FECHADA && !encerrado) reabrir = setTimeout(conectar, ESPERA_REABRIR_MS);
      });
      atual.addEventListener('ocorrencia', (ev) => {
        const e = ler(ev);
        if (e?.tipo !== 'ocorrencia' || e.dados.agenteId !== agenteId) return;
        const o = e.dados;
        void qc.invalidateQueries({ queryKey: chavesCampo.despacho(agenteId) });
        if (o.fim === undefined && !vistos.has(o.id)) {
          vistos.add(o.id);
          aviso.current(o);
        }
      });
      atual.addEventListener('agente', (ev) => {
        const e = ler(ev);
        if (e?.tipo === 'agente' && e.dados.id === agenteId) void qc.invalidateQueries({ queryKey: chaves.agente(agenteId) });
      });
    };

    conectar();
    return () => {
      encerrado = true;
      clearTimeout(reabrir);
      fonte?.close();
    };
  }, [agenteId, qc]);

  return { conectado };
}
