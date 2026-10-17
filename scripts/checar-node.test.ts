import { describe, expect, it } from 'vitest';
import { mensagem, MINIMA, versaoAtende } from './checar-node.mjs';

describe('checar-node', () => {
  it('aceita a versão mínima (22.14) e as mais novas', () => {
    expect(MINIMA).toBe('22.14.0');
    for (const v of ['v22.14.0', '22.14.0', 'v22.14.1', 'v22.22.2', 'v23.0.0', 'v24.1.0', 'v100.0.0']) expect(versaoAtende(v), v).toBe(true);
  });

  it('recusa as mais antigas, comparando número a número (22.9 é mais velha que 22.14)', () => {
    for (const v of ['v22.13.1', 'v22.9.0', 'v22.0.0', 'v20.19.0', 'v18.20.4', 'v8.17.0']) expect(versaoAtende(v), v).toBe(false);
  });

  it('a mensagem diz a versão encontrada e o que fazer', () => {
    expect(mensagem('v20.11.0')).toBe(
      'O F.O.G.O. precisa do Node.js 22.14 ou mais novo (você tem v20.11.0). Instale a versão LTS em https://nodejs.org ou rode com Docker: docker compose up --build',
    );
  });
});
