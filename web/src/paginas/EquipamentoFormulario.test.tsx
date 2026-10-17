// Formulário de equipamento: campos por tipo, validação no cliente e erros do servidor no campo certo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bairro } from '../../../shared/modelos';
import EquipamentoFormulario from './EquipamentoFormulario';

// O mapa (Leaflet) não roda no jsdom: o seletor de ponto vira um stub com os mesmos campos de erro.
vi.mock('../componentes/SeletorPontoMapa', () => ({
  SeletorPontoMapa: ({ erro }: { erro?: string }) => <div data-testid="seletor-mapa">{erro && <p role="alert">{erro}</p>}</div>,
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
