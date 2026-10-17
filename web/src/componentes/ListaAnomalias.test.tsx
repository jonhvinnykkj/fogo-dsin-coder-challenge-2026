// Anomalias: a contagem não pode mentir quando a lista veio cortada no limite da consulta.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Alerta } from '../../../shared/modelos';
import { ListaAnomalias } from './ListaAnomalias';

const alerta = (id: number, aberta: boolean): Alerta => ({
  id,
  tipo: 'anomalia_leitura',
  criticidade: 'media',
  titulo: `Radar FOGO-RAD-${String(id).padStart(4, '0')} sem leituras às 18h`,
  descricao: 'Radar FOGO-RAD-0010 (Rua A, Centro). Fluxo de veículos: 0 veículos/h, abaixo do normal para o horário: 258 veículos/h (variação habitual de 11,0, em 8 dias parecidos).',
  criadoEm: new Date(Date.now() - id * 60_000).toISOString(),
  ...(aberta ? {} : { resolvidoEm: new Date().toISOString(), resolucao: 'automatica' as const }),
});

const lista = (n: number, abertas: number) => Array.from({ length: n }, (_, i) => alerta(i + 1, i < abertas));

describe('ListaAnomalias', () => {
  it('abaixo do limite: conta exata e quantas continuam abertas', () => {
    render(<MemoryRouter><ListaAnomalias alertas={lista(116, 2)} bairros={[]} limite={200} /></MemoryRouter>);
    expect(screen.getByText(/leituras fora do normal nas últimas 24 horas/).textContent).toBe('116 leituras fora do normal nas últimas 24 horas; 2 continuam abertas.');
  });

  it('no limite: "200+" e as abertas contadas entre as 200 mais recentes', () => {
    render(<MemoryRouter><ListaAnomalias alertas={lista(200, 5)} bairros={[]} limite={200} /></MemoryRouter>);
    expect(screen.getByText(/leituras fora do normal nas últimas 24 horas/).textContent)
      .toBe('200+ leituras fora do normal nas últimas 24 horas. Entre as 200 mais recentes, 5 continuam abertas.');
    expect(screen.queryByText(/^200 leituras/)).not.toBeInTheDocument();
  });
});
