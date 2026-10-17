// Diálogo "Mudar situação" do agente (não há motivo nem histórico para agentes: só a nova situação).
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { ROTULO_SITUACAO_AGENTE, SITUACOES_AGENTE, type SituacaoAgente } from '../../../shared/dominio';
import { useMudarSituacaoAgente } from '../api/consultas';
import { AvisoErro } from './AvisoErro';
import { Botao } from './Botao';
import { Campo } from './Campo';
import { EtiquetaSituacaoAgente } from './EtiquetaSituacaoAgente';
import { Gaveta } from './Gaveta';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  agente: { id: number; nome: string; situacao: SituacaoAgente };
}

export function DialogoSituacaoAgente({ aberto, onFechar, agente }: Props) {
  const idForm = useId();
  const mutacao = useMudarSituacaoAgente();
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string>();

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!nova) {
      setErro('Escolha a nova situação');
      return;
    }
    mutacao.mutate({ id: agente.id, situacao: nova as SituacaoAgente }, { onSuccess: () => { setNova(''); onFechar(); } });
  };

  return (
    <Gaveta
      aberta={aberto}
      onFechar={onFechar}
      titulo="Mudar situação"
      subtitulo={agente.nome}
      largura={440}
      rodape={(
        <>
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={<ArrowsClockwise weight="bold" size={18} aria-hidden="true" />} disabled={mutacao.isPending}>
            {mutacao.isPending ? 'Salvando…' : 'Mudar situação'}
          </Botao>
        </>
      )}
    >
      <form id={idForm} className={estilos.form} onSubmit={enviar} noValidate>
        {mutacao.isError && <AvisoErro erro={mutacao.error} titulo="Não foi possível mudar a situação" />}
        <p className={estilos.atual}>Situação atual: <EtiquetaSituacaoAgente situacao={agente.situacao} /></p>
        <Campo rotulo="Nova situação" erro={erro}>
          {(p) => (
            <select {...p} value={nova} onChange={(e) => { setNova(e.target.value); setErro(undefined); }}>
              <option value="">Escolha…</option>
              {SITUACOES_AGENTE.filter((s) => s !== agente.situacao).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_AGENTE[s]}</option>)}
            </select>
          )}
        </Campo>
      </form>
    </Gaveta>
  );
}
