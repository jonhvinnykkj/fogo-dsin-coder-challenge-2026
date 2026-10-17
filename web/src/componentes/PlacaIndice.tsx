// Índice de risco (0 a 100) numa placa na cor do nível — usado no mapa de risco, na grade de 7 dias e no resumo do dia.
import { COR_NIVEL_RISCO, ROTULO_NIVEL_RISCO } from '../../../shared/dominio';
import type { NivelRisco } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import estilos from './PlacaIndice.module.css';

export function PlacaIndice({ indice, nivel, grande = false }: { indice: number; nivel: NivelRisco; grande?: boolean }) {
  const cor = COR_NIVEL_RISCO[nivel];
  return (
    <span className={`${estilos.placa} ${grande ? estilos.grande : ''} numeros`} style={{ background: cor, color: corDoTexto(cor) }} title={ROTULO_NIVEL_RISCO[nivel]}>
      {indice}
    </span>
  );
}
