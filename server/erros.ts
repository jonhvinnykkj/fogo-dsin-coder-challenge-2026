/** Erro de negócio com status HTTP; vira `{ erro, campos? }` no manipulador global. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (o: string) => new ErroApi(404, `${o} não encontrado`);
export const conflito = (m: string) => new ErroApi(409, m);
export const invalido = (m: string, campos?: Record<string, string>) => new ErroApi(400, m, campos);
export const dadosInvalidos = (campos: Record<string, string>) => new ErroApi(400, 'Dados inválidos', campos);
