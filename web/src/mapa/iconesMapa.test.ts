// Destaque de manutenção nos marcadores e nos grupos da Central: o selo existe, tem forma própria (não só cor) e conta no grupo.
import { describe, expect, it } from 'vitest';
import { iconeEquipamento, iconeGrupo, resumoDoGrupo } from './iconesMapa';

const html = (i: ReturnType<typeof iconeEquipamento>) => String(i.options.html);

describe('selo de manutenção no marcador do equipamento', () => {
  it('imediata e atrasada ganham o selo cheio; próxima, o selo vazado; ok, nenhum', () => {
    expect(html(iconeEquipamento('radar', 'operacional', false, 'imediata'))).toContain('fogo-selo-man--urgente');
    expect(html(iconeEquipamento('radar', 'operacional', false, 'atrasada'))).toContain('fogo-selo-man--urgente');
    expect(html(iconeEquipamento('radar', 'operacional', false, 'proxima'))).toContain('fogo-selo-man--proxima');
    expect(html(iconeEquipamento('radar', 'operacional', false, 'ok'))).not.toContain('fogo-selo-man');
    expect(html(iconeEquipamento('radar', 'operacional'))).not.toContain('fogo-selo-man');
  });

  it('o selo é um desenho (SVG), não só uma cor, e os ícones são cacheados por manutenção', () => {
    expect(html(iconeEquipamento('camera', 'operacional', false, 'proxima'))).toMatch(/fogo-selo-man[^>]*><svg/);
    expect(iconeEquipamento('camera', 'operacional', false, 'proxima')).toBe(iconeEquipamento('camera', 'operacional', false, 'proxima'));
    expect(iconeEquipamento('camera', 'operacional', false, 'proxima')).not.toBe(iconeEquipamento('camera', 'operacional', false, 'ok'));
  });
});

describe('selo de manutenção no grupo', () => {
  const html = (c: Parameters<typeof iconeGrupo>[3]) => String(iconeGrupo(12, 'operacional', 0, c).options.html);

  it('chave conta só imediata + atrasada; relógio conta só os próximos 7 dias, cada um com a sua conta', () => {
    const h = html({ urgentes: 3, proximas: 5 });
    expect(h).toMatch(/fogo-selo-man--urgente[^>]*><svg[^>]*>.*<\/svg>3<\/span>/);
    expect(h).toMatch(/fogo-selo-man--proxima[^>]*><svg[^>]*>.*<\/svg>5<\/span>/);
  });

  it('só próximos: aparece o relógio e nenhuma chave; só urgentes: o contrário; nenhum: sem selo', () => {
    expect(html({ urgentes: 0, proximas: 2 })).not.toContain('fogo-selo-man--urgente');
    expect(html({ urgentes: 0, proximas: 2 })).toContain('fogo-selo-man--proxima');
    expect(html({ urgentes: 4, proximas: 0 })).not.toContain('fogo-selo-man--proxima');
    expect(html({ urgentes: 0, proximas: 0 })).not.toContain('fogo-selo-man');
  });

  it('o resumo lido por leitores de tela separa as duas categorias', () => {
    const r = resumoDoGrupo(['operacional', 'operacional'], { urgentes: 2, proximas: 1 });
    expect(r).toContain('2 com manutenção imediata ou atrasada');
    expect(r).toContain('1 com manutenção nos próximos 7 dias');
    expect(resumoDoGrupo(['operacional'])).not.toContain('manutenção');
  });
});
