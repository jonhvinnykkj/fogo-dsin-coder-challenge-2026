// Painel de regiões: com recorte da Central, avisa que mostra só aquele lugar; sem regiões no recorte, explica.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StatusRegiao } from '../../../shared/modelos';
import { PainelRegioes } from './PainelRegioes';

const norte = { regiao: 'Norte', indice: 40, nivel: 'atencao', motivos: ['2 equipamentos indisponíveis'], bairros: [] } as StatusRegiao;

describe('PainelRegioes', () => {
  it('com recorte, diz qual é', () => {
    render(<PainelRegioes regioes={[norte]} recorte="região Norte" />);
    expect(screen.getByText('Só região Norte, como no filtro da Central.')).toBeInTheDocument();
  });

  it('sem recorte, não mostra o aviso', () => {
    render(<PainelRegioes regioes={[norte]} />);
    expect(screen.queryByText(/como no filtro da Central/)).not.toBeInTheDocument();
  });

  it('lista vazia no recorte explica em vez de ficar em branco', () => {
    render(<PainelRegioes regioes={[]} recorte="Cascata" />);
    expect(screen.getByText('Nenhuma região neste recorte')).toBeInTheDocument();
  });
});
