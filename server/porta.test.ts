import { describe, expect, it } from 'vitest';
import { ErroDePorta, lerPorta, mensagemNoAr, mensagemPortaOcupada } from './porta';

describe('lerPorta', () => {
  it('usa 3333 quando PORT não vem ou vem vazio', () => {
    expect(lerPorta(undefined)).toBe(3333);
    expect(lerPorta('')).toBe(3333);
    expect(lerPorta('  ')).toBe(3333);
  });

  it('aceita um número de porta válido', () => {
    expect(lerPorta('3399')).toBe(3399);
    expect(lerPorta(' 8080 ')).toBe(8080);
    expect(lerPorta('65535')).toBe(65535);
  });

  it.each(['abc', '0', '65536', '-1', '33.3', '3333x', '1e3'])('recusa PORT=%s com mensagem clara', (valor) => {
    expect(() => lerPorta(valor)).toThrow(ErroDePorta);
    expect(() => lerPorta(valor)).toThrow(/não é uma porta válida.*1 a 65535/);
  });
});

describe('mensagemPortaOcupada', () => {
  it('sugere a próxima porta', () => {
    expect(mensagemPortaOcupada(3333)).toBe('A porta 3333 está em uso. Rode com PORT=3334 npm start (Windows PowerShell: $env:PORT=3334; npm start · cmd: set PORT=3334&& npm start)');
    expect(mensagemPortaOcupada(3399)).toBe('A porta 3399 está em uso. Rode com PORT=3400 npm start (Windows PowerShell: $env:PORT=3400; npm start · cmd: set PORT=3400&& npm start)');
  });

  it('não sugere porta fora da faixa', () => {
    expect(mensagemPortaOcupada(65535)).toBe('A porta 65535 está em uso. Rode com PORT=65534 npm start (Windows PowerShell: $env:PORT=65534; npm start · cmd: set PORT=65534&& npm start)');
  });
});

describe('mensagemNoAr', () => {
  it('fora do Docker, mostra a própria porta', () => {
    expect(mensagemNoAr(3333, 'data/fogo.db')).toBe('F.O.G.O. no ar em http://localhost:3333 (banco: data/fogo.db)');
    expect(mensagemNoAr(3333, 'data/fogo.db', '  ')).toBe('F.O.G.O. no ar em http://localhost:3333 (banco: data/fogo.db)');
  });

  it('no Docker, mostra a porta publicada e explica que 3333 é a do contêiner', () => {
    expect(mensagemNoAr(3333, '/app/data/fogo.db', '3341')).toBe(
      'F.O.G.O. no ar. Abra http://localhost:3341 (porta 3333 dentro do contêiner; banco: /app/data/fogo.db)',
    );
  });
});
