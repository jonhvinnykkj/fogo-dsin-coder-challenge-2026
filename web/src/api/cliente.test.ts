import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ErroApi, montarUrl } from './cliente';

function resposta(status: number, corpo?: unknown): Response {
  if (corpo === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente da API', () => {
  it('monta a query string sem vazios e com listas separadas por vírgula', () => {
    expect(montarUrl('/api/central/mapa', { tipo: ['radar', 'camera'], situacao: [], regiao: 'Norte', bairroId: 4, busca: '', orgao: undefined }))
      .toBe('/api/central/mapa?tipo=radar%2Ccamera&regiao=Norte&bairroId=4');
    expect(montarUrl('/api/alertas')).toBe('/api/alertas');
  });

  it('GET devolve o JSON', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(200, { ok: true }));
    vi.stubGlobal('fetch', fetchFalso);
    await expect(api.get('/api/saude')).resolves.toEqual({ ok: true });
    expect(fetchFalso).toHaveBeenCalledWith('/api/saude', expect.objectContaining({ method: 'GET' }));
  });

  it('erro de validação vira ErroApi com status, mensagem e campos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(400, { erro: 'Dados inválidos', campos: { lat: 'A coordenada precisa ficar dentro de Marília' } })));
    const erro = await api.post('/api/equipamentos', { tipo: 'radar' }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 400, erro: 'Dados inválidos', campos: { lat: 'A coordenada precisa ficar dentro de Marília' } });
  });

  it('falha de rede vira "Sem conexão com o servidor do F.O.G.O."', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/api/bairros')).rejects.toMatchObject({ status: 0, erro: 'Sem conexão com o servidor do F.O.G.O.' });
  });

  it('erro sem corpo JSON (proxy fora do ar) também vira mensagem em português', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(api.get('/api/bairros')).rejects.toMatchObject({ status: 502, erro: 'Sem conexão com o servidor do F.O.G.O.' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(api.get('/api/bairros')).rejects.toMatchObject({ status: 500, erro: 'O servidor do F.O.G.O. respondeu com erro (500).' });
  });

  it('DELETE com 204 resolve sem corpo; PATCH manda JSON', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(204));
    vi.stubGlobal('fetch', fetchFalso);
    await expect(api.del('/api/agentes/3')).resolves.toBeUndefined();

    fetchFalso.mockResolvedValue(resposta(200, { id: 1 }));
    await api.patch('/api/alertas/1/resolver', { motivo: 'ok' });
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/alertas/1/resolver', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ motivo: 'ok' }),
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    }));
  });
});
