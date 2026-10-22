// Relato de problema num equipamento: o que houve (mau funcionamento, furtado, vandalizado) e uma observação opcional.
import { Megaphone } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { PROBLEMAS_CAMPO, ROTULO_PROBLEMA_CAMPO, type EquipamentoProximo, type ProblemaCampo, type ResultadoReporte } from '../../../shared/campo';
import { useRelatarProblema } from '../api/campo';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao } from '../componentes/Botao';
import { Campo } from '../componentes/Campo';
import { Gaveta } from '../componentes/Gaveta';
import dialogo from '../componentes/Dialogo.module.css';

interface Props {
  agenteId: number;
  equipamento: EquipamentoProximo | null;
  onFechar: () => void;
  onEnviado: (r: ResultadoReporte) => void;
}

export function DialogoRelato({ agenteId, equipamento, onFechar, onEnviado }: Props) {
  const idForm = useId();
  const mutacao = useRelatarProblema(agenteId);
  const [problema, setProblema] = useState<ProblemaCampo>();
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string>();

  const fechar = () => {
    setProblema(undefined);
    setObservacao('');
    setErro(undefined);
    mutacao.reset();
    onFechar();
  };

  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!equipamento) return;
    if (!problema) {
      setErro('Escolha o problema');
      return;
    }
    mutacao.mutate({ equipamentoId: equipamento.id, problema, observacao: observacao.trim() }, {
      onSuccess: (r) => {
        onEnviado(r);
        fechar();
      },
    });
  };

  return (
    <Gaveta
      aberta={equipamento !== null}
      onFechar={fechar}
      titulo="Relatar problema"
      subtitulo={equipamento?.codigo}
      largura={440}
      rodape={(
        <>
          <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={<Megaphone weight="fill" size={18} aria-hidden="true" />} disabled={mutacao.isPending}>
            {mutacao.isPending ? 'Enviando…' : 'Enviar relato'}
          </Botao>
        </>
      )}
    >
      <form id={idForm} className={dialogo.form} onSubmit={enviar} noValidate>
        {mutacao.isError && <AvisoErro erro={mutacao.error} titulo="Não foi possível enviar o relato" />}
        <fieldset className={dialogo.opcoes}>
          <legend>O que aconteceu?</legend>
          {PROBLEMAS_CAMPO.map((p) => (
            <label key={p} className={dialogo.opcao}>
              <input type="radio" name="problema" value={p} checked={problema === p} onChange={() => { setProblema(p); setErro(undefined); }} />
              {ROTULO_PROBLEMA_CAMPO[p]}
            </label>
          ))}
          {erro && <p className={dialogo.erro} role="alert">{erro}</p>}
        </fieldset>
        <Campo rotulo="Observação" opcional ajuda="O que você viu: vai para o histórico do equipamento e para o alerta da Central.">
          {(p) => <textarea {...p} rows={3} maxLength={280} value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
        </Campo>
      </form>
    </Gaveta>
  );
}
