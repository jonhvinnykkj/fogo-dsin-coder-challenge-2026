// Os 5 equipamentos mais perto do agente, com a situação de cada um e o atalho para relatar um problema.
import { CheckCircle, Megaphone, TrafficCone } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { formatarDistancia, type EquipamentoProximo, type ResultadoReporte } from '../../../shared/campo';
import { ROTULO_SITUACAO } from '../../../shared/dominio';
import { useEquipamentosProximos } from '../api/campo';
import { AvisoErro } from '../componentes/AvisoErro';
import { Botao } from '../componentes/Botao';
import { EstadoVazio } from '../componentes/EstadoVazio';
import { EtiquetaSituacao } from '../componentes/EtiquetaSituacao';
import { IconeTipo } from '../componentes/IconeTipo';
import estilos from './Campo.module.css';
import { DialogoRelato } from './DialogoRelato';

function confirmacao(r: ResultadoReporte): string {
  const { codigo, situacao } = r.equipamento;
  return r.alerta
    ? `Relato enviado. ${codigo} agora está como ${ROTULO_SITUACAO[situacao]} e a Central recebeu o alerta.`
    : `Relato enviado. ${codigo} agora está como ${ROTULO_SITUACAO[situacao]}; a Central já tinha um alerta aberto para ele.`;
}

export function PertoDeMim({ agenteId }: { agenteId: number }) {
  const idTitulo = useId();
  const consulta = useEquipamentosProximos(agenteId);
  const [relatando, setRelatando] = useState<EquipamentoProximo | null>(null);
  const [enviado, setEnviado] = useState<string>();

  return (
    <section aria-labelledby={idTitulo} className={estilos.secao}>
      <h2 id={idTitulo} className={estilos.tituloSecao}>Perto de mim</h2>
      <p className={estilos.suave}>Os 5 equipamentos mais próximos de onde você está.</p>
      {enviado && (
        <p role="status" className={estilos.confirmacao}>
          <CheckCircle weight="fill" size={20} aria-hidden="true" /> {enviado}
        </p>
      )}
      {consulta.isError && <AvisoErro erro={consulta.error} titulo="Não foi possível carregar os equipamentos" onTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.data?.length === 0 && <EstadoVazio titulo="Nenhum equipamento por perto" icone={<TrafficCone weight="fill" />} />}
      <ul className={estilos.proximos}>
        {consulta.data?.map((e) => (
          <li key={e.id} className={estilos.proximo}>
            <div className={estilos.proximoTopo}>
              <IconeTipo tipo={e.tipo} rotulo="curto" />
              <span className={estilos.distancia}>{formatarDistancia(e.distanciaMetros)}</span>
            </div>
            <div className={estilos.proximoMeio}>
              <span className={estilos.codigo}>{e.codigo}</span>
              <EtiquetaSituacao situacao={e.situacao} tamanho="compacta" />
            </div>
            <p className={estilos.suave}>{e.logradouro}{e.referencia ? `, ${e.referencia}` : ''} · {e.bairroNome}</p>
            <Botao
              variante="secundario"
              className={estilos.botaoGrande}
              icone={<Megaphone weight="fill" size={20} aria-hidden="true" />}
              aria-label={`Relatar problema em ${e.codigo}`}
              onClick={() => { setEnviado(undefined); setRelatando(e); }}
            >
              Relatar problema
            </Botao>
          </li>
        ))}
      </ul>
      <DialogoRelato agenteId={agenteId} equipamento={relatando} onFechar={() => setRelatando(null)} onEnviado={(r) => setEnviado(confirmacao(r))} />
    </section>
  );
}
