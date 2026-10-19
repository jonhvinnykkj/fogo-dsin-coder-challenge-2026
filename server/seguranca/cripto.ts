// Senhas (scrypt com sal), tokens de sessão e tokens de dispositivo. Só node:crypto, sem dependência externa.
import { createHash, randomBytes, randomInt, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

// Custo do scrypt: N = 2^14 (o recomendado pela OWASP para scrypt), ~50 ms por conferência.
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 32;

function montar(sal: Buffer, hash: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

/** Hash da senha para guardar no banco: `scrypt$N$r$p$sal$hash`. */
export function gerarHashSenha(senha: string): string {
  const sal = randomBytes(16);
  return montar(sal, scryptSync(senha, sal, TAMANHO, { N, r: R, p: P }));
}

/** Confere a senha em tempo constante. Hash malformado nunca confere. Assíncrono: não trava o servidor durante o cálculo. */
export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salB64, hashB64] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hashB64, 'base64url');
  if (esperado.length === 0) return false;
  const calculado = await new Promise<Buffer>((ok, falha) =>
    scrypt(senha, Buffer.from(salB64, 'base64url'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) }, (erro, chave) =>
      erro ? falha(erro) : ok(chave)),
  );
  return timingSafeEqual(calculado, esperado);
}

// Sem letras e números que se confundem (0/O, 1/l/I).
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Senha aleatória legível, ex.: "k7mp-2qxt-9nbw" (14 caracteres, ~70 bits). */
export function gerarSenhaAleatoria(): string {
  const bloco = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `${bloco()}-${bloco()}-${bloco()}`;
}

export const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Valor do cookie de sessão: 32 bytes aleatórios. No banco vai só o SHA-256 dele. */
export const gerarTokenSessao = () => randomBytes(32).toString('base64url');

// ---- Tokens de dispositivo (POST /api/telemetria) ----

const PREFIXO_TOKEN = 'sha256:';

export const gerarTokenDispositivo = () => randomBytes(16).toString('hex');

/** O que fica no banco: `sha256:<hex>`. O token em si só existe no dispositivo. */
export const hashTokenDispositivo = (token: string) => PREFIXO_TOKEN + sha256(token);

export const ehHashDeToken = (guardado: string) => guardado.startsWith(PREFIXO_TOKEN);

/** Compara o token recebido com o hash guardado, em tempo constante. */
export function tokenDispositivoConfere(token: string, guardado: string): boolean {
  const a = Buffer.from(hashTokenDispositivo(token));
  const b = Buffer.from(guardado);
  return a.length === b.length && timingSafeEqual(a, b);
}
