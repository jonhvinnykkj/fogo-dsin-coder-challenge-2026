// Cliente HTTP da interface: fala só com /api do próprio servidor (em desenvolvimento o Vite repassa para a porta 3333).
// Toda falha vira `ErroApi` com mensagem em português, pronta para mostrar na tela.

const SEM_CONEXAO = 'Sem conexão com o servidor do F.O.G.O.';

/** Erro de qualquer chamada à API. `status` 0 = o servidor não respondeu. `campos` vem dos erros de validação (`caracteristicas.velocidadeMaxima`, `tipo.0`…). */
export class ErroApi extends Error {
  readonly status: number;
  readonly erro: string;
  readonly campos?: Record<string, string>;

  constructor(status: number, erro: string, campos?: Record<string, string>) {
    super(erro);
    this.name = 'ErroApi';
    this.status = status;
    this.erro = erro;
    if (campos) this.campos = campos;
  }
}

export type ValorParametro = string | number | boolean | null | undefined | readonly (string | number)[];
export type Parametros = Record<string, ValorParametro>;

/** Junta caminho e parâmetros. Vazio, nulo e lista vazia ficam de fora; listas vão separadas por vírgula (`tipo=radar,camera`). */
export function montarUrl(caminho: string, params?: Parametros): string {
  if (!params) return caminho;
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      if (valor.length) busca.set(chave, valor.join(','));
      continue;
    }
    busca.set(chave, String(valor));
  }
  const qs = busca.toString();
  return qs ? `${caminho}?${qs}` : caminho;
}

async function lerErro(resposta: Response): Promise<ErroApi> {
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = undefined;
  }
  if (corpo && typeof corpo === 'object' && typeof (corpo as { erro?: unknown }).erro === 'string') {
    const { erro, campos } = corpo as { erro: string; campos?: Record<string, string> };
    return new ErroApi(resposta.status, erro, campos);
  }
  // Sem JSON: quem respondeu foi um proxy (o Vite, com o servidor desligado) ou algo antes do F.O.G.O.
  if (resposta.status === 502 || resposta.status === 503 || resposta.status === 504) return new ErroApi(resposta.status, SEM_CONEXAO);
  return new ErroApi(resposta.status, `O servidor do F.O.G.O. respondeu com erro (${resposta.status}).`);
}

async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown, params?: Parametros): Promise<T> {
  const init: RequestInit = { method: metodo, headers: { accept: 'application/json' } };
  if (corpo !== undefined) {
    // Só manda content-type quando há corpo: o Fastify recusa JSON vazio.
    init.headers = { accept: 'application/json', 'content-type': 'application/json' };
    init.body = JSON.stringify(corpo);
  }

  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(caminho, params), init);
  } catch {
    throw new ErroApi(0, SEM_CONEXAO);
  }

  if (!resposta.ok) throw await lerErro(resposta);
  if (resposta.status === 204) return undefined as T;
  const texto = await resposta.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

export const api = {
  get: <T>(caminho: string, params?: Parametros) => requisitar<T>('GET', caminho, undefined, params),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  put: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PUT', caminho, corpo),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, corpo),
  del: <T = void>(caminho: string) => requisitar<T>('DELETE', caminho),
};

/** Mensagem para mostrar ao usuário, venha o erro de onde vier. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.erro;
  if (erro instanceof Error && erro.message) return erro.message;
  return 'Algo deu errado. Tente de novo.';
}
