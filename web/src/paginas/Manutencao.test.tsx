// Quadro de manutenção: "Registrar manutenção" só aparece para quem a API deixa registrar (gestor e operador).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Papel } from '../../../shared/seguranca';
import { SessaoProvider } from '../sessao/Sessao';
import Manutencao from './Manutencao';

const EQ = {
  id: 7, codigo: 'FOGO-RAD-0007', tipo: 'radar', situacao: 'operacional', bairroNome: 'Centro', bairroId: 1, proximaManutencao: '2026-10-25',
  manutencaoNecessidade: 'agendada',
};
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

function renderizar(papel: Papel) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const caminho = String(url).split('?')[0];
    if (caminho === '/api/auth/eu') return json({ usuario: { id: 1, login: 'u', nome: 'U', papel, agenteId: null } });
    if (caminho === '/api/manutencao/painel') return json({ atrasadas: [], imediatas: [], proximos7: [EQ], proximos30: [] });
    return new Response('{}', { status: 500 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessaoProvider><MemoryRouter><Manutencao /></MemoryRouter></SessaoProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Manutenção por papel', () => {
  it.each<Papel>(['gestor', 'operador'])('%s vê o botão de registrar', async (papel) => {
    renderizar(papel);
    expect(await screen.findByRole('button', { name: 'Registrar manutenção' })).toBeInTheDocument();
  });

  it.each<Papel>(['leitura', 'agente'])('%s vê o quadro mas não o botão', async (papel) => {
    renderizar(papel);
    expect(await screen.findByText('FOGO-RAD-0007')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar manutenção' })).not.toBeInTheDocument();
  });
});
