# Guia do time — como explicar o F.O.G.O.

Este guia é para quem vai **apresentar e responder à comissão**. A regra do desafio é demonstrar que vocês entendem o que a IA construiu: leiam, abram os arquivos citados e rodem o sistema enquanto estudam. Tudo aqui foi conferido contra o código e os testes.

**Antes de qualquer coisa:** rodem `npm install && npm start`, abram http://localhost:3333 e façam o roteiro do README ("O que olhar primeiro"). Ver funcionando vale mais que decorar.

---

## 1. Mapa do código

```
shared/                 código que servidor e interface usam igual (sem Node)
  dominio.ts              situações, criticidades, cores, rótulos pt-BR, turnos, tipos de evento
  tipos-equipamento.ts    catálogo dos 13 tipos + validação (zod) das características de cada um
  telemetria.ts           QUAIS métricas cada tipo envia (fluxo, bateria, sinal…): único lugar com esses nomes
  schemas.ts              validação das entradas (equipamento, agente, filtros)
  modelos.ts              formato das respostas da API e dos eventos SSE
  geo.ts + limite-marilia.json   ponto-dentro-do-polígono, distância, limite do município
  formato.ts              números 1.234,5, datas dd/mm/aaaa no fuso de São Paulo, "mais de 99%"
server/
  index.ts                a partida: banco → migração → semente/lacuna → app → simulador → escuta a porta
  app.ts                  monta o Fastify (rotas, Swagger, arquivos da interface)
  porta.ts                lê PORT e monta as mensagens de erro de porta
  db/                     conexão SQLite, schema.sql (tabelas e índices), migrar.ts (colunas novas em banco antigo)
  geo/                    bairros e ruas reais (OpenStreetMap, em JSON) e funções de lugar
  repositorios/           todo o SQL, uma pasta de funções por tabela (equipamentos, agentes, alertas…)
  servicos/               regras de negócio (equipamentos.ts, central.ts = indicadores, mapa, regiões)
  rotas/                  uma rota fina por assunto: valida, chama o serviço, responde
  semente/                cria a cidade e o histórico de 60 dias, com padrões plantados
  tempo-real/             ingestão, anomalias, motor de alertas, simulador, barramento de eventos
  preditivo/              base (estatísticas), risco, backtest, reforço, falhas, tendências, resumo
web/src/
  paginas/                uma por tela: Central, Equipamentos, fichas e formulários, Agentes, Manutenção, Alertas, Previsões
  componentes/            peças: mapa, placas de indicador, feed de alertas, tabela, gaveta, cartão de explicação…
  api/                    cliente HTTP e consultas (TanStack Query)
  tempo-real/useStream.ts conexão SSE que atualiza as telas e reconecta sozinha
  estilo/                 tokens de cor e base (tema claro; escuro só se o usuário escolher)
e2e/                    teste de fumaça (Playwright)
scripts/                empacotar.mjs (gera o .zip), token.ts (token de um equipamento), geo/baixar-osm.mjs (baixou os bairros)
```

Para achar uma regra: a **frase em português do domínio** costuma ser o nome da função (`registrarManutencao`, `calcularIndicadores`, `preverFalhas`). Os testes ficam ao lado do código (`*.test.ts`) e **documentam as regras**: abram o teste antes do código.

---

## 2. O caminho de um dado IoT, do simulador à tela

Exemplo: um radar manda "fluxo = 0" na hora do pico.

1. **`server/tempo-real/simulador.ts`**: a cada 2 s (tick) o simulador gera leituras para os equipamentos e anda com os móveis. Ele chama `gerarLeituraHora` (em `server/semente/perfis.ts`), a mesma função que gerou o histórico, para que o "normal" ao vivo seja igual ao do passado. **Não há atalho**: ele usa a função de ingestão como um dispositivo real usaria.
2. **`server/rotas/telemetria.ts`** (`POST /api/telemetria`): é a porta de um dispositivo real. Confere o token (`x-dispositivo-token`, comparado com `timingSafeEqual`), valida o corpo e chama a ingestão. Sem token → 401.
3. **`server/tempo-real/ingestao.ts`** (`ingerirTelemetria`): valida as métricas do tipo (`shared/telemetria.ts`), atualiza `ultimo_sinal_em` e a posição atual, soma a leitura na linha da hora corrente de `telemetria_hora` (média corrida), e passa a leitura ao motor.
4. **`server/tempo-real/anomalias.ts`**: `calcularBaseHoraria` pega a média e o desvio **desse equipamento, nessa hora e nesse tipo de dia** no histórico; `detectarAnomalia` marca como anormal se |z| ≥ 3 (radar com fluxo quase zero conta mesmo com desvio grande). Cria uma explicação em português com o valor esperado.
5. **`server/tempo-real/motor-alertas.ts`**: `registrar` abre o alerta (criticidade + texto) **sem duplicar** enquanto houver um aberto igual (chave `anomalia:<id>:<métrica>`). Grava em `alertas`.
6. **`server/tempo-real/barramento.ts`**: recebe o evento `alerta` (e as posições, que agrupa a cada 2 s para não inundar a tela).
7. **`server/rotas/stream.ts`** (`GET /api/stream`): entrega o barramento a cada navegador conectado, como **Server-Sent Events** (`:ping` a cada 15 s para a conexão não cair).
8. **`web/src/tempo-real/useStream.ts`**: recebe o evento e atualiza o cache do TanStack Query; se a conexão cai (notebook dormiu, servidor reiniciou), reconecta e **ressincroniza** a tela.
9. **`web/src/componentes/FeedAlertas.tsx`** e **`FaixaIndicadores.tsx`**: o alerta aparece no feed e o número "Alertas críticos" sobe. O mapa (`MapaOperacional.tsx`) pinta o marcador.

Quando o problema passa, o caminho inverso: três leituras normais seguidas fecham a anomalia; sinal que volta fecha "sem sinal"; ocorrência que termina fecha o alerta dela; reparo concluído fecha a falha. Resolução automática fica registrada como `automatica` (a manual, como `manual`).

---

## 3. Como a semente planta os padrões

`server/semente/` cria, **na primeira partida**, 65 bairros reais, 350 equipamentos, 80 agentes e 60 dias de histórico (cerca de 17,6 mil ocorrências e 452 mil horas de telemetria) em ~1,5 s. Tudo sai de um gerador com **semente fixa (2026)**: mesma semente, mesma cidade. Não há `Math.random()`.

Os padrões são colocados de propósito em `historico.ts` e `perfis.ts`; a previsão deve **redescobri-los**. Força medida (semente padrão):

| Padrão plantado | Medido |
|---|---|
| Picos de 7–9 h e 17–19 h em dia útil | ≈ 2× as outras horas |
| Chuva aumenta acidentes (plantado 1,8×) | 1,68× |
| Centro à noite de sexta/sábado: segurança (plantado 2,5×) | 2,71× |
| Acidentes leves perto de escolas no horário escolar | ≈ 11× |
| Furto de patinete em 2 bairros "quentes" (plantado 3×) | 4,3× |
| Câmeras do modelo Vigilux VX-200 falham mais | 3,3× |
| Sinal cai 12–48 h **antes** de uma falha | 45 min online/h nas 24 h antes, contra 58 no geral |
| Equipes "negligentes" deixam manutenção atrasar | 10 equipamentos atrasados |

Os testes (`server/semente/*.test.ts`) exigem esses limites. Outros cuidados: reiniciar com o banco existente **não duplica** nada; se o avaliador abrir dias depois, `preencherLacuna` gera as horas que faltam até "agora" (guarda o ponto em `meta.historico_ate`).

---

## 4. Cada previsão, com um exemplo numérico

Todas estão em `server/preditivo/`, em TypeScript simples. A **base comum** (`base.ts`) usa as 8 últimas semanas, só ocorrências de origem `historico`.

### 4.1 Risco por bairro e hora (`risco.ts`)
`taxa = base do bairro × perfil da região no dia da semana e hora × chuva do dia × tendência da cidade`.
- **Base do bairro** (suavizada): `(ocorrências + 20 × média dos bairros) ÷ (horas + 20)`. O Centro: (1.692 + 3,8) ÷ 1.364 h = **1,24/h**. A suavização evita que um bairro com poucos dados vire extremo.
- **Perfil**: taxa da região naquele horário ÷ taxa média, puxado para o perfil da cidade quando há poucos dados. Dia útil às 18 h: **2,15**; terça às 3 h: **0,36**.
- **Índice 0–100** = `100 × taxa ÷ p99 do período`. Centro na terça às 3 h: 1,24 × 0,36 × 0,98 = 0,44 → **33 (moderado)**; sexta às 18 h: 2,63 → **100 (crítico)**.
- Níveis: < 25 baixo, < 50 moderado, < 75 alto, ≥ 75 crítico. Os "fatores" mostram o que pesou (ex.: "Região Centro na sexta à noite ×1,73").
- A janela de 7 dias é em blocos de 3 h (resposta menor).

### 4.2 Teste retroativo (`backtest.ts`): "como sabem que funciona?"
Para cada um dos 14 dias completos anteriores, **corta o histórico na meia-noite**, recalcula tudo só com o que se sabia até ali, prevê as 24 h e compara com o que aconteceu.
- **Erro (MAE)** por bairro em blocos de 3 h, contra a "média simples do bairro". Em 17/10: 0,53 × 0,58 → 8% melhor. Nas medições de outubro: entre ~7% e ~9% (a tela recalcula todo dia).
- **Top 5**: dos 5 bairros previstos como mais arriscados à noite (18h–2h), quantos de fato estiveram entre os 5 com mais ocorrências: ~4 de 5 (a média simples também acerta ~3,9).
- **Por que não mais?** Com 0 ou 1 ocorrência por bairro e hora, a sorte domina. Rodamos o próprio gerador 600 vezes para estimar as taxas verdadeiras: mesmo quem **sabe a resposta** só melhora ~10%. O modelo chega a ≈ 82% desse teto.

### 4.3 Reforço de agentes (`reforco.ts`)
`carga por agente = ocorrências esperadas na região no turno ÷ agentes escalados`. Guloso, 1 agente por vez, da região mais folgada para a mais carregada, **enquanto** a maior carga estiver ≥ 20% acima da média da cidade e a origem não fique pior que o destino; no máximo 3 mudanças por turno. Exemplo (tarde de quinta): Centro 43 ocorrências ÷ 7 agentes = 6,1; Zona Leste 8,1 ÷ 3 = 2,7; mover 1 → Centro 5,4, Leste 4,1; ninguém acima do limite 6,0, para. Por que sugere o Centro? Ele tem ~33% das ocorrências com 25% dos agentes.

### 4.4 Chance de falha em 7 dias (`falhas.ts`)
`λ = λ_tipo × fator_modelo × (1 + anos/5) × min(3, 1 + dias_de_atraso/30) × (1 + quedas_72h/3)` e `chance = 1 − e^(−7λ)` (Poisson: chance de pelo menos 1 falha em 7 dias).
- `λ_tipo` = falhas do tipo ÷ (frota × 60 dias), **dividido pelo equipamento típico** (mediana dos fatores). Sem isso, a fórmula contava duas vezes a idade e o atraso médios e previa 1,87× as falhas reais.
- `fator_modelo` = (falhas do modelo + 3) ÷ (falhas esperadas + 3). Vigilux VX-200: (51 + 3) ÷ (27,7 + 3) = **1,76**.
- Exemplo: câmera com λ = 0,02/dia → 1 − e^(−0,14) = **13%**. A tela mostra "mais de 99%" em vez de "100%", porque nunca é certeza.
- **Retroativo**: refaz a conta como se fosse 7 dias atrás. Em 4 semanas: 135 previstas × 139 ocorridas (15/10). Na última semana de 17/10: 33 × 40. Os 10% mais arriscados concentram 19–28% das falhas (acaso = 10%).

### 4.5 Anomalias (`tempo-real/anomalias.ts`)
`z = (leitura − média) ÷ desvio`, da mesma hora e tipo de dia (sábado compara com sábado). Alerta com |z| ≥ 3; desvio moderado precisa de 2 leituras seguidas; há piso de desvio (20% da média) para não alarmar por contagens baixas. Medimos: sem esses cuidados eram ~0,9 alertas falsos por minuto; com eles, ~0,09.

### 4.6 Tendências (`tendencias.ts`) e resumo (`resumo.ts`)
Disponibilidade diária por tipo = tempo operacional ÷ tempo que conta (sem desativado/não instalado), reconstruída do `historico_situacao`; projeção = reta de mínimos quadrados de 30 pontos estendida por 7 dias. **Ela perde** para "repetir a média de 30 dias" (erro 4,9 × 4,1 p.p.) numa cidade estável, e a tela avisa. O resumo escolhe as melhores recomendações de cada fonte (máx. 5) e calcula o índice dos bairros.

---

## 5. Regras de negócio

- Número de série **único**; código legível gerado (`FOGO-RAD-0007`).
- GPS **dentro do município** (polígono) e CEP na faixa 17500-000 a 17539-999.
- Manutenção "agendada" ou "periódica" exige a próxima data.
- Equipamento **furtado** não volta a "operacional" sem registro de recuperação.
- **Excluir** equipamento com histórico (telemetria, alertas, agente vinculado) é **recusado**, com mensagem sugerindo **desativar**.
- Editar um equipamento (PUT) **não apaga** posição atual, último sinal nem situação vinda da telemetria; trocar o tipo é recusado.
- Registrar manutenção concluída reinicia o calendário (próxima = última + periodicidade) e devolve o equipamento a operacional, com histórico.
- Busca ignora acento e maiúsculas, e trata `%`, `_` e aspas como texto comum ("marilia" acha "Marília"; "50%" não casa tudo).
- Equipamentos "não instalados" e "desativados" não entram no cálculo de disponibilidade.
- Posição de equipamento móvel vem da telemetria; fixos usam o cadastro. Patinete fora de Marília gera alerta.

**Como os alertas abrem e fecham:** abrem por anomalia, sem sinal por mais de 15 min, falha, furto suspeito, alagamento (sensor), manutenção atrasada e ocorrência. Um alerta igual **não se repete** enquanto o anterior estiver aberto. Fecham sozinhos quando a causa termina (ver seção 2); **furto suspeito e manutenção atrasada precisam de gente** (a atrasada fecha ao registrar a manutenção).

---

## 6. Decisões e por quê

| Decisão | Por quê |
|---|---|
| Aprender só do histórico, não do simulador | O simulador acelera eventos (até 60×): 10 min a 60× = ~10 dias de ocorrências. Aprender com ele deformaria a previsão. |
| Relógio da simulação = relógio real | Nunca grava datas no futuro; "próximas 24 h" continua coerente. A velocidade só multiplica o ritmo dos eventos. |
| Perfil por **região** e dia da semana | O perfil único da cidade escondia "sexta à noite no Centro"; por região o padrão aparece. |
| Tendência da **cidade**, não do bairro | Por bairro, 10 de 65 batiam no limite por puro ruído e o acerto caía abaixo da média simples. |
| Limite do teste de ganho = 6%, não 10% | 10% é o teto de quem conhece as taxas; exigir 10% seria impossível. Não afrouxamos às escuras: medimos o teto. |
| Média simples como régua | Um modelo precisa ganhar de uma regra boba, senão não serve. Mostramos as duas colunas. |
| Alertas que se resolvem sozinhos | Sem isso o painel enchia de alertas de coisas que já passaram e deixava de mostrar "o que acontece agora". |
| Ocorrências ao vivo ×8 (não ×24), 5–20 min | Mantém a quantidade de alertas abertos legível na demonstração. |

---

## 7. Como rodar os testes

```bash
npm test             # 347 testes em 46 arquivos (~10 s)
npx vitest run server/preditivo      # só as previsões
npm run typecheck    # TypeScript estrito
npm run e2e          # fumaça: Central (6 indicadores + mapa), Previsões, ≥ 10 equipamentos
```

Para mostrar a comissão: rodem `npm test` na tela e apontem os testes de `server/preditivo/backtest.test.ts` (provam que cortar o histórico não "vaza" o futuro) e `server/tempo-real/resolucao-automatica.test.ts`.

---

## 8. Vinte perguntas prováveis da comissão

1. **O que é o F.O.G.O.?** Ferramenta de gestão de equipamentos de trânsito e segurança de Marília, em três partes: inventário, central em tempo real e previsões.
2. **Por que SQLite?** Zero instalação (um arquivo que o sistema cria sozinho), SQL puro e fácil de explicar, e rápido o bastante para 350 equipamentos e meio milhão de leituras. Para uma cidade de verdade com leituras a cada segundo, trocaríamos a telemetria por um banco de séries temporais.
3. **Por que SSE e não WebSocket?** O fluxo é só do servidor para a tela, e SSE faz isso com HTTP simples, reconexão automática e menos código. WebSocket serve para conversa nos dois sentidos, que aqui não precisamos (as ações usam a API REST).
4. **Como sabem que a previsão funciona?** Com teste retroativo: refazemos a previsão como se fosse ontem, 14 dias seguidos, e comparamos com o que aconteceu e com uma regra simples. Está na tela, com a data do cálculo.
5. **Por que o ganho é de só ~8%?** Por bairro e hora há quase sempre 0 ou 1 ocorrência; a sorte domina. Mesmo conhecendo as taxas verdadeiras o limite seria ~10%. Preferimos o número honesto.
6. **Os dados são reais?** Bairros, ruas e limite são reais (OpenStreetMap). Equipamentos, agentes e ocorrências são sintéticos, com padrões plantados de propósito, declarados no README.
7. **Então a previsão só acha o que vocês plantaram?** Sim, e isso é a prova do método: se ele não achasse, estaria errado. Numa cidade real, o ajuste seria com os dados reais; o código e o teste retroativo continuam valendo.
8. **E se fosse uma cidade real?** Trocaríamos a semente pela ingestão real (a `POST /api/telemetria` já é a porta que um equipamento usaria), usaríamos autenticação por usuário, banco para séries temporais e o teste retroativo para validar antes de confiar.
9. **O que a IA fez e o que vocês fizeram?** O Claude Code (Opus 5.5 orquestrando e revisando, Sonnet 5.5 implementando) escreveu o código sob um plano e revisão por tarefa. Nós revisamos, rodamos e estudamos cada módulo e sabemos explicá-lo (este guia). Está declarado no README.
10. **Como um dado IoT chega à tela?** Seção 2: ingestão → anomalia → alerta → barramento → SSE → interface.
11. **Como evitam alerta duplicado?** Cada alerta tem uma chave (`anomalia:<equipamento>:<métrica>`); enquanto houver um aberto com a chave, não se cria outro.
12. **Como evitam alarme falso?** Comparação com o normal **do mesmo equipamento naquela hora e tipo de dia**, |z| ≥ 3, confirmação em 2 leituras e piso de desvio. Isso derrubou os falsos de ~0,9 para ~0,09 por minuto.
13. **O que acontece se o servidor reinicia?** Nada duplica; o histórico que faltou é completado até agora; o simulador retoma as ocorrências abertas; e a tela reconecta sozinha ao SSE.
14. **Como a manutenção preditiva decide?** Pela chance de falha em 7 dias: idade, atraso de manutenção, quedas de sinal recentes e confiabilidade do modelo. Cada item mostra os fatores que pesaram.
15. **Como garantem que o GPS é de Marília?** Teste de ponto dentro do polígono do município (limite do OpenStreetMap + margem) no cadastro; patinete que sai gera alerta.
16. **Segurança?** O token de dispositivo é comparado em tempo constante, nunca sai pela API, e o erro de autenticação não revela quais códigos existem. Entradas validadas com zod; SQL parametrizado. Não há login de usuário: é limitação declarada.
17. **Desempenho?** Central povoada abre em ~250 ms; mapa e indicadores respondem em poucos ms; marcadores agrupados; SSE em lotes. A 60× por 10 s, 0 tarefas longas (≥ 50 ms) no navegador.
18. **Por que o modo escuro não é automático?** Decisão de produto: tema claro por padrão; a "Sala de controle" (escuro) é uma escolha de quem opera em ambiente com pouca luz.
19. **Roda sem internet?** Sim, exceto o fundo do mapa (OpenStreetMap). O ViaCEP é opcional.
20. **O que faltou ou faria depois?** Login e permissões, banco de séries temporais, validação com dados reais, e perfil por região também para a tendência. Os limites estão no README.

---

## 9. Sugestão de divisão da apresentação (até 3 pessoas)

- **Pessoa 1 — Inventário e dados** (≈ 3 min): cadastro, filtros, ficha, regras de negócio (seção 5), como a semente planta padrões (seção 3), API e Swagger.
- **Pessoa 2 — Central em tempo real** (≈ 3 min): demonstração ao vivo (60× + injetar acidente), o caminho do dado (seção 2), alertas que abrem e fecham, SSE × WebSocket, desempenho.
- **Pessoa 3 — Previsões e IA** (≈ 3 min): "o que prevê / dados / como ajuda / quão certa foi", um exemplo numérico de cada (seção 4), o teste retroativo e a honestidade sobre o 8%, declaração de uso de IA.

Todos: respondam as perguntas da seção 8 que tocam a sua parte, e abram o código no arquivo citado quando a comissão pedir "mostra onde".
