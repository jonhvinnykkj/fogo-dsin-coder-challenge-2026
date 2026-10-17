// Ficha: sair de "Furtado" exige "recuperado" e exclusão com histórico mostra a recusa do servidor com a alternativa.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EquipamentoFicha from './EquipamentoFicha';

// Mapa e gráfico dependem de Leaflet/Recharts (sem layout no jsdom): viram marcadores simples.
vi.mock('../componentes/MapaBase', () => ({ MapaBase: () => <div data-testid="mapa" /> }));
vi.mock('react-leaflet', () => ({ Marker: () => null }));
vi.mock('../componentes/GraficoTelemetria', () => ({ GraficoTelemetria: () => <div data-testid="grafico" /> }));

const FURTADO = {
  id: 7, codigo: 'FOGO-RAD-0007', tipo: 'radar', numeroSerie: 'SN-7', marca: 'Perkons', modelo: 'SC-400', orgao: 'Secretaria de Mobilidade Urbana',
  situacao: 'furtado', cep: '17500-000', logradouro: 'Avenida Sampaio Vidal', referencia: '', bairroId: 1, bairroNome: 'Centro', regiao: 'Centro',
  lat: -22.2138, lng: -49.9508, latAtual: -22.2138, lngAtual: -49.9508, ultimoSinalEm: null, criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z',
  manutencaoNecessidade: 'nenhuma', caracteristicas: { modalidade: 'velocidade', faixas: 2, sentido: 'Centro' }, historico: [], manutencoes: [], alertas: [],
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;
const chamadas = (metodo: string) => fetchFalso.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === metodo);

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/equipamentos/7']}>
        <Routes>
          <Route path="/equipamentos/:id" element={<EquipamentoFicha />} />
          <Route path="/equipamentos" element={<p>Lista aberta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? 'GET';
    if (metodo === 'GET' && u === '/api/equipamentos/7') return json(FURTADO);
    if (metodo === 'GET' && u.startsWith('/api/equipamentos/7/telemetria')) return json([]);
    if (metodo === 'PATCH') return json({ ...FURTADO, situacao: 'operacional' });
    if (metodo === 'DELETE') return json({ erro: "Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir." }, 409);
    return json({ erro: `Chamada inesperada: ${metodo} ${u}` }, 500);
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => vi.unstubAllGlobals());

describe('EquipamentoFicha', () => {
  it('sair de Furtado para Operacional só envia com "recuperado" marcado e manda recuperado: true', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Mudar situação' }));
    await u.selectOptions(screen.getByLabelText('Nova situação'), 'Operacional');
    await u.type(screen.getByLabelText('Motivo'), 'Localizado pela Guarda Municipal');

    const enviar = () => u.click(screen.getAllByRole('button', { name: 'Mudar situação' }).at(-1)!);
    await enviar();
    expect(await screen.findByText('Confirme que o equipamento foi recuperado para voltar a operar')).toBeInTheDocument();
    expect(chamadas('PATCH')).toHaveLength(0);

    await u.click(screen.getByLabelText('O equipamento foi recuperado'));
    await enviar();
    await waitFor(() => expect(chamadas('PATCH')).toHaveLength(1));
    const [url, init] = chamadas('PATCH')[0]!;
    expect(url).toBe('/api/equipamentos/7/situacao');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ situacao: 'operacional', motivo: 'Localizado pela Guarda Municipal', recuperado: true });
  });

  it('excluir com histórico mostra a mensagem do servidor e oferece desativar', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Excluir' }));
    await u.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));

    expect(await screen.findByText("Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar em vez de excluir' })).toBeInTheDocument();
    expect(screen.queryByText('Lista aberta')).not.toBeInTheDocument();
  });
});
