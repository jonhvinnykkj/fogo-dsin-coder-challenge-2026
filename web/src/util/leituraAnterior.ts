// A métrica da ficha lateral é a média da hora corrente. Se a situação do equipamento mudou nessa hora (ou depois dela),
// a leitura mistura ou é só de antes da mudança: câmera "Mau funcionamento" com "100% conectado" confunde quem lê só o número.
import type { HistoricoSituacao } from '../../../shared/modelos';

/**
 * A mudança de situação mais recente, se ela não está coberta pela leitura (caiu dentro da hora da leitura ou depois dela);
 * `undefined` se a leitura já começou depois da última mudança. `horaDaLeitura` é o início da hora (ISO, UTC).
 */
export function mudancaDepoisDaLeitura(horaDaLeitura: string, historico: readonly HistoricoSituacao[]): HistoricoSituacao | undefined {
  let ultima: HistoricoSituacao | undefined;
  for (const h of historico) if (!ultima || Date.parse(h.em) > Date.parse(ultima.em)) ultima = h;
  return ultima && Date.parse(ultima.em) >= Date.parse(horaDaLeitura) ? ultima : undefined;
}
