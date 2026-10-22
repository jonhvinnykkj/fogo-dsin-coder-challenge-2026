// Saída voluntária × sessão vencida: só a segunda lembra a página de antes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Entrar from '../paginas/Entrar';
import { ExigeSessao, SessaoProvider, useSessao } from './Sessao';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const GESTOR = { id: 1, login: 'gestor', nome: 'Gestão da operação', papel: 'gestor', agenteId: null };
const AGENTE = { id: 3, login: 'agente', nome: 'Ana Souza', papel: 'agente', agenteId: 7 };

function Previsoes() {
  const { sair } = useSessao();
  const navegar = useNavigate();
  return <button onClick={() => void sair().finally(() => navegar('/entrar', { replace: true }))}>Sair</button>;
}

function Destino({ nome }: { nome: string }) {
  return <p>{nome}:{useLocation().pathname}</p>;
}

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/previsoes']}>
        <SessaoProvider>
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/previsoes" element={<ExigeSessao><Previsoes /></ExigeSessao>} />
            <Route path="/campo" element={<ExigeSessao><Destino nome="campo" /></ExigeSessao>} />
          </Routes>
        </SessaoProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === '/api/auth/eu') return json({ usuario: GESTOR });
    if (u === '/api/auth/sair') return json({ ok: true });
    if (u === '/api/auth/modo') return json({ demo: true });
    if (u === '/api/auth/demo') return json((JSON.parse(String(init?.body)) as { papel: string }).papel === 'agente' ? AGENTE : GESTOR);
    return json({ erro: 'inesperada' }, 500);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('depois de "Sair"', () => {
  it('entrar como agente vai para o Modo Campo, não para a última tela do gestor', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Sair' }));
    await u.click(await screen.findByRole('button', { name: /Agente em campo/ }));
    expect(await screen.findByText('campo:/campo')).toBeInTheDocument();
  });

  it('já a sessão vencida (sem clicar em Sair) lembra a página de onde a pessoa estava', async () => {
    const fetchFalso = vi.fn(async (url: string) => {
      const u = String(url);
      if (u === '/api/auth/eu') return json({ usuario: null });
      if (u === '/api/auth/modo') return json({ demo: true });
      if (u === '/api/auth/demo') return json(GESTOR);
      return json({ erro: 'inesperada' }, 500);
    });
    vi.stubGlobal('fetch', fetchFalso);
    const u = userEvent.setup();
    renderizar(); // abriu /previsoes sem sessão: vai para /entrar guardando /previsoes
    await u.click(await screen.findByRole('button', { name: /Gestor/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument());
  });
});
