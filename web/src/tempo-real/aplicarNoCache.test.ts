import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ocorrencia } from '../../../shared/modelos';
import { chaves } from '../api/chaves';
import { aplicarOcorrencia } from './aplicarNoCache';

const HORA = 3_600_000;
const AGORA = new Date('2026-10-17T15:00:00.000Z');

function ocorrencia(id: number, horasAtras: number): Ocorrencia {
  return {
    id, tipo: 'acidente', gravidade: 2, bairroId: 1, lat: -22.2, lng: -49.9, inicio: new Date(AGORA.getTime() - horasAtras * HORA).toISOString(),
    descricao: 'Colisão', chuva: false, origem: 'tempo_real',
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('aplicarOcorrencia', () => {
  // Com a página aberta a 60×, chegam milhares de ocorrências por hora: a lista do mapa de calor fica só com a janela pedida.
  it('acrescenta a nova e tira da lista o que saiu da janela de horas da consulta', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const qc = new QueryClient();
    qc.setQueryData(chaves.ocorrencias(24), [ocorrencia(1, 25), ocorrencia(2, 23), ocorrencia(3, 1)]);
    qc.setQueryData(chaves.ocorrencias(3), [ocorrencia(2, 23), ocorrencia(3, 1)]);
    aplicarOcorrencia(qc, ocorrencia(4, 0));
    expect(qc.getQueryData<Ocorrencia[]>(chaves.ocorrencias(24))!.map((o) => o.id)).toEqual([2, 3, 4]);
    expect(qc.getQueryData<Ocorrencia[]>(chaves.ocorrencias(3))!.map((o) => o.id)).toEqual([3, 4]);
  });

  it('atualiza no lugar a ocorrência que já estava (ex.: recebeu o fim)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const qc = new QueryClient();
    qc.setQueryData(chaves.ocorrencias(24), [ocorrencia(2, 2), ocorrencia(3, 1)]);
    aplicarOcorrencia(qc, { ...ocorrencia(2, 2), fim: AGORA.toISOString() });
    const lista = qc.getQueryData<Ocorrencia[]>(chaves.ocorrencias(24))!;
    expect(lista.map((o) => o.id)).toEqual([2, 3]);
    expect(lista[0]!.fim).toBe(AGORA.toISOString());
  });
});
