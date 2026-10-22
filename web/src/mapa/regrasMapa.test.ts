// Regras puras do mapa da Central: pior situação de um grupo, pintura dos bairros, peso do calor e a diferença
// entre duas listas de marcadores (o que mover, trocar ícone, incluir e tirar sem recriar a camada).
import { describe, expect, it } from 'vitest';
import type { EquipamentoMapa } from '../../../shared/modelos';
import { compararMarcadores, manutencaoUrgente, pedeAtencaoDeManutencao, pesoDaOcorrencia, pinturaDoBairro, piorSituacao } from './regrasMapa';

const eq = (id: number, extra: Partial<EquipamentoMapa> = {}): EquipamentoMapa => ({
  id, codigo: `FOGO-RAD-${id}`, tipo: 'radar', situacao: 'operacional', lat: -22.2, lng: -49.9, bairroId: 1,
  orgao: 'Secretaria de Mobilidade Urbana', manutencao: 'ok', ...extra,
});

describe('piorSituacao', () => {
  it('furtado > mau funcionamento > em manutenção > operacional > desativado > não instalado', () => {
    expect(piorSituacao(['operacional', 'em_manutencao', 'mau_funcionamento'])).toBe('mau_funcionamento');
    expect(piorSituacao(['mau_funcionamento', 'furtado', 'operacional'])).toBe('furtado');
    expect(piorSituacao(['operacional', 'desativado', 'nao_instalado'])).toBe('operacional');
    expect(piorSituacao(['nao_instalado', 'desativado'])).toBe('desativado');
    expect(piorSituacao([])).toBe('operacional');
  });
});

describe('pinturaDoBairro', () => {
  it('normal fica transparente; atenção âmbar; crítico vermelho', () => {
    expect(pinturaDoBairro('normal', undefined).fillOpacity).toBe(0);
    expect(pinturaDoBairro('atencao', undefined)).toMatchObject({ fillColor: '#E8A400' });
    expect(pinturaDoBairro('critico', undefined)).toMatchObject({ fillColor: '#D92D20' });
    expect(pinturaDoBairro('atencao', undefined).fillOpacity).toBeGreaterThan(0);
  });

  it('alerta alto ou crítico aberto no bairro pinta o contorno com a cor da criticidade', () => {
    const calmo = pinturaDoBairro('normal', undefined);
    const comCritico = pinturaDoBairro('normal', 'critica');
    const comAlto = pinturaDoBairro('atencao', 'alta');
    expect(comCritico.color).toBe('#D92D20');
    expect(comCritico.weight).toBeGreaterThan(calmo.weight);
    expect(comAlto).toMatchObject({ color: '#F04A00', fillColor: '#E8A400' });
  });
});

describe('pesoDaOcorrencia', () => {
  it('cresce com a gravidade e fica entre 0 e 1', () => {
    expect(pesoDaOcorrencia(1)).toBeLessThan(pesoDaOcorrencia(4));
    expect(pesoDaOcorrencia(4)).toBe(1);
    expect(pesoDaOcorrencia(1)).toBeGreaterThan(0);
  });
});

describe('compararMarcadores', () => {
  it('separa incluídos, removidos, movidos e os que mudaram de situação; o mesmo objeto é ignorado', () => {
    const a = eq(1);
    const b = eq(2);
    const c = eq(3);
    const anteriores = new Map([[1, a], [2, b], [3, c]]);

    const bMovido = { ...b, lat: -22.21 };
    const cAvariado = { ...c, situacao: 'mau_funcionamento' as const };
    const d = eq(4);
    const r = compararMarcadores(anteriores, [a, bMovido, cAvariado, d]);

    expect(r.incluidos.map((x) => x.id)).toEqual([4]);
    expect(r.removidos).toEqual([]);
    expect(r.movidos.map((x) => x.id)).toEqual([2]);
    expect(r.mudados.map((x) => x.id)).toEqual([3]);

    const r2 = compararMarcadores(new Map([[1, a], [2, bMovido]]), [a]);
    expect(r2.removidos).toEqual([2]);
    expect(r2.incluidos).toEqual([]);
  });

  it('mudou de lugar e de situação ao mesmo tempo: entra nas duas listas', () => {
    const a = eq(1);
    const r = compararMarcadores(new Map([[1, a]]), [{ ...a, lat: -22.3, situacao: 'furtado' }]);
    expect(r.movidos.map((x) => x.id)).toEqual([1]);
    expect(r.mudados.map((x) => x.id)).toEqual([1]);
  });
});

describe('manutenção no mapa', () => {
  it('imediata, atrasada e próxima pedem destaque; ok não. Só imediata e atrasada são urgentes', () => {
    expect((['ok', 'proxima', 'imediata', 'atrasada'] as const).map(pedeAtencaoDeManutencao)).toEqual([false, true, true, true]);
    expect((['ok', 'proxima', 'imediata', 'atrasada'] as const).map(manutencaoUrgente)).toEqual([false, false, true, true]);
  });

  it('mudar só a manutenção (sem mexer na situação) manda o marcador trocar de ícone', () => {
    const a = eq(1);
    const r = compararMarcadores(new Map([[1, a]]), [{ ...a, manutencao: 'imediata' }]);
    expect(r.mudados.map((x) => x.id)).toEqual([1]);
    expect(r.movidos).toEqual([]);
  });
});
