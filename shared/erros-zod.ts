// Mensagens do zod em português do Brasil. Registrado globalmente ao importar este módulo
// (servidor e, depois, interface). Schemas com mensagem própria continuam valendo.
import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

const TIPOS: Record<string, string> = {
  string: 'texto',
  number: 'número',
  boolean: 'verdadeiro ou falso',
  array: 'lista',
  object: 'objeto',
  integer: 'número inteiro',
  date: 'data',
};

const FORMATOS: Record<string, string> = {
  email: 'e-mail',
  url: 'endereço da internet',
  uuid: 'identificador',
  datetime: 'data e hora',
  regex: 'formato esperado',
};

const plural = (n: number | bigint, um: string, varios: string) => `${n} ${Number(n) === 1 ? um : varios}`;

export const errorMapPtBr: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') return { message: 'Campo obrigatório' };
      return { message: `Tipo inválido: esperado ${TIPOS[issue.expected] ?? issue.expected}` };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Chave não reconhecida: ${issue.keys.join(', ')}` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Valor fora das opções: ${issue.options.join(', ')}` };
    case ZodIssueCode.invalid_literal:
      return { message: 'Valor inválido' };
    case ZodIssueCode.invalid_union:
      return { message: 'Valor inválido' };
    case ZodIssueCode.invalid_string: {
      const nome = typeof issue.validation === 'string' ? (FORMATOS[issue.validation] ?? issue.validation) : 'formato esperado';
      return { message: typeof issue.validation === 'string' && issue.validation !== 'regex' ? `Informe um ${nome} válido` : 'Texto em formato inválido' };
    }
    case ZodIssueCode.too_small: {
      const { minimum, inclusive } = issue;
      if (issue.type === 'string') return { message: `Texto curto demais: mínimo de ${plural(minimum, 'caractere', 'caracteres')}` };
      if (issue.type === 'array') return { message: `Escolha pelo menos ${plural(minimum, 'item', 'itens')}` };
      return { message: inclusive ? `O valor mínimo é ${minimum}` : `O valor precisa ser maior que ${minimum}` };
    }
    case ZodIssueCode.too_big: {
      const { maximum, inclusive } = issue;
      if (issue.type === 'string') return { message: `Texto longo demais: máximo de ${plural(maximum, 'caractere', 'caracteres')}` };
      if (issue.type === 'array') return { message: `Escolha no máximo ${plural(maximum, 'item', 'itens')}` };
      return { message: inclusive ? `O valor máximo é ${maximum}` : `O valor precisa ser menor que ${maximum}` };
    }
    case ZodIssueCode.not_multiple_of:
      return { message: `O valor precisa ser múltiplo de ${issue.multipleOf}` };
    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida' };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(errorMapPtBr);
