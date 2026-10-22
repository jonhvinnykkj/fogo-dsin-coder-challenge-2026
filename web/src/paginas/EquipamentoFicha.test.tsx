// Ficha: sair de "Furtado" exige "recuperado" (menos para Desativado), exclusão com histórico mostra a recusa do servidor com a
// alternativa, e "Gerar token novo" confirma antes e mostra o token uma única vez.
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
  situacao: 'furtado', cep: '17500-000', logradouro: 'Avenida Sampaio Vidal', referencia: '', cidade: 'Marília', uf: 'SP', bairroId: 1, bairroNome: 'Centro', regiao: 'Centro',
  lat: -22.2138, lng: -49.9508, latAtual: -22.2138, lngAtual: -49.9508, ultimoSinalEm: null, criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z',
  manutencaoNecessidade: 'nenhuma', caracteristicas: { modalidade: 'velocidade', faixas: 2, sentido: 'Centro' }, historico: [], manutencoes: [], alertas: [],
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let fetchFalso: ReturnType<typeof vi.fn>;
let excluirComSucesso = false;
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
  excluirComSucesso = false;
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? 'GET';
    if (metodo === 'GET' && u === '/api/equipamentos/7') return json(FURTADO);
    if (metodo === 'GET' && u.startsWith('/api/equipamentos/7/telemetria')) return json([]);
    if (metodo === 'PATCH') return json({ ...FURTADO, situacao: 'operacional' });
    if (metodo === 'POST' && u === '/api/equipamentos/7/token') return json({ id: 7, codigo: 'FOGO-RAD-0007', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' });
    if (metodo === 'DELETE' && excluirComSucesso) return new Response(null, { status: 204 });
    if (metodo === 'DELETE') return json({ erro: "Este equipamento tem histórico. Use a situação 'Desativado' em vez de excluir." }, 409);
    return json({ erro: `Chamada inesperada: ${metodo} ${u}` }, 500);
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => vi.unstubAllGlobals());

describe('EquipamentoFicha', () => {
  it('mostra a cidade/UF e o endereço completo', async () => {
    renderizar();
    expect((await screen.findAllByText('Marília/SP')).length).toBeGreaterThan(0);
    expect(screen.getByText('Avenida Sampaio Vidal — Centro, Marília/SP — CEP 17500-000')).toBeInTheDocument();
  });

  it('sair de Furtado para Operacional só envia com "recuperado" marcado e manda recuperado: true', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Mudar situação' }));
    await u.selectOptions(screen.getByLabelText('Nova situação'), 'Operacional');
    await u.type(screen.getByLabelText('Motivo'), 'Localizado pela Guarda Municipal');

    const enviar = () => u.click(screen.getAllByRole('button', { name: 'Mudar situação' }).at(-1)!);
    await enviar();
    expect(await screen.findByText('Confirme que o equipamento foi recuperado para tirá-lo de "Furtado"')).toBeInTheDocument();
    expect(chamadas('PATCH')).toHaveLength(0);

    await u.click(screen.getByLabelText('O equipamento foi recuperado'));
    await enviar();
    await waitFor(() => expect(chamadas('PATCH')).toHaveLength(1));
    const [url, init] = chamadas('PATCH')[0]!;
    expect(url).toBe('/api/equipamentos/7/situacao');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ situacao: 'operacional', motivo: 'Localizado pela Guarda Municipal', recuperado: true });
  });

  it.each(['Em manutenção', 'Não instalado', 'Mau funcionamento'])('sair de Furtado para %s também exige "recuperado" (não é atalho para voltar sem recuperar)', async (destino) => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Mudar situação' }));
    await u.selectOptions(screen.getByLabelText('Nova situação'), destino);
    await u.type(screen.getByLabelText('Motivo'), 'Mandado para a oficina');
    await u.click(screen.getAllByRole('button', { name: 'Mudar situação' }).at(-1)!);
    expect(await screen.findByText('Confirme que o equipamento foi recuperado para tirá-lo de "Furtado"')).toBeInTheDocument();
    expect(chamadas('PATCH')).toHaveLength(0);
  });

  it('sair de Furtado para Desativado (dado como perdido) não pede recuperação e não a envia', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Mudar situação' }));
    await u.selectOptions(screen.getByLabelText('Nova situação'), 'Desativado');
    expect(screen.queryByLabelText('O equipamento foi recuperado')).not.toBeInTheDocument();
    await u.type(screen.getByLabelText('Motivo'), 'Dado como perdido');
    await u.click(screen.getAllByRole('button', { name: 'Mudar situação' }).at(-1)!);
    await waitFor(() => expect(chamadas('PATCH')).toHaveLength(1));
    expect(JSON.parse(String((chamadas('PATCH')[0]![1] as RequestInit).body))).toEqual({ situacao: 'desativado', motivo: 'Dado como perdido' });
  });

  it('"Gerar token novo" pede confirmação (o atual deixa de valer) e só então mostra o token, uma vez', async () => {
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Gerar token novo' }));
    expect(screen.getByText(/O token atual deixa de valer na hora/)).toBeInTheDocument();
    expect(chamadas('POST')).toHaveLength(0);

    await u.click(screen.getAllByRole('button', { name: 'Gerar token novo' }).at(-1)!);
    expect(await screen.findByText('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBeInTheDocument();
    expect(screen.getByText(/Copie agora: o token não aparece de novo/)).toBeInTheDocument();
    expect(chamadas('POST')).toHaveLength(1);
    expect(chamadas('POST')[0]![0]).toBe('/api/equipamentos/7/token');

    await u.click(screen.getByRole('button', { name: 'Já copiei o token' }));
    await waitFor(() => expect(screen.queryByText('a1b2c3d4e5f60718293a4b5c6d7e8f90')).not.toBeInTheDocument());
    // Abrindo de novo, volta a pedir confirmação e o token antigo não está mais na tela.
    await u.click(screen.getByRole('button', { name: 'Gerar token novo' }));
    expect(screen.getByText(/O token atual deixa de valer na hora/)).toBeInTheDocument();
    expect(screen.queryByText('a1b2c3d4e5f60718293a4b5c6d7e8f90')).not.toBeInTheDocument();
  });

  it('excluir com sucesso não rebusca o equipamento apagado (telemetria e ficha dariam 404)', async () => {
    excluirComSucesso = true;
    const u = userEvent.setup();
    renderizar();
    await u.click(await screen.findByRole('button', { name: 'Excluir' }));
    const antes = fetchFalso.mock.calls.filter(([url]) => String(url).startsWith('/api/equipamentos/7')).length;
    await u.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
    expect(await screen.findByText('Lista aberta')).toBeInTheDocument();
    const depois = fetchFalso.mock.calls.filter(([url, init]) => String(url).startsWith('/api/equipamentos/7') && (init as RequestInit | undefined)?.method !== 'DELETE').length;
    expect(depois).toBe(antes);
  });

  it('a ficha mostra "1 passageiro" (singular) e não "Imagem colorida (desmarcado...)": dica fica só no formulário', async () => {
    fetchFalso.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u === '/api/equipamentos/7') return json({ ...FURTADO, tipo: 'transporte', caracteristicas: { categoria: 'táxi', placa: 'ABC1D23', capacidade: 1, permissionario: 'Zé' } });
      if (u.startsWith('/api/equipamentos/7/telemetria')) return json([]);
      return json({}, 500);
    });
    renderizar();
    expect(await screen.findByText('1 passageiro')).toBeInTheDocument();
    expect(screen.queryByText('1 passageiros')).not.toBeInTheDocument();
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
