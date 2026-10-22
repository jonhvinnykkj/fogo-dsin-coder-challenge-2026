// Modo Campo: a tela do agente de trânsito, guarda ou PM na rua, pensada para o celular (390 px) e fora da casca do
// gestor (sem menu lateral). Fecha o ciclo da Central: o gestor vê o agente no mapa, e o agente conta daqui o que
// acontece na rua (situação, chegada e conclusão do despacho, problemas nos equipamentos).
import { useState } from 'react';
import { esquecerAgente, lerAgenteSalvo, salvarAgente } from '../campo/agenteSalvo';
import estilos from '../campo/Campo.module.css';
import { EscolhaDoAgente } from '../campo/EscolhaDoAgente';
import { PainelDoAgente } from '../campo/PainelDoAgente';

export default function Campo() {
  const [agenteId, setAgenteId] = useState(lerAgenteSalvo);

  const escolher = (id: number) => {
    salvarAgente(id);
    setAgenteId(id);
  };
  const trocar = () => {
    esquecerAgente();
    setAgenteId(undefined);
  };

  return (
    <div className={estilos.tela}>
      <header className={estilos.topo}>
        <span className={estilos.marca}>F.O.G.O.</span>
        <span className={estilos.modo}>Modo Campo</span>
      </header>
      <main className={estilos.conteudo}>
        {agenteId === undefined ? <EscolhaDoAgente onEscolher={escolher} /> : <PainelDoAgente key={agenteId} agenteId={agenteId} onTrocar={trocar} />}
      </main>
    </div>
  );
}
