// Ícone do tipo de equipamento (Phosphor, estilo cheio) a partir do nome guardado no catálogo (`TipoEquipamento.icone`).
// Com rótulo por padrão; sem rótulo, o ícone ganha nome acessível e dica ao passar o mouse.
import {
  Barricade, Camera, Car, Cardholder, Drop, Monitor, Motorcycle, PersonSimpleBike, Question, Scales, Siren, Taxi,
  TrafficSignal, VideoCamera, type Icon,
} from '@phosphor-icons/react';
import { NOME_DO_TIPO, tipoPorId, type TipoEquipamentoId } from '../../../../shared/tipos-equipamento';
import estilos from './IconeTipo.module.css';

/** Só os ícones usados pelo catálogo (o resto do Phosphor fica fora do pacote final). */
const ICONES: Record<string, Icon> = {
  Barricade, Camera, Car, Cardholder, Drop, Monitor, Motorcycle, PersonSimpleBike, Scales, Siren, Taxi, TrafficSignal, VideoCamera,
};

export function componenteDoIcone(nome: string): Icon {
  return ICONES[nome] ?? Question;
}

/** "Câmera", "Radar"… (o rótulo do catálogo é longo para tabela: "Câmera de videomonitoramento"). */
export function rotuloCurtoDoTipo(tipo: TipoEquipamentoId): string {
  const [singular] = NOME_DO_TIPO[tipo];
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

interface Props {
  tipo: TipoEquipamentoId;
  comRotulo?: boolean;
  /** `curto` = "Câmera"; `completo` = "Câmera de videomonitoramento". */
  rotulo?: 'curto' | 'completo';
  tamanho?: number;
}

export function IconeTipo({ tipo, comRotulo = true, rotulo = 'completo', tamanho = 20 }: Props) {
  const def = tipoPorId(tipo);
  const Componente = componenteDoIcone(def.icone);
  const texto = rotulo === 'curto' ? rotuloCurtoDoTipo(tipo) : def.rotulo;

  if (!comRotulo) {
    return (
      <span className={estilos.icone} title={def.rotulo}>
        <Componente weight="fill" size={tamanho} role="img" aria-label={def.rotulo} />
      </span>
    );
  }
  return (
    <span className={estilos.tipo}>
      <Componente weight="fill" size={tamanho} aria-hidden="true" className={estilos.icone} />
      <span>{texto}</span>
    </span>
  );
}
