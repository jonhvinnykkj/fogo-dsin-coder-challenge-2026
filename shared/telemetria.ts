// Métricas da telemetria por tipo de equipamento: o ÚNICO lugar que define os nomes das chaves.
// Usado pelo histórico sintético, pelo simulador e pelas anomalias (servidor) e pelo gráfico da ficha (interface).
// Em `telemetria_hora.metricas` cada chave guarda a MÉDIA da hora (contagens = total na hora).
// Leituras ao vivo podem mandar booleanos para `online` e `emUso`; a média da hora vira porcentagem (0 a 100).
import type { TipoEquipamentoId } from './tipos-equipamento';

export interface MetricaTelemetria {
  chave: string;
  rotulo: string;
  unidade: string;
}

const m = (chave: string, rotulo: string, unidade: string): MetricaTelemetria => ({ chave, rotulo, unidade });

const ONLINE = m('online', 'Conectado', '%');
const VELOCIDADE = m('velocidade', 'Velocidade média em movimento', 'km/h');
const KM_RODADOS = m('kmRodados', 'Distância percorrida', 'km');

export const METRICAS_POR_TIPO: Record<TipoEquipamentoId, MetricaTelemetria[]> = {
  radar: [m('fluxo', 'Fluxo de veículos', 'veículos/h'), m('velocidadeMedia', 'Velocidade média da via', 'km/h'), m('infracoes', 'Infrações registradas', 'infrações/h')],
  camera: [ONLINE, m('fps', 'Quadros por segundo', 'qps')],
  balanca: [m('pesagens', 'Pesagens', 'pesagens/h'), m('excessoPeso', 'Excessos de peso', 'excessos/h')],
  fiscal_rotativo: [m('placasLidas', 'Placas lidas', 'placas/h'), KM_RODADOS],
  cancela: [m('aberturas', 'Aberturas', 'aberturas/h')],
  transporte: [VELOCIDADE, KM_RODADOS],
  totem_rotativo: [m('transacoes', 'Transações', 'transações/h'), ONLINE],
  patinete: [m('bateria', 'Bateria', '%'), m('emUso', 'Tempo em uso', '%')],
  moto_agente: [VELOCIDADE, KM_RODADOS],
  viatura: [VELOCIDADE, KM_RODADOS],
  semaforo: [ONLINE, m('falhasFase', 'Falhas de fase', 'falhas/h')],
  painel_mensagem: [ONLINE],
  sensor_alagamento: [m('nivelCm', 'Nível da água', 'cm')],
};

/** Métrica mostrada em destaque (gráfico da ficha) e vigiada primeiro pelas anomalias. */
export const METRICA_PRINCIPAL: Record<TipoEquipamentoId, string> = {
  radar: 'fluxo',
  camera: 'online',
  balanca: 'pesagens',
  fiscal_rotativo: 'placasLidas',
  cancela: 'aberturas',
  transporte: 'velocidade',
  totem_rotativo: 'transacoes',
  patinete: 'bateria',
  moto_agente: 'velocidade',
  viatura: 'velocidade',
  semaforo: 'online',
  painel_mensagem: 'online',
  sensor_alagamento: 'nivelCm',
};

export function metricaDoTipo(tipo: TipoEquipamentoId, chave: string): MetricaTelemetria | undefined {
  return METRICAS_POR_TIPO[tipo].find((x) => x.chave === chave);
}
