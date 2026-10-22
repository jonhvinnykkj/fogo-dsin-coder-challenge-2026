// Auditoria: filtros por entidade e login vão para a API, e o antes/depois sai com rótulos de domínio.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auditoria from './Auditoria';

const REGISTRO = {
  id: 1, em: '2026-10-22T19:16:54.890Z', login: 'gestor', papel: 'gestor', acao: 'Mudança de situação do agente', metodo: 'PATCH',
  rota: '/api/agentes/:id/situacao', entidade: 'agentes', entidadeId: 1, status: 200,
  antes: { id: 1, situacao: 'em_servico', atualizado_em: '2026-01-01T00:00:00.000Z' },
  depois: { id: 1, situacao: 'pausa', atualizado_em: '2026-10-22T19:16:54.890Z' },
  dados: { situacao: 'pausa' }, ip: '127.0.0.1',
};
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string) => {
    const caminho = String(url).split('?')[0];
    if (caminho === '/api/auditoria') return json({ itens: [REGISTRO], total: 1, pagina: 1, porPagina: 50 });
    if (caminho === '/api/bairros') return json([]);
    return new Response('{}', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/auditoria']}><Auditoria /></MemoryRouter></QueryClientProvider>);
}

const consultasDeAuditoria = () => fetchFalso.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/auditoria'));

describe('Auditoria', () => {
  it('mostra a mudança com rótulo e valores de domínio, não "situacao: em_servico → pausa"', async () => {
    renderizar();
    expect(await screen.findByText('Situação: Em serviço → Em pausa')).toBeInTheDocument();
    expect(screen.queryByText(/em_servico/)).not.toBeInTheDocument();
  });

  it('escolher "O que mudou" refaz a consulta com a entidade', async () => {
    const u = userEvent.setup();
    renderizar();
    await screen.findByText('Situação: Em serviço → Em pausa');
    await u.selectOptions(screen.getByLabelText('O que mudou'), 'equipamentos');
    await waitFor(() => expect(consultasDeAuditoria().some((c) => c.includes('entidade=equipamentos'))).toBe(true));
  });

  it('o login digitado vai para a API depois de uma pausa na digitação', async () => {
    const u = userEvent.setup();
    renderizar();
    await screen.findByText('Situação: Em serviço → Em pausa');
    await u.type(screen.getByRole('searchbox'), 'operador');
    await waitFor(() => expect(consultasDeAuditoria().some((c) => c.includes('login=operador'))).toBe(true));
    expect(consultasDeAuditoria().some((c) => /login=o(?!perador)/.test(c))).toBe(false); // nada de uma consulta por letra
  });
});
