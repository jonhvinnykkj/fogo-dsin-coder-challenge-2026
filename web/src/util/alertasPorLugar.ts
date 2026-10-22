// Recorte de lugar da Central aplicado a alertas e regiões. A API de alertas não filtra por bairro nem por região, então
// o recorte é feito aqui, pelo bairro de cada alerta. Alerta sem bairro (ex.: de equipamento sem endereço) fica de fora
// quando há recorte de lugar. Órgão, tipo e situação não se aplicam: o alerta não carrega essas informações.
import type { Regiao } from '../../../shared/dominio';
import type { Alerta, Bairro, StatusRegiao } from '../../../shared/modelos';

export interface RecorteLugar {
  regiao?: Regiao;
  bairroId?: number;
}

export const temRecorteDeLugar = (r: RecorteLugar) => r.regiao !== undefined || r.bairroId !== undefined;

export function filtrarAlertasPorLugar(alertas: Alerta[] | undefined, recorte: RecorteLugar, bairros: readonly Bairro[] | undefined): Alerta[] | undefined {
  if (!alertas || !temRecorteDeLugar(recorte)) return alertas;
  const regiaoDoBairro = new Map((bairros ?? []).map((b) => [b.id, b.regiao]));
  return alertas.filter((a) => {
    if (a.bairroId === undefined) return false;
    if (recorte.bairroId !== undefined && a.bairroId !== recorte.bairroId) return false;
    return recorte.regiao === undefined || regiaoDoBairro.get(a.bairroId) === recorte.regiao;
  });
}

/** Regiões do painel: só a região escolhida e, com bairro escolhido, só esse bairro dentro dela (o nível da região fica o do servidor). */
export function filtrarRegioesPorLugar(regioes: StatusRegiao[] | undefined, recorte: RecorteLugar): StatusRegiao[] | undefined {
  if (!regioes || !temRecorteDeLugar(recorte)) return regioes;
  return regioes
    .filter((r) => (recorte.regiao === undefined || r.regiao === recorte.regiao) && (recorte.bairroId === undefined || r.bairros.some((b) => b.bairroId === recorte.bairroId)))
    .map((r) => (recorte.bairroId === undefined ? r : { ...r, bairros: r.bairros.filter((b) => b.bairroId === recorte.bairroId) }));
}
