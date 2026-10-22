// Índice da página de Previsões: clicar numa seção deixa UMA âncora na barra, mesmo clicando de novo ou partindo de um link com âncora.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Previsoes from './Previsoes';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/previsoes']}><Previsoes /></MemoryRouter></QueryClientProvider>);
}

describe('índice de Previsões', () => {
  it('"Quanto acertou" deixa só uma âncora, mesmo clicando duas vezes ou saindo de uma URL que já tem âncora', async () => {
    window.history.replaceState(null, '', '/previsoes?x=1#retroativo');
    const u = userEvent.setup();
    renderizar();
    const link = screen.getByRole('link', { name: 'Quanto acertou' });
    await u.click(link);
    await u.click(link);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/previsoes?x=1#retroativo');
    expect(window.location.href.match(/#/g)).toHaveLength(1);
  });
});
