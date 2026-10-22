// Painel do agente escolhido: quem sou, minha situação (botões grandes), meu despacho e o que está perto de mim.
import { Broadcast, UserSwitch } from '@phosphor-icons/react';
import { useCallback, useId, useState, type CSSProperties } from 'react';
import { COR_SITUACAO_AGENTE, ROTULO_CATEGORIA_AGENTE, ROTULO_SITUACAO_AGENTE, SITUACOES_AGENTE } from '../../../shared/dominio';
import { useAgente, useMudarSituacaoAgente } from '../api/consultas';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao } from '../componentes/Botao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { corDoTexto } from '../estilo/contraste';
import estilos from './Campo.module.css';
import { CartaoDespacho } from './CartaoDespacho';
import { PertoDeMim } from './PertoDeMim';
import { useDespachosAoVivo, vibrarSePermitido } from './useDespachosAoVivo';

/** Padrão curto-pausa-curto: dá para sentir no bolso sem confundir com uma ligação. */
const VIBRACAO_DESPACHO = [200, 100, 200];

interface Props {
  agenteId: number;
  /** Sem ele (quem entrou como o próprio agente), não há "Trocar agente". */
  onTrocar?: () => void;
}

export function PainelDoAgente({ agenteId, onTrocar }: Props) {
  const idSituacao = useId();
  const consulta = useAgente(agenteId);
  const mudar = useMudarSituacaoAgente();
  const [despachoNovo, setDespachoNovo] = useState(false);

  const aoNovoDespacho = useCallback(() => {
    setDespachoNovo(true);
    vibrarSePermitido(VIBRACAO_DESPACHO);
  }, []);
  const { conectado } = useDespachosAoVivo(agenteId, aoNovoDespacho);

  if (consulta.isError) {
    return (
      <div className={estilos.coluna}>
        <AvisoErro erro={consulta.error} titulo="Não foi possível carregar seus dados" onTentarDeNovo={() => void consulta.refetch()} />
        {onTrocar && <Botao variante="secundario" icone={<UserSwitch weight="fill" size={20} aria-hidden="true" />} onClick={onTrocar}>Trocar agente</Botao>}
      </div>
    );
  }
  const agente = consulta.data;
  if (!agente) return <EstadoVazio titulo="Carregando…" />;
  // Enquanto a troca está a caminho, o botão escolhido já aparece marcado.
  const situacao = mudar.isPending && mudar.variables ? mudar.variables.situacao : agente.situacao;

  return (
    <div className={estilos.coluna}>
      <section className={estilos.cartaoAgente}>
        <div className={estilos.cartaoAgenteTopo}>
          <h1 className={estilos.tituloPagina}>{agente.nome}</h1>
          <span className={`${estilos.conexao} ${conectado ? estilos.conectado : ''}`}>
            <Broadcast weight="fill" size={16} aria-hidden="true" /> {conectado ? 'Ao vivo' : 'Reconectando…'}
          </span>
        </div>
        <p className={estilos.suave}>{agente.matricula} · {ROTULO_CATEGORIA_AGENTE[agente.categoria]} · base {agente.baseBairroNome}</p>
        {onTrocar && (
          <Botao variante="fantasma" tamanho="pequeno" icone={<UserSwitch weight="fill" size={18} aria-hidden="true" />} onClick={onTrocar}>
            Trocar agente
          </Botao>
        )}
      </section>

      <section aria-labelledby={idSituacao} className={estilos.secao}>
        <h2 id={idSituacao} className={estilos.tituloSecao}>Minha situação</h2>
        {mudar.isError && <AvisoErro erro={mudar.error} titulo="Não foi possível mudar a situação" />}
        <div role="group" aria-labelledby={idSituacao} className={estilos.situacoes}>
          {SITUACOES_AGENTE.map((s) => {
            const cor = COR_SITUACAO_AGENTE[s];
            const atual = s === situacao;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={atual}
                className={estilos.situacao}
                style={{ '--cor-situacao': cor, '--cor-sobre-situacao': corDoTexto(cor) } as CSSProperties}
                disabled={mudar.isPending}
                onClick={() => { if (!atual) mudar.mutate({ id: agenteId, situacao: s }); }}
              >
                {ROTULO_SITUACAO_AGENTE[s]}
              </button>
            );
          })}
        </div>
      </section>

      <CartaoDespacho agenteId={agenteId} novo={despachoNovo} onAgiu={() => setDespachoNovo(false)} />
      <PertoDeMim agenteId={agenteId} />
    </div>
  );
}
