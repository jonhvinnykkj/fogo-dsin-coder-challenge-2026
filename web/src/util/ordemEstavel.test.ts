// "Reconhecer" não pode mudar a posição do alerta na hora: o clique seguinte no mesmo lugar resolveria outro.
import { describe, expect, it } from 'vitest';
import type { Alerta } from '../../../shared/modelos';
import { ordenarParaFeed } from '../componentes/etiquetas/EtiquetaAlerta';
import { ordenarSemPular } from './ordemEstavel';

const critica = (id: number, minutos: number, extra: Partial<Alerta> = {}) =>
  ({ id, criticidade: 'critica', criadoEm: new Date(Date.UTC(2026, 9, 17, 15, 0) - minutos * 60_000).toISOString(), ...extra }) as Alerta;

describe('ordenarSemPular', () => {
  const abertos = [critica(1, 1), critica(2, 2), critica(3, 3)];

  it('sem a proteção, reconhecer o primeiro crítico o joga para o fim (o problema)', () => {
    const depois = abertos.map((a) => (a.id === 1 ? { ...a, reconhecidoEm: '2026-10-17T15:00:00Z' } : a));
    expect(ordenarParaFeed(depois).map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('com a proteção, o reconhecido fica no lugar e já aparece como reconhecido', () => {
    const foto = new Map<number, boolean>();
    expect(ordenarSemPular(abertos, ordenarParaFeed, foto).map((a) => a.id)).toEqual([1, 2, 3]);
    const depois = abertos.map((a) => (a.id === 1 ? { ...a, reconhecidoEm: '2026-10-17T15:00:00Z' } : a));
    const r = ordenarSemPular(depois, ordenarParaFeed, foto);
    expect(r.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(r[0]!.reconhecidoEm).toBe('2026-10-17T15:00:00Z');
  });

  it('quando chega um alerta novo a ordem natural volta (o reconhecido desce)', () => {
    const foto = new Map<number, boolean>();
    ordenarSemPular(abertos, ordenarParaFeed, foto);
    const depois = [...abertos.map((a) => (a.id === 1 ? { ...a, reconhecidoEm: '2026-10-17T15:00:00Z' } : a)), critica(4, 0)];
    expect(ordenarSemPular(depois, ordenarParaFeed, foto).map((a) => a.id)).toEqual([4, 2, 3, 1]);
  });
});
