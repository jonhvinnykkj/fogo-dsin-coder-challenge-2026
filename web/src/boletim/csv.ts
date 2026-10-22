// CSV gerado no navegador para abrir certinho no Excel em português: BOM do UTF-8 (senão os acentos quebram), ";" como
// separador (a vírgula é a casa decimal no Brasil), números com vírgula e sem separador de milhar, linhas com CRLF.

export interface ColunaCsv<T> {
  titulo: string;
  valor: (item: T) => string | number | null | undefined;
  /** Casas decimais fixas para números (ex.: 6 nas coordenadas). Sem ela, até 6 casas, só as necessárias. */
  casas?: number;
}

const BOM = '﻿';
const SEPARADOR = ';';
const FIM_DE_LINHA = '\r\n';

function numero(n: number, casas: number | undefined): string {
  return n.toLocaleString('pt-BR', {
    useGrouping: false,
    minimumFractionDigits: casas ?? 0,
    maximumFractionDigits: casas ?? 6,
  });
}

/**
 * Texto que começa com =, +, - ou @ seria lido como fórmula pelo Excel (injeção de fórmula): ganha um apóstrofo na
 * frente. Aspas, ";" e quebra de linha pedem o campo entre aspas, com as aspas internas dobradas.
 */
function texto(t: string): string {
  const seguro = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function celula(v: string | number | null | undefined, casas: number | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return typeof v === 'number' ? numero(v, casas) : texto(v);
}

export function gerarCsv<T>(colunas: readonly ColunaCsv<T>[], itens: readonly T[]): string {
  const linhas = [
    colunas.map((c) => texto(c.titulo)).join(SEPARADOR),
    ...itens.map((item) => colunas.map((c) => celula(c.valor(item), c.casas)).join(SEPARADOR)),
  ];
  return BOM + linhas.map((l) => l + FIM_DE_LINHA).join('');
}

/** Entrega o arquivo ao usuário (download), sem passar pelo servidor. */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.append(link);
  link.click();
  link.remove();
  // Depois do clique o navegador já tem o arquivo; liberar na hora pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
