// Controles da demonstração: os 5 eventos vêm da lista única de shared/, injetar manda o tipo certo e devolve os
// alertas para a Central focar; velocidade muda por PATCH.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROTULO_EVENTO_SIMULADO, TIPOS_EVENTO_SIMULADO } from '../../../shared/dominio';
import { ControlesSimulacao } from './ControlesSimulacao';

const ALERTA = {
  id: 99, tipo: 'acidente', criticidade: 'alta', titulo: 'Acidente em Palmital', descricao: 'Colisão', bairroId: 3, lat: -22.22, lng: -49.94,
  criadoEm: '2026-10-17T15:00:00.000Z',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    if (url === '/api/simulacao' && metodo === 'GET') return json({ velocidade: 1, pausado: false, relogio: '2026-10-17T15:00:00.000Z' });
    if (url === '/api/simulacao' && metodo === 'PATCH') return json({ velocidade: 60, pausado: false, relogio: '2026-10-17T15:00:00.000Z' });
    if (url === '/api/simulacao/eventos') return json({ alertas: [ALERTA] });
    return json({ erro: 'inesperado' }, 500);
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => vi.unstubAllGlobals());

function renderizar(onInjetado = vi.fn(), encaixado = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ControlesSimulacao onInjetado={onInjetado} encaixado={encaixado} /></QueryClientProvider>);
  return onInjetado;
}

describe('ControlesSimulacao', () => {
  it('o menu lista os 5 eventos de TIPOS_EVENTO_SIMULADO e "Acidente" manda { tipo: "acidente" }', async () => {
    const u = userEvent.setup();
    const onInjetado = renderizar();
    await u.click(screen.getByRole('button', { name: 'Injetar evento' }));
    const menu = screen.getByRole('list', { name: 'Evento para injetar na cidade' });
    expect(within(menu).getAllByRole('button')).toHaveLength(TIPOS_EVENTO_SIMULADO.length);
    for (const t of TIPOS_EVENTO_SIMULADO) expect(within(menu).getByText(ROTULO_EVENTO_SIMULADO[t])).toBeInTheDocument();

    await u.click(within(menu).getByRole('button', { name: /^Acidente/ }));
    await waitFor(() => expect(onInjetado).toHaveBeenCalledWith('acidente', [expect.objectContaining({ id: 99 })]));
    const post = fetchFalso.mock.calls.find(([url]) => url === '/api/simulacao/eventos')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ tipo: 'acidente' });
    expect(await screen.findByText('Acidente em Palmital')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Evento para injetar na cidade' })).not.toBeInTheDocument();
  });

  it('60× muda a velocidade por PATCH', async () => {
    const u = userEvent.setup();
    renderizar();
    await waitFor(() => expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true'));
    await u.click(screen.getByRole('button', { name: '60×' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '60×' })).toHaveAttribute('aria-pressed', 'true'));
    const patch = fetchFalso.mock.calls.find(([url, init]) => url === '/api/simulacao' && (init as RequestInit)?.method === 'PATCH')!;
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ velocidade: 60 });
  });

  it('encaixada (celular), a barra é marcada para ficar no fluxo e continua com todos os comandos', async () => {
    const u = userEvent.setup();
    renderizar(vi.fn(), true);
    const barra = screen.getByRole('group', { name: 'Controles da simulação' });
    expect(barra.parentElement).toHaveAttribute('data-encaixado', 'true');
    for (const nome of ['1×', '10×', '60×', 'Pausar', 'Injetar evento']) expect(screen.getByRole('button', { name: nome })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Injetar evento' }));
    expect(screen.getByRole('list', { name: 'Evento para injetar na cidade' })).toBeInTheDocument();
  });

  it('flutuando (padrão), a barra não leva a marca de encaixada', () => {
    renderizar();
    expect(screen.getByRole('group', { name: 'Controles da simulação' }).parentElement).not.toHaveAttribute('data-encaixado');
  });
});
