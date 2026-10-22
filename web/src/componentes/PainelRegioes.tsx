// Painel de regiões da Central: as 5 regiões com nível, índice e motivos; cada uma abre a lista dos seus bairros
// (os que pedem atenção primeiro). Clicar num bairro leva o mapa até ele.
import { CaretDown, Crosshair } from '@phosphor-icons/react';
import { memo, useState } from 'react';
import { COR_NIVEL_ATENCAO, ROTULO_NIVEL_ATENCAO } from '../../../shared/dominio';
import { formatarNumero } from '../../../shared/formato';
import type { NivelAtencao, StatusRegiao } from '../../../shared/modelos';
import { corDoTexto } from '../estilo/contraste';
import { EstadoVazio } from './EstadoVazio';
import estilos from './PainelRegioes.module.css';

interface Props {
  regioes: StatusRegiao[] | undefined;
  carregando?: boolean;
  onFocarBairro?: (bairroId: number) => void;
  /** Lugar do filtro da Central ("região Norte"): o painel avisa que mostra só ele. */
  recorte?: string;
}

function Nivel({ nivel }: { nivel: NivelAtencao }) {
  const cor = COR_NIVEL_ATENCAO[nivel];
  return <span className={estilos.nivel} style={{ background: cor, color: corDoTexto(cor) }}>{ROTULO_NIVEL_ATENCAO[nivel]}</span>;
}

function PainelRegioesBase({ regioes, carregando = false, onFocarBairro, recorte }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);

  if (!regioes) {
    return carregando ? <div className={estilos.esqueleto} aria-busy="true" /> : <EstadoVazio titulo="Situação das regiões indisponível" descricao="A tela tenta de novo a cada 30 segundos." />;
  }

  const comAtencao = regioes.filter((r) => r.nivel !== 'normal').length;
  const normais = regioes.length - comAtencao;
  if (regioes.length === 0) return <EstadoVazio titulo="Nenhuma região neste recorte" descricao="Troque a região ou o bairro nos filtros para ver as demais." />;
  const resumo = comAtencao === 0
    ? `As ${regioes.length} regiões operam normalmente.`
    : normais === 0
      ? `As ${regioes.length} regiões exigem atenção.`
      : `${comAtencao === 1 ? '1 região exige' : `${comAtencao} regiões exigem`} atenção; ${normais === 1 ? '1 opera' : `${normais} operam`} normalmente.`;

  return (
    <div className={estilos.painel}>
      {recorte && <p className={estilos.recorte}>Só {recorte}, como no filtro da Central.</p>}
      <p className={estilos.resumo}>{resumo}</p>
      <ul className={estilos.lista}>
        {regioes.map((r) => {
          const expandida = aberta === r.regiao;
          const idLista = `bairros-${r.regiao}`;
          const bairros = [...r.bairros].sort((a, b) => b.indice - a.indice || a.nome.localeCompare(b.nome, 'pt-BR'));
          const pedemAtencao = bairros.filter((b) => b.nivel !== 'normal').length;
          return (
            <li key={r.regiao} className={estilos.regiao} style={{ ['--cor-nivel' as string]: COR_NIVEL_ATENCAO[r.nivel], ['--cor-sobre-nivel' as string]: corDoTexto(COR_NIVEL_ATENCAO[r.nivel]) }}>
              <button type="button" className={estilos.cabecalho} aria-expanded={expandida} aria-controls={idLista} onClick={() => setAberta(expandida ? null : r.regiao)}>
                <span className={estilos.indice} title="Índice de atenção (0 a 100)">
                  <span className="numeros">{formatarNumero(r.indice)}</span>
                  <span className="so-leitor">de índice</span>
                </span>
                <span className={estilos.nome}>
                  <strong>{r.regiao}</strong>
                  <Nivel nivel={r.nivel} />
                </span>
                <CaretDown weight="fill" size={14} aria-hidden="true" className={`${estilos.seta} ${expandida ? estilos.virada : ''}`} />
              </button>
              {r.motivos.length > 0 && (
                <ul className={estilos.motivos}>
                  {r.motivos.slice(0, expandida ? undefined : 2).map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              {expandida && (
                <div id={idLista} className={estilos.bairros}>
                  <p className={estilos.contagem}>
                    {formatarNumero(bairros.length)} bairros · {pedemAtencao === 0 ? 'nenhum pede atenção' : `${formatarNumero(pedemAtencao)} pedem atenção`}
                  </p>
                  <ul>
                    {bairros.map((b) => (
                      <li key={b.bairroId}>
                        <button type="button" className={estilos.bairro} onClick={() => onFocarBairro?.(b.bairroId)} title="Ver o bairro no mapa">
                          <span className={estilos.marcaBairro} style={{ background: COR_NIVEL_ATENCAO[b.nivel] }} aria-hidden="true" />
                          <span className={estilos.nomeBairro}>
                            <strong>{b.nome}</strong>
                            <span>{b.motivos[0] ?? 'Sem pendências agora'}</span>
                          </span>
                          <span className={`${estilos.indiceBairro} numeros`}>
                            {formatarNumero(b.indice)}
                            <span className="so-leitor"> de índice, {ROTULO_NIVEL_ATENCAO[b.nivel]}</span>
                          </span>
                          <Crosshair weight="fill" size={14} aria-hidden="true" className={estilos.mira} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className={estilos.nota}>Índice de 0 a 100: equipamentos indisponíveis, alertas altos e críticos abertos e ocorrências das últimas 3 h no ritmo real (as da simulação acelerada pesam menos). Atualiza a cada alerta novo.</p>
    </div>
  );
}

export const PainelRegioes = memo(PainelRegioesBase);
