import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorMapPtBr } from './erros-zod';

const msg = (schema: z.ZodTypeAny, valor: unknown) => {
  const r = schema.safeParse(valor, { errorMap: errorMapPtBr });
  if (r.success) throw new Error('esperava falha');
  return r.error.issues[0]!.message;
};

describe('mensagens do zod em pt-BR', () => {
  it('obrigatório', () => expect(msg(z.object({ a: z.string() }), {}).toLowerCase()).toContain('obrigatório'));
  it('tipo inválido', () => expect(msg(z.number(), 'x')).toMatch(/número/));
  it('chave não reconhecida', () => expect(msg(z.object({}).strict(), { zz: 1 })).toMatch(/não reconhecida.*zz/));
  it('número abaixo e acima do limite', () => {
    expect(msg(z.number().min(10), 5)).toMatch(/10/);
    expect(msg(z.number().max(120), 500)).toMatch(/120/);
    expect(msg(z.number().min(10), 5)).not.toMatch(/Number|must/);
  });
  it('texto curto e longo demais', () => {
    expect(msg(z.string().min(3), 'ab')).toMatch(/3 caracteres/);
    expect(msg(z.string().max(2), 'abc')).toMatch(/2 caracteres/);
  });
  it('valor fora das opções', () => expect(msg(z.enum(['a', 'b']), 'c')).toMatch(/a, b/));
  it('formato de texto inválido', () => expect(msg(z.string().email(), 'x')).toMatch(/e-mail/));
});
