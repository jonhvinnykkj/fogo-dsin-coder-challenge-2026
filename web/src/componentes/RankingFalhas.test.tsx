// Ranking de falhas: os 20 primeiros com chance, fatores e link para a ficha; "Agendar manutenção" abre o diálogo da
// Tarefa 10 já em "Prevista para uma data" e manda a data para o equipamento certo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiscoFalha } from '../../../shared/modelos';
import { RankingFalhas } from './RankingFalhas';

const item = (i: number): RiscoFalha => ({
  equipamentoId: 100 + i,
  codigo: `FOGO-CAM-${String(i).padStart(4, '0')}`,
  tipo: 'camera',
  marca: 'Vigilux',
  modelo: 'VX-200',
  bairroNome: `Bairro ${i}`,
  probabilidade: 1 - i / 40,
  fatores: [
    { nome: `${70 - i} horas com sinal fraco nas últimas 72 h`, contribuicao: 24.33 },
    { nome: 'Modelo pouco confiável (Vigilux VX-200)', contribuicao: 1.74 },
  ],
});
const ITENS = Array.from({ length: 25 }, (_, i) => item(i + 1));

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;

function montar(filhos: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{filhos}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  fetchFalso = vi.fn(async () => json({ id: 102 }, 201));
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

describe('RankingFalhas', () => {
  it('mostra os 20 primeiros com chance em %, fatores em pílulas e link para a ficha', () => {
    montar(<RankingFalhas itens={ITENS} />);
    const linhas = screen.getAllByRole('listitem', { name: /FOGO-CAM-/ });
    expect(linhas).toHaveLength(20);
    const primeira = within(linhas[0]!);
    expect(primeira.getByRole('link', { name: 'FOGO-CAM-0001' })).toHaveAttribute('href', '/equipamentos/101');
    expect(primeira.getByText('98%')).toBeInTheDocument();
    expect(primeira.getByText('69 horas com sinal fraco nas últimas 72 h')).toBeInTheDocument();
    expect(primeira.getByRole('meter', { name: /chance de falhar/i })).toHaveAttribute('aria-valuenow', '97.5');
    expect(screen.queryByText('FOGO-CAM-0021')).not.toBeInTheDocument();
  });

  it('"Agendar manutenção" abre o diálogo em "Prevista para uma data" e envia previstaPara para o equipamento da linha', async () => {
    montar(<RankingFalhas itens={ITENS} />);
    const segunda = screen.getAllByRole('listitem', { name: /FOGO-CAM-/ })[1]!;
    fireEvent.click(within(segunda).getByRole('button', { name: /agendar manutenção/i }));

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('FOGO-CAM-0002')).toBeInTheDocument();
    expect(within(dialogo).getByRole('radio', { name: 'Prevista para uma data' })).toBeChecked();
    expect(within(dialogo).getByLabelText('Tipo de manutenção')).toHaveValue('preventiva');
    const data = within(dialogo).getByLabelText('Data prevista') as HTMLInputElement;
    expect(data.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar manutenção' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const [url, init] = fetchFalso.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/equipamentos/102/manutencoes');
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(corpo).toMatchObject({ tipo: 'preventiva', previstaPara: data.value });
    expect(corpo).not.toHaveProperty('concluidaEm');
    expect(await screen.findByText(/Manutenção agendada para/)).toBeInTheDocument();
  });
});
