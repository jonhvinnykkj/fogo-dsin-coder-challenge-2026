// Tela de entrada: o papel recomendado e os botões que não mudam de lugar enquanto o modo carrega.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessaoProvider } from '../sessao/Sessao';
import Entrar from './Entrar';

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

function renderizar(modo: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url) === '/api/auth/eu' ? json({ usuario: null }) : modo())));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessaoProvider>
        <MemoryRouter><Entrar /></MemoryRouter>
      </SessaoProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Entrar', () => {
  it('destaca o Gestor como o papel recomendado para avaliar', async () => {
    renderizar(async () => json({ demo: true }));
    const gestor = await screen.findByRole('button', { name: /Gestor/ });
    expect(gestor).toHaveTextContent('Recomendado para avaliar: vê tudo');
    expect(screen.getAllByText(/Recomendado para avaliar/)).toHaveLength(1);
  });

  it('já mostra os botões de papel, desligados, enquanto o modo ainda não respondeu (sem deslocar o layout)', async () => {
    renderizar(() => new Promise<Response>(() => {})); // /api/auth/modo nunca responde
    const agente = await screen.findByRole('button', { name: /Agente em campo/ });
    expect(agente).toBeDisabled();
  });
});
