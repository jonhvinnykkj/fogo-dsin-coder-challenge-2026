import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { comprimirPasta, TAMANHO_MINIMO } from './comprimir-build.mjs';

let pasta: string | undefined;
afterEach(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true });
  pasta = undefined;
});

describe('comprimirPasta', () => {
  it('escreve .br e .gz que voltam ao original, nas subpastas, e só para texto grande', () => {
    pasta = mkdtempSync(join(tmpdir(), 'fogo-build-'));
    mkdirSync(join(pasta, 'assets'));
    const js = 'console.log("F.O.G.O.");\n'.repeat(400);
    writeFileSync(join(pasta, 'assets', 'index-abc.js'), js);
    writeFileSync(join(pasta, 'pequeno.css'), 'a{}'); // abaixo do mínimo
    writeFileSync(join(pasta, 'assets', 'logo.png'), Buffer.alloc(TAMANHO_MINIMO * 4)); // imagem: não é texto

    const { antes, depois } = comprimirPasta(pasta);

    const base = join(pasta, 'assets', 'index-abc.js');
    expect(brotliDecompressSync(readFileSync(`${base}.br`)).toString()).toBe(js);
    expect(gunzipSync(readFileSync(`${base}.gz`)).toString()).toBe(js);
    expect(existsSync(join(pasta, 'pequeno.css.br'))).toBe(false);
    expect(existsSync(join(pasta, 'assets', 'logo.png.br'))).toBe(false);
    expect(antes).toBe(js.length);
    expect(depois).toBeLessThan(antes / 10);
  });
});
