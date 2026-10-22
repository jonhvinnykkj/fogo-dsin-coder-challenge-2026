// Tela de Alertas: no celular as ações (Reconhecer, Resolver, Ver no mapa) ficam à vista em cada cartão, não numa coluna fora da tela.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Alertas from './Alertas';

const ALERTAS = [
  { id: 1, tipo: 'acidente', criticidade: 'critica', titulo: 'Acidente em Cascata', descricao: 'Colisão.', bairroId: 2, lat: -22.2, lng: -49.9, criadoEm: new Date().toISOString() },
  { id: 2, tipo: 'sem_sinal', criticidade: 'media', titulo: 'Radar sem sinal', descricao: 'Sem leitura.', bairroId: 2, criadoEm: new Date().toISOString(), reconhecidoEm: new Date().toISOString() },
];
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

function celular(ativo: boolean) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: ativo && consulta.includes('720px'), media: consulta, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/alertas']}><Alertas /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const caminho = String(url).split('?')[0];
    if (caminho === '/api/alertas') return json(ALERTAS);
    if (caminho === '/api/bairros') return json([{ id: 2, nome: 'Cascata', regiao: 'Norte' }]);
    return new Response('{}', { status: 500 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('Alertas no celular', () => {
  it('vira lista de cartões, cada um com as suas ações visíveis', async () => {
    celular(true);
    renderizar();
    const lista = await screen.findByRole('list', { name: /Alertas, críticos primeiro/ });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const cartoes = await within(lista).findAllByRole('listitem');
    expect(cartoes).toHaveLength(2);
    expect(within(cartoes[0]!).getByRole('button', { name: 'Reconhecer' })).toBeInTheDocument();
    expect(within(cartoes[0]!).getByRole('button', { name: 'Resolver' })).toBeInTheDocument();
    expect(within(cartoes[0]!).getByRole('button', { name: 'Ver no mapa' })).toBeInTheDocument();
    expect(within(cartoes[1]!).queryByRole('button', { name: 'Reconhecer' })).not.toBeInTheDocument(); // já reconhecido
  });

  it('em tela larga continua sendo tabela', async () => {
    celular(false);
    renderizar();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
