// Faixa de indicadores da Central: seis placas de cor cheia, ao vivo. Com filtros, os números são os dos filtros.
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * No celular a faixa rola de lado e três placas ficam fora da tela: uma sombra na borda direita diz que há mais, e some
 * quando a rolagem chega ao fim. Em tela larga a faixa cabe inteira e a sombra nunca aparece.
 */
function MoldurarRolagem({ children }: { children: (ref: React.RefObject<HTMLElement | null>, aoRolar: () => void) => ReactNode }) {
  const faixa = useRef<HTMLElement | null>(null);
  const [haMais, setHaMais] = useState(false);
  const medir = useCallback(() => {
    const el = faixa.current;
    if (el) setHaMais(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);
  useEffect(medir); // a cada renderização: as placas mudam de largura quando os números chegam
  useEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);
  return <div className={estilos.moldura} data-ha-mais={haMais || undefined}>{children(faixa, medir)}</div>;
}

function FaixaIndicadoresBase({ indicadores: ind, filtrado }: Props) {
  if (!ind) {
    return (
      <MoldurarRolagem>
        {(ref, aoRolar) => (
          <section ref={ref} onScroll={aoRolar} className={estilos.faixa} aria-label="Indicadores da cidade" aria-busy="true">
            {['Equipamentos', 'Operacionais', 'Indisponíveis', 'Disponibilidade', 'Agentes em atividade', 'Alertas críticos'].map((r) => (
              <BlocoIndicador key={r} tamanho="compacto" rotulo={r} valor="—" cor="neutro" />
            ))}
          </section>
        )}
      </MoldurarRolagem>
    );
  }

  return (
    <MoldurarRolagem>
      {(ref, aoRolar) => (
        <section ref={ref} onScroll={aoRolar} className={estilos.faixa} aria-label={filtrado ? 'Indicadores dos filtros aplicados' : 'Indicadores da cidade'}>
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
            detalhe={filtrado ? plural(ind.alertasAbertos, 'alerta aberto com os filtros', 'alertas abertos com os filtros') : plural(ind.alertasAbertos, 'alerta aberto ao todo', 'alertas abertos ao todo')}
          />
        </section>
      )}
    </MoldurarRolagem>
  );
}

export const FaixaIndicadores = memo(FaixaIndicadoresBase);
