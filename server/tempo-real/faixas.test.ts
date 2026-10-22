// Faixas da telemetria: o que o dispositivo pode mandar, e a prova de que o simulador e a semente cabem nelas.
import { describe, expect, it } from 'vitest';
import { TIPOS_EQUIPAMENTO } from '../../shared/tipos-equipamento';
import { METRICAS_POR_TIPO } from '../../shared/telemetria';
import { criarRng } from '../semente/aleatorio';
import { gerarLeituraHora } from '../semente/perfis';
import { criarCtxDeTeste } from '../test/ctx';
import { inserirEquipamentoDeTeste } from '../test/fabricas';
import { conferirLeitura, faixaDaMetrica } from './faixas';
import { Simulador } from './simulador';

const AGORA = new Date('2026-10-17T15:00:00.000Z');
const falha = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as { campos?: Record<string, string> }).campos;
  }
  return undefined;
};

describe('conferirLeitura', () => {
  it('aceita uma leitura normal e booleanos', () => {
    expect(() => conferirLeitura('radar', { metricas: { fluxo: 412, velocidadeMedia: 48.5, infracoes: 3 } }, AGORA)).not.toThrow();
    expect(() => conferirLeitura('patinete', { metricas: { bateria: 80, emUso: true } }, AGORA)).not.toThrow();
  });

  it('recusa valores absurdos, negativos e que virariam Infinity na soma (1.7e308)', () => {
    expect(falha(() => conferirLeitura('radar', { metricas: { fluxo: 1.7e308 } }, AGORA))).toMatchObject({ 'metricas.fluxo': expect.stringContaining('entre 0 e') });
    expect(falha(() => conferirLeitura('radar', { metricas: { fluxo: -5 } }, AGORA))).toHaveProperty(['metricas.fluxo']);
    expect(falha(() => conferirLeitura('camera', { metricas: { online: 101, fps: 9999 } }, AGORA))).toMatchObject({
      'metricas.online': expect.stringContaining('entre 0 e 100'), 'metricas.fps': expect.any(String),
    });
    expect(falha(() => conferirLeitura('patinete', { metricas: { bateria: -1 } }, AGORA))).toHaveProperty(['metricas.bateria']);
    expect(falha(() => conferirLeitura('radar', { metricas: { fluxo: Number.POSITIVE_INFINITY } }, AGORA))).toHaveProperty(['metricas.fluxo']);
  });

  it('posição só de quem se move e dentro de Marília; patinete pode aparecer fora (é o furto), mas não no outro lado do mundo', () => {
    expect(falha(() => conferirLeitura('radar', { metricas: { fluxo: 1 }, lat: -22.21, lng: -49.95 }, AGORA))).toHaveProperty('lat');
    expect(() => conferirLeitura('viatura', { metricas: { velocidade: 40 }, lat: -22.21, lng: -49.95 }, AGORA)).not.toThrow();
    expect(falha(() => conferirLeitura('viatura', { metricas: { velocidade: 40 }, lat: 45, lng: 10 }, AGORA))).toHaveProperty('lat');
    expect(() => conferirLeitura('patinete', { metricas: { bateria: 50 }, lat: -22.1, lng: -50.05 }, AGORA)).not.toThrow(); // ~14 km: o furto simulado
    expect(falha(() => conferirLeitura('patinete', { metricas: { bateria: 50 }, lat: 45, lng: 10 }, AGORA))).toHaveProperty('lat');
  });

  it('hora: até 6 h atrás passa; mais que isso, não', () => {
    expect(() => conferirLeitura('radar', { metricas: { fluxo: 1 }, em: '2026-10-17T09:30:00.000Z' }, AGORA)).not.toThrow();
    expect(falha(() => conferirLeitura('radar', { metricas: { fluxo: 1 }, em: '2020-01-01T00:00:00.000Z' }, AGORA))).toHaveProperty('em');
  });
});

describe('o simulador e a semente cabem nas faixas', () => {
  it('gerarLeituraHora (semente e simulador) em todos os tipos, horas, chuva, falha e fatores de bairro', () => {
    const rng = criarRng(42);
    const base = Date.parse('2026-10-12T00:00:00.000Z');
    let conferidas = 0;
    for (const t of TIPOS_EQUIPAMENTO) {
      for (let h = 0; h < 24 * 7; h += 1) {
        for (const falhando of [false, true]) {
          for (const [chuva, chuvaMm] of [[false, 0], [true, 8], [true, 120]] as const) {
            for (const bairroFator of [0.4, 1, 2.2]) {
              const l = gerarLeituraHora(t.id, new Date(base + h * 3_600_000), rng, { chuva, chuvaMm, falhando, bairroFator, ...(h % 5 === 0 && { onlineMin: 20 }) });
              for (const m of METRICAS_POR_TIPO[t.id]) {
                const [min, max] = faixaDaMetrica(m.chave);
                const v = l[m.chave]!;
                expect(v, `${t.id}.${m.chave}`).toBeGreaterThanOrEqual(min);
                expect(v, `${t.id}.${m.chave}`).toBeLessThanOrEqual(max);
                conferidas += 1;
              }
            }
          }
        }
      }
    }
    expect(conferidas).toBeGreaterThan(10_000);
  });

  it('uma hora de simulação acelerada: toda leitura gravada e toda posição enviada passam por conferirLeitura', () => {
    const ctx = criarCtxDeTeste({ agora: '2026-10-14T21:00:00.000Z' });
    for (const [tipo, codigo] of [['radar', 'FOGO-RAD-0001'], ['camera', 'FOGO-CAM-0001'], ['patinete', 'FOGO-PAT-0001'], ['viatura', 'FOGO-VIA-0001'], ['fiscal_rotativo', 'FOGO-FIS-0001'], ['sensor_alagamento', 'FOGO-ALG-0001']] as const) {
      inserirEquipamentoDeTeste(ctx, { tipo, codigo, caracteristicas: tipo === 'sensor_alagamento' ? { alturaAlertaCm: 30 } : {}, ultimoSinalEm: '2026-10-14T20:59:00.000Z' });
    }
    const sim = new Simulador(ctx, { semente: 3 });
    sim.definir({ velocidade: 60 });
    for (let i = 0; i < 90; i += 1) sim.passo();
    sim.injetar('furto'); // leva um patinete para fora da cidade
    const linhas = ctx.db.prepare('SELECT e.tipo, e.codigo, e.lat_atual AS lat, e.lng_atual AS lng, t.metricas, t.hora FROM telemetria_hora t JOIN equipamentos e ON e.id = t.equipamento_id').all() as {
      tipo: (typeof TIPOS_EQUIPAMENTO)[number]['id']; codigo: string; lat: number; lng: number; metricas: string; hora: string;
    }[];
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) {
      const metricas = JSON.parse(l.metricas) as Record<string, number>;
      expect(() => conferirLeitura(l.tipo, { metricas }, new Date(l.hora)), l.codigo).not.toThrow();
    }
    for (const e of ctx.db.prepare("SELECT tipo, codigo, lat_atual AS lat, lng_atual AS lng FROM equipamentos WHERE tipo IN ('patinete','viatura','fiscal_rotativo')").all() as { tipo: string; codigo: string; lat: number; lng: number }[]) {
      expect(() => conferirLeitura(e.tipo as 'patinete', { metricas: {}, lat: e.lat, lng: e.lng }, AGORA), e.codigo).not.toThrow();
    }
  });
});
