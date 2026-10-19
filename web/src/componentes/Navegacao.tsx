// Navegação principal: as telas na ordem do trabalho (operar, cadastrar, manter, reagir, prever) e o Boletim do dia.
// Item ativo vira placa laranja. Recolhida, mostra só os ícones, com nome acessível e dica ao passar o mouse/focar.
import {
  BookOpenText, CaretDoubleLeft, CaretDoubleRight, ChartLineUp, IdentificationBadge, MapTrifold, Newspaper, TrafficCone, WarningDiamond,
  Wrench, type Icon,
} from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';
import { formatarNumero } from '../../../shared/formato';
import { useIndicadores } from '../api/consultas';
import estilos from './Navegacao.module.css';

const contar = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;

interface ItemNavegacao {
  para: string;
  rotulo: string;
  Icone: Icon;
  fim?: boolean;
}

export const ITENS_NAVEGACAO: ItemNavegacao[] = [
  { para: '/', rotulo: 'Central', Icone: MapTrifold, fim: true },
  { para: '/equipamentos', rotulo: 'Equipamentos', Icone: TrafficCone },
  { para: '/agentes', rotulo: 'Agentes', Icone: IdentificationBadge },
  { para: '/manutencao', rotulo: 'Manutenção', Icone: Wrench },
  { para: '/alertas', rotulo: 'Alertas', Icone: WarningDiamond },
  { para: '/previsoes', rotulo: 'Previsões', Icone: ChartLineUp },
  { para: '/boletim', rotulo: 'Boletim do dia', Icone: Newspaper },
];

interface Props {
  recolhida?: boolean;
  onAlternarRecolhida?: () => void;
  /** Chamado ao escolher um item (fecha o menu no celular). */
  onNavegar?: () => void;
}

export function Navegacao({ recolhida = false, onAlternarRecolhida, onNavegar }: Props) {
  const { data: indicadores } = useIndicadores();

  const contagem = (para: string) => {
    if (para === '/alertas' && indicadores && indicadores.alertasAbertos > 0) {
      const criticos = indicadores.alertasCriticosAbertos;
      return {
        numero: criticos > 0 ? criticos : indicadores.alertasAbertos,
        critico: criticos > 0,
        descricao: criticos > 0
          ? contar(criticos, 'alerta crítico aberto', 'alertas críticos abertos')
          : contar(indicadores.alertasAbertos, 'alerta aberto', 'alertas abertos'),
      };
    }
    if (para === '/manutencao' && indicadores && indicadores.manutencaoImediata > 0) {
      const n = indicadores.manutencaoImediata;
      return { numero: n, critico: false, descricao: contar(n, 'equipamento precisa de manutenção imediata', 'equipamentos precisam de manutenção imediata') };
    }
    return undefined;
  };

  return (
    <nav className={`${estilos.nav} ${recolhida ? estilos.recolhida : ''}`} aria-label="Navegação principal">
      <ul className={estilos.lista}>
        {ITENS_NAVEGACAO.map(({ para, rotulo, Icone, fim }) => {
          const c = contagem(para);
          return (
            <li key={para}>
              <NavLink
                to={para}
                end={fim}
                className={({ isActive }) => `${estilos.item} ${isActive ? estilos.ativo : ''}`}
                aria-label={recolhida ? (c ? `${rotulo}: ${c.descricao}` : rotulo) : undefined}
                data-dica={recolhida ? rotulo : undefined}
                onClick={onNavegar}
              >
                <Icone weight="fill" size={22} aria-hidden="true" className={estilos.icone} />
                <span className={estilos.rotulo}>{rotulo}</span>
                {c && (
                  <span className={`${estilos.contagem} ${c.critico ? estilos.critico : ''} numeros`} title={c.descricao}>
                    {formatarNumero(c.numero)}
                    <span className="so-leitor"> ({c.descricao})</span>
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className={estilos.pe}>
        <a
          className={estilos.item}
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          aria-label={recolhida ? 'Documentação da API (abre em nova aba)' : undefined}
          data-dica={recolhida ? 'Documentação da API' : undefined}
        >
          <BookOpenText weight="fill" size={22} aria-hidden="true" className={estilos.icone} />
          <span className={estilos.rotulo}>
            Documentação da API<span className="so-leitor"> (abre em nova aba)</span>
          </span>
        </a>
        {onAlternarRecolhida && (
          <button
            type="button"
            className={`${estilos.item} ${estilos.recolher}`}
            onClick={onAlternarRecolhida}
            aria-label={recolhida ? 'Abrir menu' : undefined}
            aria-expanded={!recolhida}
            data-dica={recolhida ? 'Abrir menu' : undefined}
          >
            {recolhida ? <CaretDoubleRight weight="fill" size={20} aria-hidden="true" className={estilos.icone} /> : <CaretDoubleLeft weight="fill" size={20} aria-hidden="true" className={estilos.icone} />}
            <span className={estilos.rotulo}>Recolher menu</span>
          </button>
        )}
      </div>
    </nav>
  );
}
