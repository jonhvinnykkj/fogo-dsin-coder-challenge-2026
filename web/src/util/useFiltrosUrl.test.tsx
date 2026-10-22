// Filtros na URL: valor inválido é ignorado, filtro e página empilham no histórico (Voltar), a digitação na busca troca a entrada.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { filtrosEquipamentoSchema } from '../../../shared/schemas';
import { useCorrigirPagina, useFiltrosUrl } from './useFiltrosUrl';

function Sonda({ total }: { total?: number }) {
  const url = useFiltrosUrl(filtrosEquipamentoSchema);
  const local = useLocation();
  const navegar = useNavigate();
  useCorrigirPagina(url, Number(url.ler('pagina')) || 1, total, 25);
  return (
    <div>
      <output data-testid="url">{local.search}</output>
      <output data-testid="lidos">{JSON.stringify({ situacao: url.ler('situacao') ?? null, tipo: url.ler('tipo') ?? null, pagina: url.ler('pagina') ?? null, busca: url.ler('busca') ?? null, temAlgum: url.temAlgum })}</output>
      <button onClick={() => url.mudar('situacao', 'furtado')}>filtrar</button>
      <button onClick={() => url.mudar('pagina', '2')}>pagina 2</button>
      <button onClick={() => url.mudar('busca', 'abc', { substituir: true })}>digitar</button>
      <button onClick={() => navegar(-1)}>voltar</button>
    </div>
  );
}

const montar = (inicial: string, total?: number) =>
  render(<MemoryRouter initialEntries={['/equipamentos', inicial]} initialIndex={1}><Sonda total={total} /></MemoryRouter>);
const lidos = () => JSON.parse(screen.getByTestId('lidos').textContent!) as Record<string, unknown>;

describe('useFiltrosUrl', () => {
  it.each(['?situacao=xyz', '?tipo=foo', '?pagina=1.5', '?pagina=0', '?pagina=abc', `?busca=${'a'.repeat(101)}`])('ignora o valor inválido %s', (consulta) => {
    montar(consulta);
    expect(lidos()).toEqual({ situacao: null, tipo: null, pagina: null, busca: null, temAlgum: false });
  });

  it('mantém os válidos mesmo com um inválido ao lado', () => {
    montar('?situacao=furtado&tipo=foo&pagina=2');
    expect(lidos()).toMatchObject({ situacao: 'furtado', tipo: null, pagina: '2', temAlgum: true });
  });

  it('filtro e página empilham no histórico: Voltar desfaz uma mudança por vez em vez de sair da lista', async () => {
    const u = userEvent.setup();
    montar('?x=1');
    await u.click(screen.getByText('filtrar'));
    await u.click(screen.getByText('pagina 2'));
    expect(screen.getByTestId('url').textContent).toBe('?x=1&situacao=furtado&pagina=2');
    await u.click(screen.getByText('voltar'));
    expect(screen.getByTestId('url').textContent).toBe('?x=1&situacao=furtado');
    await u.click(screen.getByText('voltar'));
    expect(screen.getByTestId('url').textContent).toBe('?x=1');
  });

  it('a digitação na busca troca a entrada (não empilha)', async () => {
    const u = userEvent.setup();
    montar('?x=1');
    await u.click(screen.getByText('digitar'));
    expect(screen.getByTestId('url').textContent).toBe('?x=1&busca=abc');
    await u.click(screen.getByText('voltar'));
    expect(screen.getByTestId('url').textContent).toBe(''); // voltou para a lista anterior, não para "?x=1"
  });

  it('página além do fim vai para a última (14 páginas: 350 itens)', () => {
    act(() => { montar('?pagina=15', 350); });
    expect(screen.getByTestId('url').textContent).toBe('?pagina=14');
  });

  it('página 2 de uma lista que cabe numa página só volta para a página 1 (sem ?pagina)', () => {
    act(() => { montar('?pagina=2', 10); });
    expect(screen.getByTestId('url').textContent).toBe('');
  });
});
