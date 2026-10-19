// Quem está usando o Modo Campo neste aparelho. Sem login, como o resto do sistema: a escolha fica no localStorage.
// Aba anônima ou armazenamento bloqueado: a escolha vale só enquanto a tela estiver aberta.

export const CHAVE_AGENTE_CAMPO = 'fogo:campo:agente';

export function lerAgenteSalvo(): number | undefined {
  try {
    const n = Number(localStorage.getItem(CHAVE_AGENTE_CAMPO));
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export function salvarAgente(id: number): void {
  try {
    localStorage.setItem(CHAVE_AGENTE_CAMPO, String(id));
  } catch {
    // sem armazenamento: segue sem guardar
  }
}

export function esquecerAgente(): void {
  try {
    localStorage.removeItem(CHAVE_AGENTE_CAMPO);
  } catch {
    // sem armazenamento: nada guardado
  }
}
