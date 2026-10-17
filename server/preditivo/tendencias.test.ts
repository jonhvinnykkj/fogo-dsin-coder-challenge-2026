import { beforeAll, describe, expect, it } from 'vitest';
import { TIPOS_EQUIPAMENTO } from '../../shared/tipos-equipamento';
import { somarDias } from '../tempo';
import { calcularTendencias } from './tendencias';
import { AGORA_PREDITIVO, cidadeSemeada } from './test-helpers';

let t: ReturnType<typeof calcularTendencias>;

beforeAll(() => {
  t = calcularTendencias(cidadeSemeada().db, { agora: AGORA_PREDITIVO });
}, 120_000);

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
};

describe('calcularTendencias', () => {
  it('disponibilidade dos 13 tipos com séries de 30 dias (até hoje) e projeção para daqui a 7 dias', () => {
    expect(t.disponibilidadePorTipo.map((d) => d.tipo).sort()).toEqual([...TIPOS_EQUIPAMENTO.map((x) => x.id)].sort());
    for (const d of t.disponibilidadePorTipo) {
      expect(d.serie).toHaveLength(30);
      expect(d.serie[29]!.data).toBe('2026-10-15');
      expect(d.serie[0]!.data).toBe(somarDias('2026-10-15', -29));
      for (const p of d.serie) {
        expect(p.pct).toBeGreaterThanOrEqual(0);
        expect(p.pct).toBeLessThanOrEqual(100);
      }
      expect(d.projecao7d).toBeGreaterThanOrEqual(0);
      expect(d.projecao7d).toBeLessThanOrEqual(100);
    }
  });

  it('o modelo pouco confiável (Vigilux VX-200) tem mais falhas por 100 equipamentos que a mediana dos modelos', () => {
    const vx = t.falhasPorModelo.find((m) => m.marca === 'Vigilux' && m.modelo === 'VX-200');
    expect(vx).toBeDefined();
    expect(vx!.frota).toBeGreaterThan(0);
    expect(vx!.falhasPor100).toBeGreaterThan(mediana(t.falhasPorModelo.map((m) => m.falhasPor100)));
  });

  it('uso de patinetes por bairro: média diária e variação semanal', () => {
    expect(t.usoPatinetesPorBairro.length).toBeGreaterThan(0);
    for (const u of t.usoPatinetesPorBairro) {
      expect(u.nome.length).toBeGreaterThan(0);
      expect(u.mediaDiaria).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(u.variacaoPct)).toBe(true);
    }
  });

  it('explica as tendências', () => {
    expect(t.explicacao.oQuePreve.length).toBeGreaterThan(20);
    expect(t.explicacao.dadosUsados.length).toBeGreaterThan(0);
    expect(t.explicacao.confiabilidade.length).toBeGreaterThan(0);
  });
});
