// Faixa de indicadores da Central: seis placas de cor cheia, ao vivo. Com filtros, os números são os dos filtros.
import { memo } from 'react';
import { COR_CRITICIDADE, COR_SITUACAO } from '../../../shared/dominio';
import { formatarNumero, formatarPct } from '../../../shared/formato';
import type { Indicadores } from '../../../shared/modelos';
import { BlocoIndicador } from './BlocoIndicador';
import estilos from './FaixaIndicadores.module.css';

const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;

interface Props {
  indicadores: Indicadores | undefined;
  /** Há filtro ativo: os números são só do recorte. */
  filtrado: boolean;
}

function FaixaIndicadoresBase({ indicadores: ind, filtrado }: Props) {
  if (!ind) {
    return (
      <section className={estilos.faixa} aria-label="Indicadores da cidade" aria-busy="true">
        {['Equipamentos', 'Operacionais', 'Indisponíveis', 'Disponibilidade', 'Agentes em atividade', 'Alertas críticos'].map((r) => (
          <BlocoIndicador key={r} tamanho="compacto" rotulo={r} valor="—" cor="neutro" />
        ))}
      </section>
    );
  }

  return (
    <section className={estilos.faixa} aria-label={filtrado ? 'Indicadores dos filtros aplicados' : 'Indicadores da cidade'}>
      <BlocoIndicador
        tamanho="compacto"
        rotulo="Equipamentos"
        valor={ind.totalEquipamentos}
        cor="neutro"
        detalhe={filtrado ? 'com os filtros aplicados' : plural(ind.naoInstalados, 'não instalado', 'não instalados')}
      />
      <BlocoIndicador tamanho="compacto" rotulo="Operacionais" valor={ind.operacionais} cor={COR_SITUACAO.operacional} detalhe={plural(ind.desativados, 'desativado', 'desativados')} />
      <BlocoIndicador tamanho="compacto" rotulo="Indisponíveis" valor={ind.indisponiveis} cor={COR_SITUACAO.mau_funcionamento} detalhe="falha, manutenção ou furto" />
      <BlocoIndicador tamanho="compacto" rotulo="Disponibilidade" valor={formatarPct(ind.disponibilidadePct)} cor="marca" detalhe="dos que deveriam funcionar" />
      <BlocoIndicador tamanho="compacto" rotulo="Agentes em atividade" valor={ind.agentesEmAtividade} cor="neutro" detalhe={`de ${formatarNumero(ind.agentesTotal)} cadastrados`} />
      <BlocoIndicador
        tamanho="compacto"
        rotulo="Alertas críticos"
        valor={ind.alertasCriticosAbertos}
        cor={ind.alertasCriticosAbertos > 0 ? COR_CRITICIDADE.critica : 'neutro'}
        detalhe={plural(ind.alertasAbertos, 'alerta aberto ao todo', 'alertas abertos ao todo')}
      />
    </section>
  );
}

export const FaixaIndicadores = memo(FaixaIndicadoresBase);
