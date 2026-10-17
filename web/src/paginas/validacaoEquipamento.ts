// Validação do formulário de equipamento no cliente, com o MESMO schema do servidor.
// O `superRefine` do schema só roda quando os campos básicos estão certos; por isso as regras dele (características
// do tipo, ponto dentro de Marília, datas de manutenção) também são conferidas à parte, para o erro aparecer logo.
import { dentroDeMarilia } from '../../../shared/geo';
import { equipamentoInputSchema, type EquipamentoInput } from '../../../shared/schemas';
import { schemaCaracteristicas, type TipoEquipamentoId } from '../../../shared/tipos-equipamento';
import { lerDecimal } from '../util/numeros';

/** O que o formulário guarda: textos como o usuário digitou (a conversão acontece ao enviar). */
export interface EstadoEquipamento {
  tipo: TipoEquipamentoId | '';
  numeroSerie: string;
  marca: string;
  modelo: string;
  orgao: string;
  situacao: string;
  cep: string;
  logradouro: string;
  referencia: string;
  bairroId: string;
  lat: string;
  lng: string;
  manutencaoNecessidade: string;
  manutencaoPeriodicidadeDias: string;
  ultimaManutencao: string;
  proximaManutencao: string;
  instaladoEm: string;
  caracteristicas: Record<string, unknown>;
}

export type Erros = Record<string, string>;

const vazioParaUndefined = (v: string) => (v.trim() === '' ? undefined : v);

export function montarCandidato(e: EstadoEquipamento): Record<string, unknown> {
  const periodica = e.manutencaoNecessidade === 'periodica';
  return {
    tipo: e.tipo || undefined,
    numeroSerie: e.numeroSerie,
    marca: e.marca,
    modelo: e.modelo,
    orgao: e.orgao || undefined,
    situacao: e.situacao || undefined,
    cep: e.cep,
    logradouro: e.logradouro,
    referencia: e.referencia,
    bairroId: e.bairroId ? Number(e.bairroId) : undefined,
    lat: lerDecimal(e.lat),
    lng: lerDecimal(e.lng),
    manutencaoNecessidade: e.manutencaoNecessidade || undefined,
    manutencaoPeriodicidadeDias: periodica ? lerDecimal(e.manutencaoPeriodicidadeDias) : undefined,
    ultimaManutencao: vazioParaUndefined(e.ultimaManutencao),
    proximaManutencao: vazioParaUndefined(e.proximaManutencao),
    instaladoEm: vazioParaUndefined(e.instaladoEm),
    caracteristicas: e.caracteristicas,
  };
}

export function validarEquipamento(e: EstadoEquipamento): { dados?: EquipamentoInput; erros: Erros } {
  const candidato = montarCandidato(e);
  const erros: Erros = {};
  const registrar = (caminho: (string | number)[], mensagem: string) => {
    const chave = caminho.join('.');
    if (!(chave in erros)) erros[chave] = mensagem;
  };

  const resultado = equipamentoInputSchema.safeParse(candidato);
  if (resultado.success) return { dados: resultado.data, erros };
  for (const i of resultado.error.issues) registrar(i.path, i.message);

  // Regras do superRefine, conferidas mesmo com campos básicos errados.
  if (e.tipo) {
    const r = schemaCaracteristicas(e.tipo).safeParse(e.caracteristicas);
    if (!r.success) for (const i of r.error.issues) registrar(['caracteristicas', ...i.path], i.message);
  }
  const lat = candidato.lat as number | undefined;
  const lng = candidato.lng as number | undefined;
  if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && !dentroDeMarilia(lat, lng)) {
    registrar(['lat'], 'A coordenada precisa ficar dentro de Marília');
  }
  if ((e.manutencaoNecessidade === 'agendada' || e.manutencaoNecessidade === 'periodica') && !e.proximaManutencao) {
    registrar(['proximaManutencao'], 'Informe a data da próxima manutenção');
  }
  if (e.manutencaoNecessidade === 'periodica' && !candidato.manutencaoPeriodicidadeDias) {
    registrar(['manutencaoPeriodicidadeDias'], 'Informe a periodicidade em dias');
  }
  return { erros };
}
