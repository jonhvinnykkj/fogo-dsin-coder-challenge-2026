// Cargas válidas para os testes de API. Cada função aceita `sobrescreve` para variar um campo.
import type { ContextoApp } from '../contexto';

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
