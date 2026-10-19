import { describe, expect, it } from 'vitest';
import { gerarCsv, type ColunaCsv } from './csv';

interface Linha {
  nome: string;
  valor?: number | null;
  texto?: string | null;
}

const colunas: ColunaCsv<Linha>[] = [
  { titulo: 'Nome', valor: (l) => l.nome },
  { titulo: 'Valor', valor: (l) => l.valor },
  { titulo: 'Texto', valor: (l) => l.texto },
];

describe('gerarCsv (Excel em português)', () => {
  it('começa com o BOM do UTF-8, separa com ";" e termina cada linha com CRLF', () => {
    expect(gerarCsv(colunas, [{ nome: 'Marília', valor: 3, texto: 'ok' }])).toBe('﻿Nome;Valor;Texto\r\nMarília;3;ok\r\n');
  });

  it('números com vírgula decimal e sem separador de milhar; casas fixas quando a coluna pede', () => {
    const comCasas: ColunaCsv<Linha>[] = [{ titulo: 'Lat', valor: (l) => l.valor, casas: 6 }, { titulo: 'Livre', valor: (l) => l.valor }];
    expect(gerarCsv(comCasas, [{ nome: '', valor: -22.2138 }, { nome: '', valor: 12345.5 }]))
      .toBe('﻿Lat;Livre\r\n-22,213800;-22,2138\r\n12345,500000;12345,5\r\n');
  });

  it('vazio, nulo e indefinido viram célula vazia', () => {
    expect(gerarCsv(colunas, [{ nome: '', valor: null }])).toBe('﻿Nome;Valor;Texto\r\n;;\r\n');
  });

  it('põe entre aspas (dobrando as aspas internas) o texto com ";", aspas ou quebra de linha', () => {
    const csv = gerarCsv(colunas, [{ nome: 'Rua "A"; nº 2', texto: 'fundos\nportão azul' }]);
    expect(csv).toBe('﻿Nome;Valor;Texto\r\n"Rua ""A""; nº 2";;"fundos\nportão azul"\r\n');
  });

  it('texto que o Excel leria como fórmula (=, +, -, @) ganha um apóstrofo; número negativo não', () => {
    const csv = gerarCsv(colunas, [{ nome: '=HIPERLINK("x")', valor: -5, texto: '@soma' }]);
    expect(csv).toBe(`﻿Nome;Valor;Texto\r\n"'=HIPERLINK(""x"")";-5;'@soma\r\n`);
  });

  it('sem linhas, só o cabeçalho', () => {
    expect(gerarCsv(colunas, [])).toBe('﻿Nome;Valor;Texto\r\n');
  });
});
