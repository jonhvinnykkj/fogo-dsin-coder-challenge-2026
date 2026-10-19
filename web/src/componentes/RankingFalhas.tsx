// Manutenção preditiva: os 20 equipamentos com maior chance de falhar nos próximos 7 dias, cada um com o motivo (fatores
// do servidor, em pílulas com quanto multiplicam a taxa de falha), link para a ficha e "Agendar manutenção" — o mesmo
// diálogo da ficha, já em "Prevista para uma data" com uma revisão preventiva.
import { CalendarCheck, CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatarChance } from '../../../shared/formato';
import type { RiscoFalha } from '../../../shared/modelos';
import type { ManutencaoInput } from '../../../shared/schemas';
import { formatarDia, hojeIso } from '../util/datas';
import { rampaRisco, textoPeso } from '../util/risco';
import { Botao } from './Botao';
import { DialogoManutencao } from './DialogoManutencao';
import { IconeTipo } from './IconeTipo';
import estilos from './RankingFalhas.module.css';
import { usePode } from '../sessao/Sessao';

export const TAMANHO_RANKING = 20;

/** Chance em décimos de ponto (97,5) para o medidor e a barra; o texto vem de `formatarChance` ("98%", "mais de 99%"). */
const chance = (p: number) => Math.round(p * 1000) / 10;

/** Amanhã em São Paulo, "aaaa-mm-dd": a data sugerida para a revisão (a previsão vale para os próximos 7 dias). */
function amanha(): string {
  const [a, m, d] = hojeIso().split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Descrição sugerida (editável no diálogo), com os números e motivos do servidor; até 500 caracteres, como pede o cadastro. */
function textoDaRevisao(f: RiscoFalha): string {
  const motivos = f.fatores.map((fa) => fa.nome.charAt(0).toLowerCase() + fa.nome.slice(1)).join('; ');
  return `Revisão preventiva: ${formatarChance(f.probabilidade)} de chance de falhar nos próximos 7 dias. Motivos: ${motivos}.`.slice(0, 500);
}

export function RankingFalhas({ itens }: { itens: RiscoFalha[] }) {
  const podeOperar = usePode('operar');
  const [agendando, setAgendando] = useState<RiscoFalha | null>(null);
  const [agendados, setAgendados] = useState<Record<number, string>>({});
  const lista = itens.slice(0, TAMANHO_RANKING);

  return (
    <>
      <ol className={estilos.lista}>
        {lista.map((f, i) => {
          const c = chance(f.probabilidade);
          const pct = formatarChance(f.probabilidade);
          const agendada = agendados[f.equipamentoId];
          return (
            <li key={f.equipamentoId} className={estilos.item} aria-label={`${f.codigo}, ${pct} de chance de falhar em 7 dias`}>
              <span className={`${estilos.posicao} numeros`} aria-hidden="true">{i + 1}</span>

              <div className={estilos.quem}>
                <Link to={`/equipamentos/${f.equipamentoId}`} className={estilos.codigo}>{f.codigo}</Link>
                <span className={estilos.detalhes}>
                  <IconeTipo tipo={f.tipo} rotulo="curto" tamanho={16} />
                  <span>{f.bairroNome}</span>
                  <span className={estilos.modelo}>{f.marca} {f.modelo}</span>
                </span>
              </div>

              <div
                className={estilos.chance}
                role="meter"
                aria-label="Chance de falhar em 7 dias"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(c, 99.9)}
                aria-valuetext={pct}
              >
                <span className={`${estilos.pct} numeros`} data-ponta={pct.includes(' de ') || undefined}>{pct}</span>
                <span className={estilos.trilho}>
                  <span className={estilos.barra} style={{ width: `${Math.max(2, c)}%`, background: rampaRisco(c) }} />
                </span>
              </div>

              <div className={estilos.acao}>
                {agendada ? (
                  <span className={estilos.agendada} role="status">
                    <CheckCircle weight="fill" size={18} aria-hidden="true" />
                    Manutenção agendada para {formatarDia(agendada)}
                  </span>
                ) : podeOperar && (
                  <Botao
                    tamanho="pequeno"
                    icone={<CalendarCheck weight="fill" size={16} aria-hidden="true" />}
                    onClick={() => setAgendando(f)}
                    aria-label={`Agendar manutenção de ${f.codigo}`}
                  >
                    Agendar manutenção
                  </Botao>
                )}
              </div>

              <ul className={estilos.fatores} aria-label="Motivos">
                {f.fatores.map((fa) => (
                  <li key={fa.nome} className={estilos.fator} title={`Multiplica a taxa de falha por ${textoPeso(fa.contribuicao).slice(1)}`}>
                    <span>{fa.nome}</span>
                    <span className={`${estilos.peso} numeros`}>{textoPeso(fa.contribuicao)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {agendando && (
        <DialogoManutencao
          key={agendando.equipamentoId}
          aberto
          onFechar={() => setAgendando(null)}
          equipamento={{ id: agendando.equipamentoId, codigo: agendando.codigo }}
          inicial={{
            quando: 'prevista',
            tipo: 'preventiva',
            data: amanha(),
            descricao: textoDaRevisao(agendando),
          }}
          onRegistrada={(dados: ManutencaoInput) => {
            const data = dados.previstaPara?.slice(0, 10);
            if (data) setAgendados((a) => ({ ...a, [agendando.equipamentoId]: data }));
          }}
        />
      )}
    </>
  );
}
