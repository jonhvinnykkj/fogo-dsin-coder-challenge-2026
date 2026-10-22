// Formulário de equipamento: campos por tipo, validação no cliente e erros do servidor no campo certo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bairro } from '../../../shared/modelos';
import EquipamentoFormulario from './EquipamentoFormulario';

// O mapa (Leaflet) não roda no jsdom: o seletor de ponto vira um stub com os mesmos campos de erro.
vi.mock('../componentes/SeletorPontoMapa', () => ({
  SeletorPontoMapa: ({ erro, idErro }: { erro?: string; idErro?: string }) => <div data-testid="seletor-mapa">{erro && <p id={idErro} role="alert">{erro}</p>}</div>,
}));

const BAIRRO: Bairro = {
  id: 1, nome: 'Centro', regiao: 'Centro', lat: -22.2138, lng: -49.9508, cep: '17500-000',
  poligono: { type: 'Polygon', coordinates: [[[-50, -22.3], [-49.9, -22.3], [-49.9, -22.1], [-50, -22.1], [-50, -22.3]]] },
};

let fetchFalso: ReturnType<typeof vi.fn>;

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EquipamentoFormulario />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/bairros')) return new Response(JSON.stringify([BAIRRO]), { status: 200 });
    return new Response(JSON.stringify({ erro: `Chamada inesperada: ${init?.method ?? 'GET'} ${url}` }), { status: 500 });
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EquipamentoFormulario', () => {
  it('troca os campos de características conforme o tipo escolhido', async () => {
    const u = userEvent.setup();
    renderizar();

    expect(screen.queryByLabelText(/Velocidade máxima/)).not.toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Radar de fiscalização');
    expect(screen.getByLabelText(/Velocidade máxima/)).toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Câmera de videomonitoramento');
    expect(screen.queryByLabelText(/Velocidade máxima/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Resolução/)).toBeInTheDocument();
  });

  it('mostra o erro no campo e não chama a API quando a velocidade máxima é 250', async () => {
    const u = userEvent.setup();
    renderizar();

    await u.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Radar de fiscalização');
    await u.type(screen.getByLabelText(/Velocidade máxima/), '250');
    await u.click(screen.getByRole('button', { name: 'Cadastrar equipamento' }));

    const campo = screen.getByLabelText(/Velocidade máxima/);
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText(/Velocidade máxima precisa ficar entre 10 a 120 km\/h/)).toBeInTheDocument();
    // Só a consulta dos bairros saiu; nenhum POST.
    expect(fetchFalso.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- edição, erros do servidor e ViaCEP

const EQUIPAMENTO = {
  id: 5, codigo: 'FOGO-RAD-0005', tipo: 'radar', numeroSerie: 'SN-5', marca: 'Perkons', modelo: 'SC-400', orgao: 'Secretaria de Mobilidade Urbana',
  situacao: 'mau_funcionamento', cep: '17500-000', logradouro: 'Avenida Sampaio Vidal', referencia: '', bairroId: 1, bairroNome: 'Centro', regiao: 'Centro',
  lat: -22.2138, lng: -49.9508, latAtual: -22.2, lngAtual: -49.95, ultimoSinalEm: '2026-10-17T14:59:00.000Z', criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-17T14:59:00.000Z',
  manutencaoNecessidade: 'nenhuma', caracteristicas: { modalidade: 'velocidade', velocidadeMaxima: 60, faixas: 2, sentido: 'Centro' },
  tokenDispositivo: 'segredo', historico: [], manutencoes: [], alertas: [],
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

function renderizarEdicao() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/equipamentos/5/editar']}>
        <Routes>
          <Route path="/equipamentos/:id/editar" element={<EquipamentoFormulario />} />
          <Route path="/equipamentos/:id" element={<p>Ficha aberta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rotear(extra: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  fetchFalso.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const r = extra(u, init);
    if (r) return r;
    if (u.startsWith('/api/bairros')) return json([BAIRRO]);
    if (u === '/api/equipamentos/5') return json(EQUIPAMENTO);
    return json({ erro: `Chamada inesperada: ${init?.method ?? 'GET'} ${u}` }, 500);
  });
}

describe('edição', () => {
  it('trava o tipo e o PUT não leva código, token, posição atual nem último sinal', async () => {
    const u = userEvent.setup();
    let corpo: Record<string, unknown> | undefined;
    rotear((url, init) => {
      if (url === '/api/equipamentos/5' && init?.method === 'PUT') {
        corpo = JSON.parse(String(init.body));
        return json(EQUIPAMENTO);
      }
    });
    renderizarEdicao();

    const tipo = await screen.findByLabelText('Tipo de equipamento');
    expect(tipo).toBeDisabled();
    await u.clear(screen.getByLabelText('Modelo'));
    await u.type(screen.getByLabelText('Modelo'), 'SC-500');
    await u.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await screen.findByText('Ficha aberta');
    expect(corpo).toBeDefined();
    expect(corpo!.modelo).toBe('SC-500');
    for (const chave of ['codigo', 'token', 'tokenDispositivo', 'latAtual', 'lngAtual', 'ultimoSinalEm', 'id']) expect(corpo).not.toHaveProperty(chave);
    // Segue o cadastro carregado (o servidor ignora a situação no PUT; só o PATCH a muda).
    expect(corpo!.tipo).toBe('radar');
    expect(corpo!.situacao).toBe('mau_funcionamento');
  });

  // Datas de manutenção mudam enquanto o formulário está aberto (reparo registrado, simulador): sem mexer nelas, o PUT não
  // as leva e o servidor mantém as gravadas. Mexendo, vai o grupo inteiro.
  it('o PUT só leva o grupo de manutenção quando a pessoa mexe nele', async () => {
    const u = userEvent.setup();
    const corpos: Record<string, unknown>[] = [];
    rotear((url, init) => {
      if (url === '/api/equipamentos/5' && init?.method === 'PUT') {
        corpos.push(JSON.parse(String(init.body)));
        return json(EQUIPAMENTO);
      }
    });
    renderizarEdicao();
    await u.clear(await screen.findByLabelText('Modelo'));
    await u.type(screen.getByLabelText('Modelo'), 'SC-500');
    await u.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Ficha aberta');
    for (const chave of ['manutencaoNecessidade', 'manutencaoPeriodicidadeDias', 'ultimaManutencao', 'proximaManutencao']) expect(corpos[0]).not.toHaveProperty(chave);
    expect(corpos[0]!.modelo).toBe('SC-500');
  });

  it('mexendo na manutenção, o PUT leva o grupo inteiro', async () => {
    const u = userEvent.setup();
    const corpos: Record<string, unknown>[] = [];
    rotear((url, init) => {
      if (url === '/api/equipamentos/5' && init?.method === 'PUT') {
        corpos.push(JSON.parse(String(init.body)));
        return json(EQUIPAMENTO);
      }
    });
    renderizarEdicao();
    await u.selectOptions(await screen.findByLabelText('Necessidade de manutenção'), 'agendada');
    const proxima = screen.getByLabelText(/Próxima manutenção/);
    await u.type(proxima, '2026-12-01');
    await u.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Ficha aberta');
    expect(corpos[0]).toMatchObject({ manutencaoNecessidade: 'agendada', proximaManutencao: '2026-12-01' });
  });

  it('mostra cada erro 400 do servidor no lugar certo e mantém o que foi digitado', async () => {
    const u = userEvent.setup();
    rotear((url, init) => {
      if (url === '/api/equipamentos/5' && init?.method === 'PUT') {
        return json({ erro: 'Dados inválidos', campos: { 'caracteristicas.velocidadeMaxima': 'O servidor não aceitou esta velocidade', lat: 'A coordenada precisa ficar dentro de Marília' } }, 400);
      }
    });
    renderizarEdicao();

    await u.clear(await screen.findByLabelText('Marca'));
    await u.type(screen.getByLabelText('Marca'), 'Outra Marca');
    await u.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    const velocidade = await screen.findByLabelText(/Velocidade máxima/);
    await waitFor(() => expect(velocidade).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('O servidor não aceitou esta velocidade')).toBeInTheDocument();

    const mensagemLat = within(screen.getByTestId('seletor-mapa')).getByText('A coordenada precisa ficar dentro de Marília');
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-describedby', mensagemLat.id);
    expect(screen.getByLabelText('Longitude')).toHaveAttribute('aria-describedby', mensagemLat.id);
    expect(screen.getByLabelText('Marca')).toHaveValue('Outra Marca');
  });
});

describe('Cidade/UF', () => {
  it('mostra a cidade/UF como campo só de leitura com a dica do município', () => {
    renderizar();
    const campo = screen.getByLabelText('Cidade/UF');
    expect(campo).toHaveValue('Marília/SP');
    expect(campo).toHaveAttribute('readonly');
    expect(screen.getByText('O F.O.G.O. atende um município; as coordenadas precisam cair dentro de Marília.')).toBeInTheDocument();
  });
});

describe('ViaCEP', () => {
  const viacep = (resposta: () => Response | Promise<Response>) => rotear((url) => (url.startsWith('https://viacep.com.br/') ? resposta() : undefined));

  it('preenche o logradouro vazio com o endereço do CEP', async () => {
    const u = userEvent.setup();
    viacep(() => json({ logradouro: 'Avenida Sampaio Vidal', bairro: 'Centro' }));
    renderizar();
    await u.type(screen.getByLabelText('CEP'), '17500000');
    await waitFor(() => expect(screen.getByLabelText('Logradouro')).toHaveValue('Avenida Sampaio Vidal'));
    expect(fetchFalso).toHaveBeenCalledWith('https://viacep.com.br/ws/17500000/json/', expect.anything());
  });

  it('CEP de outra cidade: mensagem clara e não preenche o endereço', async () => {
    const u = userEvent.setup();
    viacep(() => json({ logradouro: 'Rua Batista de Carvalho', bairro: 'Centro', localidade: 'Bauru', uf: 'SP' }));
    renderizar();
    await u.type(screen.getByLabelText('CEP'), '17500000');
    expect(await screen.findByText('Este CEP é de Bauru/SP, fora de Marília/SP')).toBeInTheDocument();
    expect(screen.getByLabelText('Logradouro')).toHaveValue('');
  });

  it('CEP de Marília/SP preenche normalmente (localidade e uf conferem)', async () => {
    const u = userEvent.setup();
    viacep(() => json({ logradouro: 'Avenida Sampaio Vidal', bairro: 'Centro', localidade: 'Marília', uf: 'SP' }));
    renderizar();
    await u.type(screen.getByLabelText('CEP'), '17500000');
    await waitFor(() => expect(screen.getByLabelText('Logradouro')).toHaveValue('Avenida Sampaio Vidal'));
    expect(screen.queryByText(/fora de Marília/)).not.toBeInTheDocument();
  });

  it('não sobrescreve um logradouro que a pessoa digitou', async () => {
    const u = userEvent.setup();
    viacep(() => json({ logradouro: 'Avenida Sampaio Vidal', bairro: 'Centro' }));
    renderizar();
    await u.type(screen.getByLabelText('Logradouro'), 'Minha Rua');
    await u.type(screen.getByLabelText('CEP'), '17500000');
    await waitFor(() => expect(fetchFalso.mock.calls.some(([url]) => String(url).includes('viacep'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Logradouro')).toHaveValue('Minha Rua');
  });

  it('falha de rede: aviso discreto e o formulário segue manual', async () => {
    const u = userEvent.setup();
    viacep(() => Promise.reject(new TypeError('offline')));
    renderizar();
    await u.type(screen.getByLabelText('CEP'), '17500000');
    expect(await screen.findByText('Não foi possível buscar o CEP — preencha o endereço')).toBeInTheDocument();
    expect(screen.getByLabelText('Logradouro')).toBeEnabled();
  });

  it('CEP que o ViaCEP diz não existir ({ erro: true }) tem aviso próprio, diferente de falha de rede', async () => {
    const u = userEvent.setup();
    viacep(() => json({ erro: true }));
    renderizar();
    await u.type(screen.getByLabelText('CEP'), '17539999');
    expect(await screen.findByText('CEP não encontrado — confira os números ou preencha o endereço')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível buscar o CEP — preencha o endereço')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Logradouro')).toBeEnabled();
  });

  it('sem resposta em 3 s a busca é abortada e o aviso aparece', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      viacep(() => new Promise<Response>(() => undefined)); // nunca responde; quem resolve é o abort
      fetchFalso.mockImplementation((url: string, init?: RequestInit) => {
        if (String(url).startsWith('https://viacep.com.br/')) {
          return new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError'))));
        }
        return Promise.resolve(json([BAIRRO]));
      });
      renderizar();
      await u.type(screen.getByLabelText('CEP'), '17500000');
      expect(screen.getByText('Buscando o endereço…')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(screen.getByText('Não foi possível buscar o CEP — preencha o endereço')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
