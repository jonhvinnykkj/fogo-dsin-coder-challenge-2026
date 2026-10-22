// ViaCEP é opcional: ajuda a preencher o logradouro, mas nunca bloqueia o cadastro.
// Falhou ou demorou mais de 3 s → devolve `null` e o formulário segue manual. CEP que o ViaCEP diz não existir
// (`{ "erro": true }`) é outra coisa: devolve `CEP_INEXISTENTE`, para a tela dizer "confira o CEP" em vez de "tente depois".

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  /** Cidade e UF que o ViaCEP informou (vazias se ele não disse). */
  cidade: string;
  uf: string;
}

export const TEMPO_LIMITE_VIACEP_MS = 3000;

/** O ViaCEP respondeu, e disse que esse CEP não existe. */
export const CEP_INEXISTENTE = 'inexistente';

export async function buscarCep(cep: string, buscar: typeof fetch = fetch): Promise<EnderecoViaCep | typeof CEP_INEXISTENTE | null> {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_VIACEP_MS);
  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${digitos}/json/`, { signal: controle.signal });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (dados.erro) return CEP_INEXISTENTE;
    return { logradouro: dados.logradouro ?? '', bairro: dados.bairro ?? '', cidade: dados.localidade ?? '', uf: dados.uf ?? '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
