// Liga a segurança no servidor: sessão por cookie, autorização por papel, proteção de dados pessoais, auditoria,
// cabeçalhos de segurança (helmet) e limite de requisições. Chamado por criarApp ANTES de registrar as rotas: os
// ganchos valem para todas elas.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { ROTULO_PAPEL, type UsuarioSessao } from '../../shared/seguranca';
import { ErroApi } from '../erros';
import { dadosDaRequisicao, entidadeDaRota, fotografar, idDaEntidade, registrar } from './auditoria';
import { chaveDaRota, foraDaTabela, REGRAS, SO_O_PROPRIO_AGENTE } from './permissoes';
import { protegerResposta, veiculosDeAgentes } from './protecao';
import { DURACAO_SESSAO_MS, usuarioDaSessao } from './usuarios';

export const COOKIE_SESSAO = 'fogo_sessao';

export interface OpcoesSeguranca {
  /** Modo demonstração: libera POST /api/auth/demo (entrada com um clique por papel). Padrão: desligado. */
  demo?: boolean;
  /** Cookie só por HTTPS. Sem isto, vale quando a requisição já chega por HTTPS. */
  cookieSeguro?: boolean;
  /** Requisições por minuto por IP (padrão 600). */
  limitePorMinuto?: number;
  /** Tentativas de entrada por minuto por IP (padrão 10). */
  limiteEntradaPorMinuto?: number;
  /** De quanto em quanto tempo o tempo real (SSE) confere se a sessão do cliente ainda vale (padrão 5 s). */
  verificarSessaoMs?: number;
  /**
   * Aceita requisições de escrita com Origin do Vite (localhost:5173, que repassa /api). Padrão: só fora de produção
   * (NODE_ENV) e enquanto este servidor NÃO serve a interface compilada. `npm run dev` (ou `FOGO_DEV=1`) força o desenvolvimento
   * mesmo com a pasta `dist/web` presente, que sobra de qualquer `npm start` anterior.
   */
  origensDeDesenvolvimento?: boolean;
  /** Pasta da interface compilada, para liberar no CSP o script inline do index.html. */
  pastaWeb?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioSessao;
    auditoria?: { antes: unknown; idResposta?: number };
  }
  interface FastifyInstance {
    seguranca: Required<Pick<OpcoesSeguranca, 'demo' | 'verificarSessaoMs'>> & {
      cookieSeguro: boolean;
      /** "MÉTODO /rota" de tudo o que foi registrado (o teste confere a tabela). */
      rotas: string[];
      /** Quem quer saber na hora que uma sessão acabou (o tempo real fecha a conexão dela). Devolve a função que cancela. */
      aoEncerrarSessao: (ouvinte: (token: string) => void) => () => void;
      /** Avisa que a sessão com este cookie foi encerrada (saída do sistema). */
      avisarSessaoEncerrada: (token: string) => void;
    };
  }
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Em desenvolvimento a interface vem do Vite (5173), que repassa /api para cá. */
const ORIGENS_DE_DESENVOLVIMENTO = new Set(['localhost:5173', '127.0.0.1:5173']);
/** Telemetria vem de dispositivo (não de navegador) e se autentica pelo token: não há Origin a conferir. */
const SEM_CONFERIR_ORIGEM = new Set(['/api/telemetria']);

const servindoInterface = (pastaWeb?: string) => !!pastaWeb && existsSync(join(pastaWeb, 'index.html'));

const rotaDe = (req: FastifyRequest) => req.routeOptions.url;
/** HEAD é o GET sem corpo: segue a mesma regra. */
const chaveDe = (req: FastifyRequest, rota: string) => chaveDaRota(req.method === 'HEAD' ? 'GET' : req.method, rota);
/** Escritas auditadas pelo gancho genérico (entrada e saída são registradas pelas próprias rotas; telemetria é volume de máquina). */
const auditavel = (req: FastifyRequest, rota: string) =>
  !METODOS_SEGUROS.has(req.method) && rota.startsWith('/api/') && !rota.startsWith('/api/auth/') && rota !== '/api/telemetria';
const idDaUrl = (req: FastifyRequest) => {
  const id = Number((req.params as { id?: string } | undefined)?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function opcoesDoCookie(app: FastifyInstance, req: FastifyRequest) {
  return {
    path: '/',
    httpOnly: true, // o JavaScript da página não lê o cookie (XSS não rouba a sessão)
    sameSite: 'strict' as const, // outro site não consegue disparar requisições com ele (CSRF)
    secure: app.seguranca.cookieSeguro || req.protocol === 'https',
    maxAge: DURACAO_SESSAO_MS / 1000,
  };
}

/** Hashes dos <script> inline do index.html compilado, para o CSP liberar só eles. */
function hashesDeScriptsInline(pastaWeb?: string): string[] {
  if (!pastaWeb) return [];
  const arquivo = join(pastaWeb, 'index.html');
  if (!existsSync(arquivo)) return [];
  const html = readFileSync(arquivo, 'utf8');
  // O navegador troca CRLF por LF ao ler o HTML, antes de calcular o hash (no Windows o arquivo vem com CRLF).
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]!.replace(/\r\n?/g, '\n')).digest('base64')}'`,
  );
}

function conferirOrigem(req: FastifyRequest, aceitaDesenvolvimento: boolean): void {
  const origem = req.headers.origin;
  if (!origem) return; // sem Origin: não veio de uma página de outro site (curl, testes, mesmo site em navegadores antigos)
  let hostOrigem: string;
  try {
    hostOrigem = new URL(origem).host;
  } catch {
    throw new ErroApi(403, 'Origem da requisição inválida');
  }
  if (hostOrigem !== req.headers.host && !(aceitaDesenvolvimento && ORIGENS_DE_DESENVOLVIMENTO.has(hostOrigem))) {
    throw new ErroApi(403, 'Requisição recusada: veio de outro site');
  }
}

export async function instalarSeguranca(app: FastifyInstance, opcoes: OpcoesSeguranca = {}): Promise<void> {
  const db = app.ctx.db;
  const rotas: string[] = [];
  const ouvintesDeSessao = new Set<(token: string) => void>();
  app.decorate('seguranca', {
    demo: opcoes.demo ?? false,
    cookieSeguro: opcoes.cookieSeguro ?? false,
    verificarSessaoMs: opcoes.verificarSessaoMs ?? 5000,
    rotas,
    aoEncerrarSessao: (ouvinte: (token: string) => void) => {
      ouvintesDeSessao.add(ouvinte);
      return () => void ouvintesDeSessao.delete(ouvinte);
    },
    avisarSessaoEncerrada: (token: string) => {
      for (const ouvinte of [...ouvintesDeSessao]) ouvinte(token);
    },
  });
  app.addHook('onRoute', (r) => {
    for (const metodo of [r.method].flat()) rotas.push(chaveDaRota(metodo, r.url));
  });

  await app.register(fastifyCookie);

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      useDefaults: false, // os padrões trazem upgrade-insecure-requests, que quebra o http://localhost
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...hashesDeScriptsInline(opcoes.pastaWeb)],
        styleSrc: ["'self'", "'unsafe-inline'"], // o Leaflet posiciona marcadores com style="..."
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
        connectSrc: ["'self'", 'https://viacep.com.br'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"], // ninguém embute a central num iframe (clickjacking)
      },
    },
    crossOriginEmbedderPolicy: false, // os blocos do mapa vêm do OpenStreetMap
    hsts: false, // só faz sentido atrás de HTTPS; quem publicar com TLS liga no proxy
    // O padrão do helmet (no-referrer) faz o OpenStreetMap recusar os blocos do mapa ("Access blocked"): a política de uso
    // dele exige o Referer. Para outros sites vai só a origem (http://localhost:3333), nunca o caminho da página.
    frameguard: { action: 'deny' }, // o mesmo que frame-ancestors 'none', para navegadores que só entendem o cabeçalho antigo
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // Limites por rota, antes do plugin de limite ler a configuração de cada uma.
  const porMinuto = opcoes.limitePorMinuto ?? 600;
  const entradaPorMinuto = opcoes.limiteEntradaPorMinuto ?? 10;
  app.addHook('onRoute', (rota) => {
    if (rota.url === '/api/auth/entrar' || rota.url === '/api/auth/demo') {
      rota.config = { ...rota.config, rateLimit: { max: entradaPorMinuto, timeWindow: '1 minute' } };
    }
    if (rota.url === '/api/telemetria') {
      // Por dispositivo (o token), não por IP: um gateway pode mandar a leitura de muitos equipamentos.
      rota.config = {
        ...rota.config,
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => {
            const token = req.headers['x-dispositivo-token'];
            return typeof token === 'string' ? `disp:${createHash('sha256').update(token).digest('hex')}` : `ip:${req.ip}`;
          },
        },
      };
    }
    if (rota.url === '/api/stream') rota.config = { ...rota.config, rateLimit: { max: 30, timeWindow: '1 minute' } };
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: porMinuto,
    timeWindow: '1 minute',
    // Só a API conta. Cada recarga da interface pede dezenas de arquivos (scripts, estilos, fontes): contá-los faria
    // quem recarrega a página algumas vezes levar 429 e ver a tela sem estilo.
    allowList: (req) => !req.url.startsWith('/api/'),
    errorResponseBuilder: (_req, contexto) => ({
      statusCode: 429,
      erro: `Muitas requisições: tente de novo em ${Math.ceil(contexto.ttl / 1000)} s`,
    }),
  });

  const aceitaDesenvolvimento =
    opcoes.origensDeDesenvolvimento ??
    (process.env.FOGO_DEV === '1' ||
      process.env.npm_lifecycle_event === 'dev' || // o npm marca o script em execução; vale igual no Windows, sem variável no comando
      (process.env.NODE_ENV !== 'production' && !servindoInterface(opcoes.pastaWeb)));

  // 1) Quem é. Sem sessão numa rota protegida: 401 já aqui, antes de ler o corpo de quem nem entrou.
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const token = req.cookies[COOKIE_SESSAO];
    if (token) req.usuario = usuarioDaSessao(db, token);

    const rota = rotaDe(req);
    if (!rota || foraDaTabela(rota)) return; // 404, interface e documentação
    const regra = REGRAS[chaveDe(req, rota)];
    if (!regra) throw new ErroApi(403, 'Esta rota não tem permissão definida');
    if (regra === 'publico') return;
    if (!req.usuario) throw new ErroApi(401, 'Entre no sistema para continuar');
  });

  // 1b) O que o papel pode e de onde veio o pedido. Fica depois da leitura do corpo (preValidation) de propósito: o 403
  // chega à auditoria COM o que se tentou enviar. O custo é ler um corpo de até 256 KB de quem já tem sessão.
  app.addHook('preValidation', async (req: FastifyRequest) => {
    const rota = rotaDe(req);
    if (!rota || foraDaTabela(rota)) return;
    const chave = chaveDe(req, rota);
    const regra = REGRAS[chave];
    if (regra && regra !== 'publico' && req.usuario) {
      if (!regra.includes(req.usuario.papel)) {
        throw new ErroApi(403, `Seu perfil (${ROTULO_PAPEL[req.usuario.papel]}) não tem permissão para esta ação`);
      }
      if (req.usuario.papel === 'agente' && SO_O_PROPRIO_AGENTE.has(chave) && idDaUrl(req) !== req.usuario.agenteId) {
        throw new ErroApi(403, 'Como agente, você só pode mudar a sua própria situação e usar o seu próprio Modo Campo');
      }
    }
    // Toda escrita, pública ou não (entrar, demo e sair também): um site de fora não dispara nada em nome do navegador.
    if (!METODOS_SEGUROS.has(req.method) && !SEM_CONFERIR_ORIGEM.has(rota)) conferirOrigem(req, aceitaDesenvolvimento);
  });

  // 2) Fotografia de antes, para a auditoria (só chega aqui quem passou na autorização).
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const rota = rotaDe(req);
    if (!rota || !auditavel(req, rota)) return;
    req.auditoria = { antes: fotografar(db, entidadeDaRota(rota), idDaEntidade(rota, req.params, req.body)) };
  });

  // 3) Resposta ajustada ao papel (LGPD) e id do que foi criado (auditoria).
  app.addHook('preSerialization', async (req: FastifyRequest, _reply: FastifyReply, corpo: unknown) => {
    const rota = rotaDe(req);
    if (!rota) return corpo;
    if (req.auditoria && corpo && typeof corpo === 'object' && typeof (corpo as { id?: unknown }).id === 'number') {
      req.auditoria.idResposta = (corpo as { id: number }).id;
    }
    return req.usuario ? protegerResposta(rota, req.usuario.papel, corpo, req.usuario.agenteId, () => veiculosDeAgentes(db)) : corpo;
  });

  // 4) Registro na trilha: toda escrita de quem está logado, inclusive as recusadas (um 403 também conta uma história).
  // Sem sessão (401) não registra: senão qualquer um encheria a trilha sem nem ter conta.
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const rota = rotaDe(req);
    if (!rota || !req.usuario || !auditavel(req, rota)) return;
    const entidadeId = idDaEntidade(rota, req.params, req.body) ?? req.auditoria?.idResposta ?? null;
    const deuCerto = reply.statusCode < 400;
    registrar(db, {
      em: app.ctx.relogio.agora().toISOString(),
      usuarioId: req.usuario?.id ?? null,
      login: req.usuario?.login ?? null,
      papel: req.usuario?.papel ?? null,
      chave: chaveDe(req, rota),
      rota,
      entidadeId,
      status: reply.statusCode,
      antes: req.auditoria?.antes,
      depois: deuCerto ? fotografar(db, entidadeDaRota(rota), entidadeId) : null,
      dados: dadosDaRequisicao(rota, req.params, req.body),
      ip: req.ip,
    });
  });
}
