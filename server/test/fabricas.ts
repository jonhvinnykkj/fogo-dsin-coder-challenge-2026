// Cargas válidas para os testes de API. Cada função aceita `sobrescreve` para variar um campo.
import type { ContextoApp } from '../contexto';
import { hashTokenDispositivo } from '../seguranca/cripto';

/** Corpo válido de POST /api/equipamentos (um radar no primeiro bairro). */
export function corpoEquipamento(ctx: ContextoApp, sobrescreve: Record<string, unknown> = {}): Record<string, unknown> {
  const bairro = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  return {
    tipo: 'radar',
    numeroSerie: 'SN-0001',
    marca: 'Kapsch',
    modelo: 'TC-100',
    orgao: 'Secretaria de Mobilidade Urbana',
    situacao: 'operacional',
    cep: '17500-000',
    logradouro: 'Avenida Sampaio Vidal',
    referencia: 'nº 181',
    bairroId: bairro.id,
    lat: bairro.lat,
    lng: bairro.lng,
    manutencaoNecessidade: 'nenhuma',
    caracteristicas: { modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 2, sentido: 'Centro' },
    ...sobrescreve,
  };
}

/** Corpo válido de POST /api/agentes. */
export function corpoAgente(ctx: ContextoApp, sobrescreve: Record<string, unknown> = {}): Record<string, unknown> {
  const bairro = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  return {
    nome: 'Carlos Henrique Souza',
    matricula: 'AT-1001',
    categoria: 'agente_transito',
    orgao: 'Secretaria de Mobilidade Urbana',
    situacao: 'em_servico',
    turno: 'manha',
    baseLogradouro: 'Rua Paraíba',
    baseBairroId: bairro.id,
    lat: bairro.lat,
    lng: bairro.lng,
    ...sobrescreve,
  };
}

// ---- Cidade pequena para os testes de tempo real ----

export interface EquipamentoDeTeste {
  tipo: string;
  codigo: string;
  situacao?: string;
  token?: string;
  lat?: number;
  lng?: number;
  logradouro?: string;
  ultimoSinalEm?: string | null;
  caracteristicas?: Record<string, unknown>;
  proximaManutencao?: string | null;
}

/** Insere um equipamento direto no banco (sem validar o tipo) e devolve o id. Usa o primeiro bairro. */
export function inserirEquipamentoDeTeste(ctx: ContextoApp, e: EquipamentoDeTeste): number {
  const b = ctx.db.prepare('SELECT id, lat, lng FROM bairros ORDER BY id LIMIT 1').get() as { id: number; lat: number; lng: number };
  const lat = e.lat ?? b.lat;
  const lng = e.lng ?? b.lng;
  const agora = '2026-10-01T12:00:00.000Z';
  const r = ctx.db.prepare(`INSERT INTO equipamentos (codigo, tipo, numero_serie, marca, modelo, orgao, situacao, cep, logradouro, referencia, bairro_id,
      lat, lng, lat_atual, lng_atual, manutencao_necessidade, proxima_manutencao, caracteristicas, ultimo_sinal_em, token_dispositivo, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'Marca', 'Modelo', 'Secretaria de Mobilidade Urbana', ?, '17500-000', ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    e.codigo, e.tipo, `SN-${e.codigo}`, e.situacao ?? 'operacional', e.logradouro ?? 'Avenida Sampaio Vidal', b.id, lat, lng, lat, lng,
    e.proximaManutencao ? 'periodica' : 'nenhuma', e.proximaManutencao ?? null, JSON.stringify(e.caracteristicas ?? {}),
    e.ultimoSinalEm === undefined ? null : e.ultimoSinalEm, hashTokenDispositivo(e.token ?? `token-${e.codigo}`), agora, agora,
  );
  return Number(r.lastInsertRowid);
}

/** Uma linha de telemetria_hora (métricas já como média da hora). */
export function inserirTelemetriaDeTeste(ctx: ContextoApp, equipamentoId: number, hora: string, metricas: Record<string, number>, onlineMin = 60): void {
  ctx.db.prepare('INSERT OR REPLACE INTO telemetria_hora (equipamento_id, hora, leituras, online_min, metricas) VALUES (?, ?, ?, ?, ?)')
    .run(equipamentoId, hora, onlineMin, onlineMin, JSON.stringify(metricas));
}
