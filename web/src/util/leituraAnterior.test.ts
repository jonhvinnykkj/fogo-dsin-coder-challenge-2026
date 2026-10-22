// Ficha lateral: a leitura da hora não pode passar por atual quando a situação mudou depois dela.
import { describe, expect, it } from 'vitest';
import type { HistoricoSituacao } from '../../../shared/modelos';
import { mudancaDepoisDaLeitura } from './leituraAnterior';

const mudanca = (em: string, para: HistoricoSituacao['para'] = 'mau_funcionamento'): HistoricoSituacao =>
  ({ id: 1, equipamentoId: 1, de: 'operacional', para, motivo: 'Falha simulada', em });

describe('mudancaDepoisDaLeitura', () => {
  it('falha dentro da hora da leitura: a leitura é de antes (ou mistura os dois lados)', () => {
    expect(mudancaDepoisDaLeitura('2026-10-22T14:00:00.000Z', [mudanca('2026-10-22T14:32:00.000Z')])?.para).toBe('mau_funcionamento');
  });

  it('falha depois da leitura (sem leitura nova desde então) também é de antes', () => {
    expect(mudancaDepoisDaLeitura('2026-10-22T14:00:00.000Z', [mudanca('2026-10-22T16:00:00.000Z')])).toBeDefined();
  });

  it('leitura de uma hora que começou depois da última mudança é a atual', () => {
    expect(mudancaDepoisDaLeitura('2026-10-22T15:00:00.000Z', [mudanca('2026-10-22T14:32:00.000Z')])).toBeUndefined();
  });

  it('olha a mudança mais recente, não a primeira da lista', () => {
    const lista = [mudanca('2026-10-22T10:00:00.000Z', 'em_manutencao'), mudanca('2026-10-22T14:32:00.000Z')];
    expect(mudancaDepoisDaLeitura('2026-10-22T14:00:00.000Z', lista)?.para).toBe('mau_funcionamento');
  });

  it('sem histórico, nada a avisar', () => {
    expect(mudancaDepoisDaLeitura('2026-10-22T14:00:00.000Z', [])).toBeUndefined();
  });
});
