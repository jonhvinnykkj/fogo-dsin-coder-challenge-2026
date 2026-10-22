// O recorte de lugar da Central vale para a lista de alertas e para o painel de regiões, não só para os números.
import { describe, expect, it } from 'vitest';
import type { Alerta, Bairro, StatusRegiao } from '../../../shared/modelos';
import { filtrarAlertasPorLugar, filtrarRegioesPorLugar } from './alertasPorLugar';

const bairros = [
  { id: 1, nome: 'Centro', regiao: 'Centro' },
  { id: 2, nome: 'Cascata', regiao: 'Norte' },
  { id: 3, nome: 'Jardim Tropical', regiao: 'Norte' },
] as Bairro[];

const alerta = (id: number, bairroId?: number) => ({ id, bairroId }) as Alerta;
const lista = [alerta(1, 1), alerta(2, 2), alerta(3, 3), alerta(4)];

describe('filtrarAlertasPorLugar', () => {
  it('sem recorte devolve a lista inteira (a mesma, sem copiar)', () => {
    expect(filtrarAlertasPorLugar(lista, {}, bairros)).toBe(lista);
  });

  it('região fica com os alertas dos bairros dela; alerta sem bairro sai', () => {
    expect(filtrarAlertasPorLugar(lista, { regiao: 'Norte' }, bairros)?.map((a) => a.id)).toEqual([2, 3]);
  });

  it('bairro fica com os alertas dele; bairro de fora da região escolhida não casa', () => {
    expect(filtrarAlertasPorLugar(lista, { bairroId: 3 }, bairros)?.map((a) => a.id)).toEqual([3]);
    expect(filtrarAlertasPorLugar(lista, { regiao: 'Centro', bairroId: 3 }, bairros)).toEqual([]);
  });
});

describe('filtrarRegioesPorLugar', () => {
  const b = (bairroId: number) => ({ bairroId, nome: `B${bairroId}`, indice: 0, nivel: 'normal', motivos: [] }) as StatusRegiao['bairros'][number];
  const regioes = [
    { regiao: 'Centro', indice: 0, nivel: 'normal', motivos: [], bairros: [b(1)] },
    { regiao: 'Norte', indice: 40, nivel: 'atencao', motivos: [], bairros: [b(2), b(3)] },
  ] as StatusRegiao[];

  it('região escolhida mostra só ela; bairro escolhido mostra só ele dentro dela', () => {
    expect(filtrarRegioesPorLugar(regioes, { regiao: 'Norte' })?.map((r) => r.regiao)).toEqual(['Norte']);
    const so = filtrarRegioesPorLugar(regioes, { bairroId: 3 });
    expect(so).toHaveLength(1);
    expect(so![0]!.bairros.map((x) => x.bairroId)).toEqual([3]);
  });

  it('sem recorte devolve as regiões como vieram', () => {
    expect(filtrarRegioesPorLugar(regioes, {})).toBe(regioes);
  });
});
