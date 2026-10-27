// Régua de horário do mapa de risco: 24 posições, setas do teclado, clique na barra e "Tocar" que anda 1 hora por
// segundo e para no fim.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReguaHorario, type HoraRegua } from './ReguaHorario';

const INICIO = Date.parse('2026-10-17T21:00:00.000Z'); // sábado 18h em São Paulo
const HORAS: HoraRegua[] = Array.from({ length: 24 }, (_, i) => ({
  inicio: new Date(INICIO + i * 3600_000).toISOString(),
  total: 2 + (i % 5),
  maiorIndice: (i * 4) % 100,
}));

function ComEstado({ inicial = 0, onMudar }: { inicial?: number; onMudar?: (p: number) => void }) {
  const [posicao, setPosicao] = useState(inicial);
  return (
    <ReguaHorario
      horas={HORAS}
      posicao={posicao}
      onMudar={(p) => {
        setPosicao(p);
        onMudar?.(p);
      }}
    />
  );
}

const regua = () => screen.getByRole('slider', { name: /horário do mapa/i });

describe('ReguaHorario', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('é um controle deslizante de 24 posições que fala a hora local e o total esperado', () => {
    render(<ComEstado />);
    const r = regua();
    expect(r).toHaveAttribute('aria-valuemin', '0');
    expect(r).toHaveAttribute('aria-valuemax', '23');
    expect(r).toHaveAttribute('aria-valuenow', '0');
    expect(r.getAttribute('aria-valuetext')).toMatch(/^18h de sábado, 2 ocorrências esperadas na cidade$/);
  });

  it('setas, Home e End mudam a hora; não passa das pontas', () => {
    render(<ComEstado />);
    const r = regua();
    fireEvent.keyDown(r, { key: 'ArrowLeft' });
    expect(r).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(r, { key: 'ArrowRight' });
    fireEvent.keyDown(r, { key: 'ArrowRight' });
    expect(r).toHaveAttribute('aria-valuenow', '2');
    fireEvent.keyDown(r, { key: 'End' });
    expect(r).toHaveAttribute('aria-valuenow', '23');
    fireEvent.keyDown(r, { key: 'ArrowRight' });
    expect(r).toHaveAttribute('aria-valuenow', '23');
    fireEvent.keyDown(r, { key: 'Home' });
    expect(r).toHaveAttribute('aria-valuenow', '0');
  });

  it('clicar numa barra escolhe aquela hora (as barras são do mouse; o teclado usa o controle deslizante)', () => {
    render(<ComEstado />);
    fireEvent.click(screen.getByTitle(/^21h de sábado/));
    expect(regua()).toHaveAttribute('aria-valuenow', '3');
    expect(screen.queryAllByRole('button')).toHaveLength(1); // só "Tocar": nada clicável dentro do controle deslizante
  });

  it('"Tocar" anda 1 hora por segundo e para sozinho na última hora', () => {
    const onMudar = vi.fn();
    render(<ComEstado onMudar={onMudar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(regua()).toHaveAttribute('aria-valuenow', '1');
    act(() => vi.advanceTimersByTime(4000));
    expect(regua()).toHaveAttribute('aria-valuenow', '5');

    act(() => vi.advanceTimersByTime(30_000));
    expect(regua()).toHaveAttribute('aria-valuenow', '23');
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeInTheDocument();
    expect(onMudar).toHaveBeenCalledTimes(23); // uma vez por hora, sem passar da última
  });

  it('na última hora, "Tocar" recomeça do início; "Pausar" e as setas param a animação', () => {
    render(<ComEstado inicial={23} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
    expect(regua()).toHaveAttribute('aria-valuenow', '0');
    act(() => vi.advanceTimersByTime(2000));
    expect(regua()).toHaveAttribute('aria-valuenow', '2');

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    act(() => vi.advanceTimersByTime(3000));
    expect(regua()).toHaveAttribute('aria-valuenow', '2');

    fireEvent.click(screen.getByRole('button', { name: 'Tocar' }));
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(regua(), { key: 'ArrowLeft' });
    expect(regua()).toHaveAttribute('aria-valuenow', '2');
    act(() => vi.advanceTimersByTime(3000));
    expect(regua()).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeInTheDocument();
  });
});
