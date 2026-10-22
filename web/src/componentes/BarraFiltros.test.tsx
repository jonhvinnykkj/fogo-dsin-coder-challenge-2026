import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BarraFiltros, type DefinicaoFiltro } from './BarraFiltros';

const definicoes: DefinicaoFiltro[] = [
  { grupo: 'Equipamentos e agentes', tipo: 'selecao', chave: 'regiao', rotulo: 'Região', opcoes: [{ valor: 'Centro', rotulo: 'Centro' }] },
  { grupo: 'Só equipamentos', tipo: 'pilulas', chave: 'situacao', rotulo: 'Situação do equipamento', opcoes: [{ valor: 'furtado', rotulo: 'Furtado' }] },
  { grupo: 'Só agentes', tipo: 'pilulas', chave: 'categoriaAgente', rotulo: 'Categoria do agente', opcoes: [{ valor: 'guarda_municipal', rotulo: 'Guarda municipal' }] },
];

describe('BarraFiltros com grupos', () => {
  it('cada grupo sai sob o título do que afeta, e o filtro continua funcionando dentro dele', () => {
    const aoMudar = vi.fn();
    render(<BarraFiltros filtros={definicoes} valores={{}} onChange={aoMudar} />);
    const agentes = screen.getByRole('group', { name: 'Só agentes' });
    expect(within(agentes).getByText('Só agentes')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Só equipamentos' })).getByRole('button', { name: 'Furtado' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Equipamentos e agentes' })).getByLabelText('Região')).toBeInTheDocument();
    fireEvent.click(within(agentes).getByRole('button', { name: 'Guarda municipal' }));
    expect(aoMudar).toHaveBeenCalledWith('categoriaAgente', ['guarda_municipal']);
  });

  it('sem grupo nos filtros, nada muda: sem títulos', () => {
    render(<BarraFiltros filtros={definicoes.map((d) => ({ ...d, grupo: undefined }))} valores={{}} onChange={() => {}} />);
    expect(screen.queryByText('Só agentes')).toBeNull();
  });
});
