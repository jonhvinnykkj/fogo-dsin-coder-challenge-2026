// ViaCEP é opcional: ajuda a preencher o logradouro, mas nunca bloqueia o cadastro.
// Falhou, demorou mais de 3 s ou o CEP não existe → devolve `null` e o formulário segue manual.

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
}

export const TEMPO_LIMITE_VIACEP_MS = 3000;

export async function buscarCep(cep: string, buscar: typeof fetch = fetch): Promise<EnderecoViaCep | null> {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_VIACEP_MS);
  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${digitos}/json/`, { signal: controle.signal });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string };
    if (dados.erro) return null;
    return { logradouro: dados.logradouro ?? '', bairro: dados.bairro ?? '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
