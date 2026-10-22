import { describe, expect, it } from 'vitest';
import { listar } from './empacotar.mjs';

describe('empacotar: o que entra no zip', () => {
  const arquivos = listar().map((a) => a.split('\\').join('/'));

  it('leva o sistema e a documentação para quem avalia', () => {
    for (const esperado of ['README.md', 'package.json', 'Dockerfile', 'docker-compose.yml', 'server/index.ts', 'docs/GUIA-DO-TIME.md', 'docs/ENUNCIADO.md']) {
      expect(arquivos).toContain(esperado);
    }
  });

  it('deixa de fora processo interno, o projeto do vídeo, cache de Python e o que se gera na máquina', () => {
    expect(arquivos.filter((a) => a.startsWith('docs/design/'))).toEqual([]);
    expect(arquivos.filter((a) => a.startsWith('video/'))).toEqual([]);
    expect(arquivos.filter((a) => /__pycache__|\.pyc$|\.DS_Store$|\.zip$|(^|\/)\.env/.test(a))).toEqual([]);
    expect(arquivos.filter((a) => /^(node_modules|dist|\.git)\//.test(a))).toEqual([]);
  });
});
