// "Esperado × medido" de um alerta de anomalia. O servidor escreve a descrição num formato fixo
// (server/tempo-real/anomalias.ts → `detectarAnomalia`):
//   "<Equipamento> (<rua>, <bairro>). <Métrica>: <medido> <unidade>, abaixo|acima do normal para o horário: <esperado> <unidade>
//    (variação habitual de <desvio>, em <n> dias parecidos)."
// Os números ficam como o servidor formatou (vírgula decimal); se o texto não estiver nesse formato, a tela mostra a descrição.

export interface LeituraAnomala {
  metrica: string;
  medido: string;
  esperado: string;
  unidade: string;
  sentido: 'abaixo' | 'acima';
  variacao: string;
  dias: number;
}

const NUM = '(-?[\\d.]*\\d(?:,\\d+)?)';
const FORMATO = new RegExp(
  `([^.():]+): ${NUM} (\\S+), (abaixo|acima) do normal para o horário: ${NUM} \\S+ \\(variação habitual de ${NUM}, em (\\d+) dias parecidos\\)`,
);

export function lerAnomalia(descricao: string): LeituraAnomala | null {
  const m = FORMATO.exec(descricao);
  if (!m) return null;
  const [, metrica, medido, unidade, sentido, esperado, variacao, dias] = m;
  return {
    metrica: metrica!.trim(),
    medido: medido!,
    esperado: esperado!,
    unidade: unidade!,
    sentido: sentido as 'abaixo' | 'acima',
    variacao: variacao!,
    dias: Number(dias),
  };
}
