import { describe, expect, it } from 'vitest';
import { contagemAteLimite } from './numeros';

describe('contagemAteLimite', () => {
  // /api/alertas devolve no máximo `limite` itens (os mais recentes) e não diz o total: chegando ao limite, pode haver mais.
  it('abaixo do limite mostra o número; no limite, "200+"', () => {
    expect(contagemAteLimite(0, 200)).toBe('0');
    expect(contagemAteLimite(37, 200)).toBe('37');
    expect(contagemAteLimite(199, 200)).toBe('199');
    expect(contagemAteLimite(200, 200)).toBe('200+');
    expect(contagemAteLimite(1500, 1000)).toBe('1.000+');
  });
});
