// Ingestão de telemetria: o caminho que TODA leitura percorre, venha de um dispositivo real (POST /api/telemetria)
// ou do simulador. O simulador não tem atalho: ele chama esta mesma função.
//
// O que uma leitura faz:
//   1. atualiza `ultimo_sinal_em` (nunca para trás) e, se veio com lat/lng, a posição atual;
//   2. soma-se à linha da hora corrente em `telemetria_hora` (média corrida das métricas, leituras + 1);
//   3. passa pelo motor de alertas (anomalia contra o normal do horário, furto, alagamento);
//   4. a posição vai para o barramento, que a agrupa num evento `posicoes` a cada 2 s.
import type { Database } from 'better-sqlite3';
import type { Alerta } from '../../shared/modelos';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import type { ContextoApp } from '../contexto';
import { invalido, naoEncontrado } from '../erros';
import { inicioDaHora } from '../tempo';
import { alvoPorCodigo } from './motor-alertas';

export interface LeituraTelemetria {
  codigo: string;
  /** Hora da leitura (ISO 8601); padrão: agora. */
  em?: string;
  /** Chaves de `METRICAS_POR_TIPO`. Booleanos de `online` e `emUso` viram 100 ou 0. */
  metricas: Record<string, number | boolean>;
  lat?: number;
  lng?: number;
}

type ContextoIngestao = Pick<ContextoApp, 'db' | 'barramento' | 'relogio' | 'motor'>;

/** Tolerância para relógio adiantado do dispositivo: leitura "do futuro" passa a valer agora. */
const FUTURO_TOLERADO_MS = 5 * 60_000;

export function ingerirTelemetria(ctx: ContextoIngestao, leitura: LeituraTelemetria): { aceita: true; alertas: Alerta[] } {
  const alvo = alvoPorCodigo(ctx.db, leitura.codigo);
  if (!alvo) throw naoEncontrado('Equipamento');

  const permitidas = new Set(METRICAS_POR_TIPO[alvo.tipo].map((m) => m.chave));
  const desconhecida = Object.keys(leitura.metricas).find((k) => !permitidas.has(k));
  if (desconhecida) {
    throw invalido(`Métrica "${desconhecida}" não existe para este tipo de equipamento. Use: ${[...permitidas].join(', ')}`);
  }
  if ((leitura.lat === undefined) !== (leitura.lng === undefined)) throw invalido('Envie lat e lng juntos (ou nenhum dos dois)');

  const agora = ctx.relogio.agora();
  const informada = leitura.em ? new Date(leitura.em) : agora;
  if (Number.isNaN(informada.getTime())) throw invalido('Hora da leitura inválida: use ISO 8601');
  const em = informada.getTime() > agora.getTime() + FUTURO_TOLERADO_MS ? agora : informada;

  const metricas: Record<string, number> = {};
  for (const [chave, v] of Object.entries(leitura.metricas)) metricas[chave] = typeof v === 'boolean' ? (v ? 100 : 0) : v;

  ctx.db.transaction(() => {
    const iso = em.toISOString();
    if (leitura.lat !== undefined && leitura.lng !== undefined) {
      ctx.db.prepare(`UPDATE equipamentos SET lat_atual = ?, lng_atual = ?,
        ultimo_sinal_em = CASE WHEN ultimo_sinal_em IS NULL OR ultimo_sinal_em < ? THEN ? ELSE ultimo_sinal_em END WHERE id = ?`)
        .run(leitura.lat, leitura.lng, iso, iso, alvo.id);
    } else {
      ctx.db.prepare('UPDATE equipamentos SET ultimo_sinal_em = ? WHERE id = ? AND (ultimo_sinal_em IS NULL OR ultimo_sinal_em < ?)').run(iso, alvo.id, iso);
    }
    somarNaHora(ctx.db, alvo.id, em, metricas);
  })();

  const posicao = leitura.lat !== undefined && leitura.lng !== undefined ? { lat: leitura.lat, lng: leitura.lng } : undefined;
  if (posicao) ctx.barramento.registrarPosicao({ tipo: 'equipamento', id: alvo.id, ...posicao });

  // O motor enxerga a situação e a posição já atualizadas.
  const alertas = ctx.motor.avaliarLeitura(posicao ? { ...alvo, ...posicao } : alvo, leitura.metricas, em, posicao);
  return { aceita: true, alertas };
}

/**
 * Soma a leitura à linha da hora corrente (equipamento, hora): `leituras + 1` e média corrida de cada métrica.
 * A leitura é uma taxa na mesma unidade da métrica (veículos/h, %, cm…), então a média das leituras da hora é o valor da hora.
 * `online_min` = minutos da hora já cobertos (até o minuto desta leitura).
 */
function somarNaHora(db: Database, equipamentoId: number, em: Date, metricas: Record<string, number>): void {
  const hora = inicioDaHora(em).toISOString();
  const atual = db.prepare('SELECT leituras, online_min, metricas FROM telemetria_hora WHERE equipamento_id = ? AND hora = ?').get(equipamentoId, hora) as
    | { leituras: number; online_min: number; metricas: string }
    | undefined;
  const minutoNaHora = Math.floor((em.getTime() - inicioDaHora(em).getTime()) / 60_000) + 1;
  if (!atual) {
    db.prepare('INSERT INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, ?, 1, ?, ?)')
      .run(equipamentoId, hora, Math.min(60, minutoNaHora), JSON.stringify(metricas));
    return;
  }
  const n = atual.leituras;
  const somadas = JSON.parse(atual.metricas) as Record<string, number>;
  for (const [chave, v] of Object.entries(metricas)) {
    const antes = somadas[chave];
    somadas[chave] = antes === undefined ? v : Math.round(((antes * n + v) / (n + 1)) * 1000) / 1000;
  }
  db.prepare('UPDATE telemetria_hora SET leituras = ?, online_min = ?, metricas = ? WHERE equipamento_id = ? AND hora = ?')
    .run(n + 1, Math.min(60, Math.max(atual.online_min, minutoNaHora)), JSON.stringify(somadas), equipamentoId, hora);
}
