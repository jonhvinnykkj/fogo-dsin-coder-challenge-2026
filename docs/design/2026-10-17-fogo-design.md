# F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

Documento de design · 17/10/2026 · Etapa Bônus do DSIN Coder Challenge 2026

## 1. Intenção

A comissão da DSIN vai abrir dezenas de projetos e testar cada um. Vence quem **resolve melhor o problema**: capacidade de resolver, criatividade, inovação, efetividade, desempenho, qualidade técnica, experiência de uso e diferenciais. Projeto que **roda de primeira** ganha nota melhor; vídeo do sistema rodando vale ponto extra.

O F.O.G.O. precisa, nos primeiros 30 segundos, mostrar uma cidade **viva**: um mapa de Marília (sede da DSIN) com equipamentos e agentes se mexendo, alertas chegando, regiões coloridas por situação — e, a um clique, a pergunta respondida: *"se algo estiver acontecendo agora, PROMETHEUS percebe?"* e *"o que pode acontecer amanhã?"*.

## 2. Metas, não-metas e anti-metas

**Metas**
- Cobrir as **3 partes** do enunciado, todas funcionando de ponta a ponta num único sistema.
- Rodar com **um comando** (`npm install && npm start`) ou `docker compose up`, sem configurar banco, chave ou serviço externo.
- Dados **realistas e coerentes**: ruas e bairros reais de Marília, CEPs da faixa da cidade, histórico sintético com padrões plantados que a parte preditiva redescobre (e prova isso com teste retroativo).
- Tempo real de verdade: telemetria simulada entrando por uma **API de ingestão IoT** (a mesma que um equipamento real usaria) e chegando à tela por Server-Sent Events.
- Toda previsão diz **o que prevê, com quais dados, como ajuda a decidir e quão confiável foi** no passado.
- Código que o time consiga **explicar** (o enunciado exige demonstrar entendimento do que a IA construiu): TypeScript estrito, SQL legível, módulos pequenos com nomes em português do domínio, testes que documentam as regras.

**Não-metas**
- Integração com equipamentos reais, mapas pagos, nuvem, filas externas.
- Modelos de ML pesados (Python, TensorFlow). A previsão é estatística explicável em TypeScript.
- Multi-cidade, multi-inquilino, permissões finas.

**Anti-metas** (falha mesmo que "funcione")
- Visual "genérico de IA": creme, cartão branco com borda fina, ícone de traço fino em bolinha colorida, avatar de iniciais.
- Tela vazia ou dados "Lorem": a primeira abertura já precisa estar povoada.
- Número sem origem: todo indicador precisa ser calculável a partir dos dados gravados.
- Previsão "mágica" sem explicação ou sem medida de acerto.
- Dependência que quebra a instalação do avaliador (serviço online obrigatório, chave de API, banco para instalar).

## 3. Restrições

- Prazo de entrega: **27/10/2026 23:59**. Entrega em `.zip` ≤ 50 MB (sem `node_modules`) ou `.txt` com link público.
- Node ≥ 20 (testado em 22). Funcionar em macOS, Windows e Linux.
- Única dependência de rede em uso: os blocos do mapa (OpenStreetMap). Busca de CEP pelo ViaCEP é opcional, com o preenchimento manual sempre possível.
- Declarar o uso de IA no README (Claude Code, modelos Claude Opus 5.5 e Sonnet 5.5) e incluir um **guia de estudo** para o time explicar o sistema.

## 4. Decisões de construção (decisão do Claude — usuário delegou tudo)

| Assunto | Escolha | Por quê |
|---|---|---|
| Forma | Sistema web: servidor + interface no mesmo projeto | Atende as 3 partes com mapa e painel; o avaliador abre no navegador |
| Servidor | Node + **Fastify** + TypeScript (tsx) | Rápido, simples de ler, `fastify.inject` facilita testes de API |
| Banco | **SQLite** (better-sqlite3), arquivo `data/fogo.db`, criado e povoado sozinho no primeiro start | Zero instalação; SQL puro, fácil de explicar |
| Validação | zod (compartilhado entre servidor e interface) | Uma regra, dois lados |
| Tempo real | Simulador no próprio processo → `POST /api/telemetria` (lógica) → motor de regras/alertas → **SSE** `/api/stream` | Mostra o caminho real de um dado IoT |
| Interface | **React + Vite** + TypeScript, React Router, TanStack Query | Padrão de mercado, build rápido |
| Mapa | **Leaflet** (react-leaflet) + OpenStreetMap, agrupamento de marcadores, camada de calor, polígonos de bairro | Gratuito, sem chave |
| Gráficos | Recharts | Simples e suficiente |
| Ícones | **Phosphor (estilo cheio)**, sempre com palavra ao lado | Foge do traço fino genérico |
| Testes | Vitest (regras, previsões, simulador, rotas da API) + 1 teste de fumaça E2E com Playwright | Qualidade técnica visível |
| Cidade | **Marília-SP** (sede da DSIN), bairros e ruas do OpenStreetMap, salvos em JSON no repositório | Toque local; não depende de rede ao rodar |
| Pasta | `~/Desktop/Desenvolvimento de Projetos/Projetos - Pessoais/meus/fogo-dsin-coder-challenge` | Padrão de pastas do usuário |

## 5. Domínio

### 5.1 Tipos de equipamento (catálogo com características próprias)
Cada tipo define seus campos particulares (formulário dinâmico + validação zod):

| Tipo | Exemplos de características |
|---|---|
| Radar de fiscalização | modalidade (velocidade, avanço de semáforo, conversão proibida, retorno proibido, parada sobre faixa), velocidade máxima (km/h), faixas monitoradas, sentido |
| Câmera de videomonitoramento | resolução (720p/1080p/4K), visão noturna, colorida/P&B, PTZ, ângulo, armazenamento (dias) |
| Balança de caminhão (pesagem em movimento) | capacidade (t), tolerância (%), eixos lidos |
| Veículo autônomo de fiscalização do rotativo | autonomia (km), câmeras OCR, rota |
| Cancela automatizada | tipo de acesso (tag, ticket, placa), local (estacionamento, terminal) |
| Veículo de transporte cadastrado | categoria (táxi, mototáxi, escolar), placa, capacidade, permissionário |
| Totem de autoatendimento do rotativo | meios de pagamento, impressora, tela acessível |
| Patinete elétrico compartilhado | operadora, autonomia, bateria (%) |
| Moto de agente de trânsito | placa, cilindrada |
| Viatura (Guarda Municipal / PM) | placa, órgão, prefixo |
| Semáforo inteligente | fases, botoeira para pedestre, sincronizado |
| Painel de mensagem variável | tamanho, cores |
| Sensor de alagamento | altura de alerta (cm) |

Equipamento **móvel** (veículos, motos, viaturas, patinetes) tem base cadastrada e posição atual vinda da telemetria.

### 5.2 Dados de um equipamento
código legível (`FOGO-RAD-0007`), tipo, número de série (único), marca, modelo, órgão responsável, **situação** (`nao_instalado`, `operacional`, `mau_funcionamento`, `em_manutencao`, `desativado`, `furtado`), localização (CEP, logradouro, referência livre — "nº 181", "oposto ao nº 181", "KM 203", "S/N", "em frente ao Mercado do Tio" —, bairro, cidade/UF, latitude, longitude), **manutenção** (necessidade `nenhuma` / `imediata` / `agendada` / `periodica`, periodicidade em dias, última e próxima data), características (JSON validado pelo tipo), data de instalação, histórico de mudanças de situação.

### 5.3 Agentes
nome, matrícula, categoria (agente de trânsito, guarda municipal, policial militar), órgão, situação (`em_servico`, `em_ocorrencia`, `pausa`, `fora_de_servico`), turno, base, posição atual, equipamento vinculado (moto/viatura), contato.

### 5.4 Outras entidades
bairros (nome, região Centro/Norte/Sul/Leste/Oeste, centro, polígono), ocorrências (acidente, congestionamento, infração, furto/vandalismo de equipamento, veículo quebrado na via, alagamento, ocorrência de segurança; gravidade; local; início/fim; origem; agente que atendeu), telemetria (série temporal agregada por equipamento), ordens de manutenção, alertas (criticidade crítica/alta/média/baixa, reconhecer, resolver).

## 6. As três partes

### Parte 1 — Inventário Inteligente da Cidade
- Lista de equipamentos com busca, filtros (tipo, situação, bairro, região, órgão, manutenção) e paginação; mesma coisa para agentes.
- Formulário de cadastro/edição: campos por tipo, CEP com preenchimento automático (ViaCEP, opcional) e **escolha do ponto no mapa** (clique preenche GPS e sugere bairro).
- Ficha do equipamento: dados, mini-mapa, linha do tempo de situação, manutenções, gráfico da telemetria recente, alertas ligados.
- Regras: número de série único; GPS dentro do município; próxima manutenção obrigatória quando agendada/periódica; equipamento furtado não pode ficar "operacional" sem registro de recuperação.
- API REST documentada (página `/api/docs`).

### Parte 2 — Central de Operações da Cidade
- **Mapa** ocupando a tela: marcadores por tipo (ícone) e situação (cor), agrupados quando há muitos; agentes com posição ao vivo; bairros pintados pelo índice de atenção.
- **Faixa de indicadores** em blocos de cor cheia: total de equipamentos, operacionais, indisponíveis, % de disponibilidade, agentes em atividade, alertas críticos abertos.
- **Filtros**: tipo, situação, bairro, região, órgão, "só manutenção imediata/próxima".
- **Feed de alertas** em tempo real (críticos em destaque), com reconhecer/resolver.
- **Painel de regiões**: quais operam normalmente e quais exigem atenção (índice por região/bairro com motivo).
- Clique em marcador → ficha lateral com detalhes e ações.
- **Controles de demonstração**: velocidade da simulação (1×/10×/60×) e "injetar evento" (furto, falha, acidente, alagamento) para a comissão ver a cidade reagir.

### Parte 3 — Cidade Preditiva
Histórico sintético de ~60 dias, gerado com semente fixa e **padrões plantados** (picos 7–9h e 17–19h, sexta/sábado à noite no Centro, horário escolar perto de escolas, dias de chuva com mais acidentes, marcas menos confiáveis, furto de patinetes em certos bairros). Cada módulo mostra *o que prevê · dados usados · como ajuda · confiabilidade*.

1. **Risco por bairro e hora (próximas 24 h e 7 dias)** — taxa esperada de ocorrências = base do bairro × perfil dia-da-semana/hora × tendência recente, com suavização para bairros com poucos dados; índice 0–100 e níveis. Mapa de calor com régua de horário. **Teste retroativo** nas últimas 2 semanas (erro médio e "dos 5 bairros previstos como mais arriscados, quantos de fato foram").
2. **Reforço de agentes** — carga prevista por região e turno × agentes escalados → recomendações concretas ("mover 2 agentes da Zona Sul para o Centro das 17h às 20h de sexta").
3. **Manutenção preditiva** — chance de falha nos próximos 7 dias por equipamento a partir de idade, atraso de manutenção, taxa recente de quedas/erros e confiabilidade do modelo; ranking com os fatores de cada um.
4. **Anomalias em tempo real** — comparação da telemetria com o normal daquele equipamento naquela hora (média móvel + desvio); ex.: radar zerado no horário de pico → provável falha; velocidade média despencando → congestionamento se formando; vários excessos de peso na balança. Viram alertas explicados.
5. **Tendências** — disponibilidade por tipo (30 dias + projeção), uso de patinetes por bairro, recorrência de falhas por marca/modelo.
6. **Índice de risco dos bairros** consolidado e **recomendações automáticas** do dia.

## 7. Experiência e visual

- **Tema claro por padrão**; modo escuro só por escolha ("Sala de controle"), em grafite (#1E1E1F / #2A2A2C), nunca preto puro, nunca automático pelo sistema.
- Identidade F.O.G.O.: laranja-fogo como cor de marca/ação, grafite nos textos; situação em **blocos de cor cheia** com número grande; cantos retos ou pílula; separação por degrau de tom em vez de borda fina; ícones Phosphor cheios com palavra.
- Português do Brasil em toda a interface; números com separador brasileiro; datas dd/mm/aaaa.
- Responsivo: Central utilizável em notebook (1366×768) e tablet; cadastro funcional no celular.
- Desempenho: agrupamento de marcadores, SSE com lotes, listas paginadas, índices no banco.

## 8. Entregáveis

1. Código-fonte + README (como rodar, telas, arquitetura, dicionário de dados, decisões, **declaração de uso de IA**).
2. `docs/GUIA-DO-TIME.md`: como cada parte funciona, fluxo de um dado IoT, como cada previsão é calculada, perguntas prováveis da comissão com respostas.
3. Dockerfile + docker-compose como alternativa.
4. Vídeo de demonstração (ponto extra) — depois do sistema aprovado pelo usuário.
5. `.zip` ≤ 50 MB. O formulário de entrega (nome do time, integrantes, tecnologias) **só é preenchido e enviado com o OK e os dados do usuário**.

## 9. Fica a critério de quem constrói
Estrutura interna de pastas, nomes de componentes, biblioteca de estilos, detalhes visuais dentro da direção acima, fórmulas exatas dos índices (desde que explicadas e testadas), quantidade exata de equipamentos (~350) e agentes (~80) na semente.
