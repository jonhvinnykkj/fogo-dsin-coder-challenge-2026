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
  it('grupo com equipamento destacado mostra a conta; grupo sem nenhum, não', () => {
    expect(String(iconeGrupo(12, 'operacional', 0, 3).options.html)).toMatch(/fogo-selo-man--grupo[^>]*>.*3<\/span>/);
    expect(String(iconeGrupo(12, 'operacional', 0, 0).options.html)).not.toContain('fogo-selo-man');
  });

  it('o resumo lido por leitores de tela cita a manutenção', () => {
    expect(resumoDoGrupo(['operacional', 'operacional'], 2)).toContain('2 com manutenção imediata, atrasada ou nos próximos 7 dias');
    expect(resumoDoGrupo(['operacional'])).not.toContain('manutenção');
  });
});
