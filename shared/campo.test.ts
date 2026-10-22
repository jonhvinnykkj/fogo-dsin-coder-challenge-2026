import { describe, expect, it } from 'vitest';
import { formatarDistancia, reporteCampoSchema, SITUACAO_DO_PROBLEMA } from './campo';

describe('formatarDistancia', () => {
  it('abaixo de 1 km mostra metros inteiros; a partir de 1 km, quilômetros com uma casa', () => {
    expect(formatarDistancia(0)).toBe('0 m');
    expect(formatarDistancia(349.6)).toBe('350 m');
    expect(formatarDistancia(999.6)).toBe('1,0 km'); // arredondado já é 1 km: não mostra "1000 m"
    expect(formatarDistancia(1234)).toBe('1,2 km');
    expect(formatarDistancia(12_500)).toBe('12,5 km');
  });
});

describe('reporteCampoSchema', () => {
  it('aceita os três problemas, com observação opcional (aparada)', () => {
    expect(reporteCampoSchema.parse({ equipamentoId: 3, problema: 'vandalizado', observacao: '  pichado e com a lente quebrada  ' }))
      .toEqual({ equipamentoId: 3, problema: 'vandalizado', observacao: 'pichado e com a lente quebrada' });
    expect(reporteCampoSchema.parse({ equipamentoId: 3, problema: 'furtado' })).toEqual({ equipamentoId: 3, problema: 'furtado', observacao: '' });
  });

  it('recusa problema desconhecido, equipamento ausente e observação longa, com mensagens em português', () => {
    const r = reporteCampoSchema.safeParse({ problema: 'quebrado', observacao: 'x'.repeat(281) });
    expect(r.success).toBe(false);
    const campos = Object.fromEntries(r.error!.issues.map((i) => [i.path.join('.'), i.message]));
    expect(campos).toEqual({
      equipamentoId: 'Escolha o equipamento',
      problema: 'Problema: escolha mau funcionamento, furtado ou vandalizado',
      observacao: 'A observação pode ter até 280 caracteres',
    });
  });

  it('vandalizado continua na rua, mas sem funcionar: vira mau funcionamento', () => {
    expect(SITUACAO_DO_PROBLEMA).toEqual({ mau_funcionamento: 'mau_funcionamento', furtado: 'furtado', vandalizado: 'mau_funcionamento' });
  });
});
