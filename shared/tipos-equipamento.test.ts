import { describe, expect, it } from 'vitest';
import { TIPOS_EQUIPAMENTO, schemaCaracteristicas, tipoPorId } from './tipos-equipamento';

describe('catálogo de tipos', () => {
  it('tem 13 tipos com siglas únicas de 3 letras', () => {
    expect(TIPOS_EQUIPAMENTO).toHaveLength(13);
    const siglas = TIPOS_EQUIPAMENTO.map((t) => t.sigla);
    expect(new Set(siglas).size).toBe(13);
    for (const s of siglas) expect(s).toMatch(/^[A-Z]{3}$/);
  });

  it('marca como móveis exatamente os cinco tipos esperados', () => {
    const moveis = TIPOS_EQUIPAMENTO.filter((t) => t.movel).map((t) => t.id).sort();
    expect(moveis).toEqual(['fiscal_rotativo', 'moto_agente', 'patinete', 'transporte', 'viatura']);
  });

  it('tipoPorId devolve o tipo', () => {
    expect(tipoPorId('radar').sigla).toBe('RAD');
  });

  it('valida as características do radar', () => {
    const s = schemaCaracteristicas('radar');
    const ok = { modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 2, sentido: 'Centro → Bairro' };
    expect(s.safeParse(ok).success).toBe(true);
    expect(s.safeParse({ ...ok, velocidadeMaxima: 250 }).success).toBe(false);
  });

  it('exige resolução válida na câmera', () => {
    const s = schemaCaracteristicas('camera');
    const base = { visaoNoturna: true, colorida: true, ptz: false, angulo: 90, armazenamentoDias: 30 };
    expect(s.safeParse({ ...base, resolucao: '1080p' }).success).toBe(true);
    expect(s.safeParse({ ...base, resolucao: '480p' }).success).toBe(false);
    expect(s.safeParse(base).success).toBe(false);
  });
});
