import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EtiquetaSituacao } from './EtiquetaSituacao';

describe('EtiquetaSituacao', () => {
  it('furtado: bloco cheio magenta com o rótulo "Furtado" em texto branco', () => {
    render(<EtiquetaSituacao situacao="furtado" />);
    const bloco = screen.getByText('Furtado').closest('[data-situacao]');
    expect(bloco).toHaveAttribute('data-situacao', 'furtado');
    expect(bloco).toHaveStyle({ backgroundColor: '#C2185B', color: '#FFFFFF' });
  });

  it('operacional: texto grafite sobre o verde (contraste AA)', () => {
    render(<EtiquetaSituacao situacao="operacional" />);
    expect(screen.getByText('Operacional').closest('[data-situacao]')).toHaveStyle({ backgroundColor: '#1F9D55', color: '#1E1E1F' });
  });

  it('não instalado: contorno tracejado em vez de bloco cheio', () => {
    render(<EtiquetaSituacao situacao="nao_instalado" />);
    const bloco = screen.getByText('Não instalado').closest('[data-situacao]');
    expect(bloco).toHaveStyle({ borderStyle: 'dashed', borderColor: '#9CA3AF' });
  });
});
