// A trilha de auditoria mostra rótulos e valores de domínio, não colunas do banco.
import { describe, expect, it } from 'vitest';
import { mudancasLegiveis, valorLegivel } from './auditoria';

describe('valorLegivel', () => {
  it('situação usa a lista certa para cada entidade', () => {
    expect(valorLegivel('agentes', 'situacao', 'em_servico')).toBe('Em serviço');
    expect(valorLegivel('equipamentos', 'situacao', 'mau_funcionamento')).toBe('Mau funcionamento');
  });

  it('bairro vira nome; vazio vira traço; booleano e datas ficam legíveis', () => {
    expect(valorLegivel('equipamentos', 'bairro_id', 44, new Map([[44, 'Centro']]))).toBe('Centro');
    expect(valorLegivel('equipamentos', 'referencia', null)).toBe('—');
    expect(valorLegivel('simulacao', 'pausado', true)).toBe('Sim');
    expect(valorLegivel('equipamentos', 'proxima_manutencao', '2026-11-12')).toBe('12/11/2026');
    expect(valorLegivel('equipamentos', 'tipo', 'balanca')).toBe('Balança de caminhão');
  });
});

describe('mudancasLegiveis', () => {
  it('troca "situacao: em_servico → pausa" por rótulo e valores de domínio, sem carimbos técnicos', () => {
    const r = {
      entidade: 'agentes',
      antes: { id: 1, situacao: 'em_servico', turno: 'manha', atualizado_em: '2026-10-01T10:00:00.000Z' },
      depois: { id: 1, situacao: 'pausa', turno: 'manha', atualizado_em: '2026-10-22T10:00:00.000Z' },
    };
    expect(mudancasLegiveis(r)).toEqual([{ campo: 'Situação', de: 'Em serviço', para: 'Em pausa' }]);
  });

  it('sem antes e depois (entrada, simulação) não inventa mudança', () => {
    expect(mudancasLegiveis({ entidade: 'auth', antes: null, depois: null })).toEqual([]);
  });
});
