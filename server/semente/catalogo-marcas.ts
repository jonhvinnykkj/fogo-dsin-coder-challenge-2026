// Marcas e modelos plausíveis por tipo de equipamento, com a confiabilidade (0 a 1) de cada modelo e o
// formato do número de série da marca. As marcas reais aparecem só como referência de mercado: os códigos
// de modelo e as confiabilidades são fictícios. O modelo claramente pior (Vigilux VX-200) é inventado.
//
// A confiabilidade entra no histórico como multiplicador da chance de falha: fatorFalhaModelo(c) = (1 − c) / 0,08.
// Um modelo com 0,92 tem fator 1; o VX-200 (0,77) tem fator ≈ 2,9 contra ≈ 0,86 da média dos outros modelos
// de câmera — falha ~3× mais.
import type { TipoEquipamentoId } from '../../shared/tipos-equipamento';
import type { Rng } from './aleatorio';

export interface ModeloCatalogo {
  marca: string;
  modelo: string;
  /** 0 a 1: quanto mais alto, menos falha. */
  confiabilidade: number;
  /** Peso do modelo na frota do tipo. */
  participacao: number;
  /** Número de série no formato da marca (`ano` = ano de fabricação). */
  serie: (rng: Rng, ano: number) => string;
  /** Só para `transporte`: categoria do veículo. */
  categoria?: 'táxi' | 'mototáxi' | 'escolar';
  /** Características fixas do modelo (completadas na geração da cidade). */
  ficha?: Record<string, unknown>;
}

const dig = (rng: Rng, n: number) => {
  let s = '';
  for (let i = 0; i < n; i++) s += rng.int(0, 9);
  return s;
};
const aa = (ano: number) => String(ano % 100).padStart(2, '0');
const LETRAS_VIN = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const ANO_VIN: Record<number, string> = {
  2016: 'G', 2017: 'H', 2018: 'J', 2019: 'K', 2020: 'L', 2021: 'M', 2022: 'N', 2023: 'P', 2024: 'R', 2025: 'S', 2026: 'T',
};

/** Chassi (VIN de 17 caracteres) com o identificador do fabricante `wmi`. */
const chassi = (wmi: string) => (rng: Rng, ano: number) => {
  let vds = '';
  for (let i = 0; i < 5; i++) vds += LETRAS_VIN[rng.int(0, 22)];
  return `${wmi}${vds}${rng.int(0, 9)}${ANO_VIN[ano] ?? 'T'}${LETRAS_VIN[rng.int(0, 22)]}${dig(rng, 6)}`;
};

export const CATALOGO_MARCAS: Record<TipoEquipamentoId, ModeloCatalogo[]> = {
  radar: [
    { marca: 'Perkons', modelo: 'PK-7000', confiabilidade: 0.92, participacao: 0.4, serie: (r, a) => `PK${aa(a)}-${dig(r, 6)}` },
    { marca: 'Velsis', modelo: 'VR-3 Sentinel', confiabilidade: 0.94, participacao: 0.35, serie: (r, a) => `VLS${a}${dig(r, 5)}` },
    { marca: 'Pumatronix', modelo: 'ITS-450', confiabilidade: 0.9, participacao: 0.25, serie: (r) => `ITS450${dig(r, 7)}` },
  ],
  camera: [
    { marca: 'Hikvision', modelo: 'DS-2DE4425 PTZ', confiabilidade: 0.93, participacao: 0.24, serie: (r, a) => `HK${aa(a)}${LETRAS_VIN[r.int(0, 22)]}${dig(r, 7)}`,
      ficha: { resolucao: '1080p', ptz: true, angulo: 360, visaoNoturna: true, colorida: true } },
    { marca: 'Intelbras', modelo: 'VIP 3230', confiabilidade: 0.92, participacao: 0.26, serie: (r) => `VIP3230${dig(r, 8)}`,
      ficha: { resolucao: '1080p', ptz: false, angulo: 100, visaoNoturna: true, colorida: true } },
    { marca: 'Axis', modelo: 'Q1798-LE', confiabilidade: 0.95, participacao: 0.18, serie: (r) => `ACCC8E${r.hex(6).toUpperCase()}`,
      ficha: { resolucao: '4K', ptz: false, angulo: 90, visaoNoturna: true, colorida: true } },
    { marca: 'Vigilux', modelo: 'VX-200', confiabilidade: 0.77, participacao: 0.32, serie: (r, a) => `VX200-${aa(a)}-${dig(r, 5)}`,
      ficha: { resolucao: '720p', ptz: false, angulo: 90, visaoNoturna: false, colorida: true } },
  ],
  balanca: [
    { marca: 'Toledo', modelo: 'PW-9000 WIM', confiabilidade: 0.93, participacao: 0.5, serie: (r, a) => `TLD${a}${dig(r, 5)}` },
    { marca: 'Kistler', modelo: 'Lineas 9195', confiabilidade: 0.95, participacao: 0.5, serie: (r) => `KI9195-${dig(r, 6)}` },
  ],
  fiscal_rotativo: [
    { marca: 'Renault', modelo: 'Kwid E-Tech', confiabilidade: 0.92, participacao: 0.5, serie: chassi('93Y') },
    { marca: 'BYD', modelo: 'Dolphin Mini', confiabilidade: 0.94, participacao: 0.5, serie: chassi('LGX') },
  ],
  cancela: [
    { marca: 'Nice', modelo: 'Wil 6', confiabilidade: 0.92, participacao: 0.4, serie: (r) => `NCW6${dig(r, 7)}` },
    { marca: 'PPA', modelo: 'Barreira BR-6', confiabilidade: 0.9, participacao: 0.3, serie: (r, a) => `PPA${aa(a)}${dig(r, 6)}` },
    { marca: 'Came', modelo: 'Gard 4', confiabilidade: 0.94, participacao: 0.3, serie: (r) => `CMG4-${dig(r, 6)}` },
  ],
  transporte: [
    { marca: 'Chevrolet', modelo: 'Spin 1.8', confiabilidade: 0.92, participacao: 0.6, categoria: 'táxi', serie: chassi('9BG') },
    { marca: 'Toyota', modelo: 'Corolla Cross', confiabilidade: 0.95, participacao: 0.4, categoria: 'táxi', serie: chassi('9BR') },
    { marca: 'Honda', modelo: 'CG 160 Fan', confiabilidade: 0.93, participacao: 0.6, categoria: 'mototáxi', serie: chassi('9C2') },
    { marca: 'Yamaha', modelo: 'Factor 150', confiabilidade: 0.92, participacao: 0.4, categoria: 'mototáxi', serie: chassi('9C6') },
    { marca: 'Mercedes-Benz', modelo: 'Sprinter 416', confiabilidade: 0.93, participacao: 0.4, categoria: 'escolar', serie: chassi('8AC') },
    { marca: 'Volare', modelo: 'W9 Escolar', confiabilidade: 0.91, participacao: 0.35, categoria: 'escolar', serie: chassi('93P') },
    { marca: 'Renault', modelo: 'Master Escolar', confiabilidade: 0.92, participacao: 0.25, categoria: 'escolar', serie: chassi('93Y') },
  ],
  totem_rotativo: [
    { marca: 'Digicon', modelo: 'DT-500', confiabilidade: 0.91, participacao: 0.5, serie: (r) => `DGT500${dig(r, 6)}` },
    { marca: 'Taxlog', modelo: 'AutoPark 2', confiabilidade: 0.93, participacao: 0.5, serie: (r, a) => `TXL-${aa(a)}${dig(r, 5)}` },
  ],
  patinete: [
    { marca: 'Segway-Ninebot', modelo: 'Max G30', confiabilidade: 0.9, participacao: 0.45, serie: (r, a) => `N4GSD${aa(a)}${dig(r, 7)}` },
    { marca: 'Xiaomi', modelo: 'Scooter 4 Pro', confiabilidade: 0.88, participacao: 0.3, serie: (r, a) => `${dig(r, 5)}/${aa(a)}${dig(r, 6)}` },
    { marca: 'Okai', modelo: 'ES400', confiabilidade: 0.89, participacao: 0.25, serie: (r) => `OKES4${dig(r, 8)}` },
  ],
  moto_agente: [
    { marca: 'Honda', modelo: 'XRE 300', confiabilidade: 0.94, participacao: 0.6, serie: chassi('9C2') },
    { marca: 'Yamaha', modelo: 'XTZ 250 Lander', confiabilidade: 0.93, participacao: 0.4, serie: chassi('9C6') },
  ],
  viatura: [
    { marca: 'Chevrolet', modelo: 'Spin Premier', confiabilidade: 0.92, participacao: 0.4, serie: chassi('9BG') },
    { marca: 'Renault', modelo: 'Duster', confiabilidade: 0.93, participacao: 0.35, serie: chassi('93Y') },
    { marca: 'Toyota', modelo: 'Hilux SW4', confiabilidade: 0.95, participacao: 0.25, serie: chassi('9BR') },
  ],
  semaforo: [
    { marca: 'Tesc', modelo: 'CTS-12', confiabilidade: 0.93, participacao: 0.45, serie: (r) => `CTS12-${dig(r, 6)}` },
    { marca: 'Digicon', modelo: 'Contrail 4', confiabilidade: 0.91, participacao: 0.3, serie: (r) => `DGC4${dig(r, 7)}` },
    { marca: 'Siemens', modelo: 'Sitraffic sX', confiabilidade: 0.95, participacao: 0.25, serie: (r, a) => `SX${aa(a)}${dig(r, 7)}` },
  ],
  painel_mensagem: [
    { marca: 'Digiflex', modelo: 'PMV-48', confiabilidade: 0.92, participacao: 0.6, serie: (r) => `DFX48${dig(r, 6)}` },
    { marca: 'Luminex', modelo: 'LX-PMV 3', confiabilidade: 0.94, participacao: 0.4, serie: (r) => `LX3-${dig(r, 7)}` },
  ],
  sensor_alagamento: [
    { marca: 'Hidromet', modelo: 'HN-30', confiabilidade: 0.93, participacao: 0.55, serie: (r, a) => `HN30${aa(a)}${dig(r, 5)}` },
    { marca: 'Senix', modelo: 'ToughSonic 14', confiabilidade: 0.95, participacao: 0.45, serie: (r) => `TS14-${dig(r, 7)}` },
  ],
};

/** Confiabilidade usada para modelos fora do catálogo (cadastrados pelo usuário). */
export const CONFIABILIDADE_PADRAO = 0.9;

const POR_NOME = new Map<string, ModeloCatalogo>();
for (const modelos of Object.values(CATALOGO_MARCAS)) for (const m of modelos) POR_NOME.set(`${m.marca}|${m.modelo}`, m);

export function confiabilidadeDoModelo(marca: string, modelo: string): number {
  return POR_NOME.get(`${marca}|${modelo}`)?.confiabilidade ?? CONFIABILIDADE_PADRAO;
}

/** Multiplicador da chance de falha: 1 para confiabilidade 0,92; cresce rápido abaixo de 0,9. */
export function fatorFalhaModelo(confiabilidade: number): number {
  return Math.max(0.2, (1 - confiabilidade) / 0.08);
}

/** O modelo claramente pior da frota (menor confiabilidade do catálogo). */
export const MODELO_POUCO_CONFIAVEL: { tipo: TipoEquipamentoId; marca: string; modelo: string; confiabilidade: number } = (() => {
  let pior: { tipo: TipoEquipamentoId; marca: string; modelo: string; confiabilidade: number } | null = null;
  for (const [tipo, modelos] of Object.entries(CATALOGO_MARCAS) as [TipoEquipamentoId, ModeloCatalogo[]][]) {
    for (const m of modelos) {
      if (!pior || m.confiabilidade < pior.confiabilidade) pior = { tipo, marca: m.marca, modelo: m.modelo, confiabilidade: m.confiabilidade };
    }
  }
  return pior!;
})();
