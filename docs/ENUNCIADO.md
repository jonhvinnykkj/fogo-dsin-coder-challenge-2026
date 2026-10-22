# Enunciado original — Etapa Bônus "Desafio F.O.G.O."

Texto copiado da página do DSIN Coder Challenge 2026 (https://appcoderchallenge.dsin.com.br/challenge/) em 17/10/2026, depois do login, sem alterações no conteúdo (só os títulos viraram cabeçalhos). Fica aqui para conferir o sistema item por item; a conferência está em [REVISAO-AVALIADOR.md](REVISAO-AVALIADOR.md), seção 3.

---

ETAPA BÔNUS
Uma cidade que pensa à frente.

Construa uma visão integrada da mobilidade urbana, transforme dados em decisões e mostre a PROMETHEUS o que uma boa solução é capaz de antecipar.


## TRANSMISSÃO PRIORITÁRIA
Desafio F.O.G.O.

PROMETHEUS diz: "Então circuitos à obra! Vou compartilhar com você o meu projeto ultrassecreto, codinome F.O.G.O.: Ferramenta Onisciente de Gestão e Operações. Essa ferramenta será responsável por colocar o controle e gestão das operações de trânsito em outro patamar!"


## Principais Instruções
Os próximos desafios podem ser feitos sozinho ou em um time de até três pessoas — mas atenção: só entra em equipe quem já tiver finalizado a Etapa 1. Nada de carona no commit dos outros!
Você pode optar por resolver um ou mais desafios. Só cuidado com o tempo, pois todo artista se apega demais aos detalhes e nunca consegue acabar suas obras de arte…
E quem vence? Vence quem resolver melhor o problema. As soluções da Etapa Bônus serão avaliadas por uma comissão formada por Devs experientes, criteriosos e provavelmente um pouco cansados depois de testar tanta coisa 😄, que irá considerar pontos como capacidade de resolver o problema proposto, criatividade, inovação, efetividade, desempenho, qualidade técnica, experiência de uso e diferenciais da solução.

No fim, não será sobre quem usou mais tecnologia, mais IA ou mais linhas de código.

Será sobre quem construiu a melhor solução.

O uso de IA para auxiliar no projeto é opcional. Mas se fizer uso de alguma, mencione qual(is), assim PROMETHEUS saberá de qual ficar com ciúmes! Também é importante que você demonstre que tem entendimento daquilo que ela construiu.
O projeto codinome F.O.G.O será dividido em três partes:

## 1ª Parte – Inventário Inteligente da Cidade

O primeiro passo é catalogar os equipamentos de apoio à segurança e ao trânsito que serão instalados nas vias. São equipamentos munidos de IoT, cuja telemetria alimentará PROMETHEUS e servirão de base para tomadas de decisão com foco em melhoria urbana. Sua tarefa é construir um sistema que seja capaz de catalogar as principais informações desses equipamentos:

Tipo de equipamento: radar de fiscalização (velocidade, semáforo, retorno proibido etc), câmera de videomonitoramento, balança de caminhão, veículos autônomos de fiscalização de estacionamento rotativo, cancela automatizada, veículos de transporte (táxi, mototáxi, escolares), totem de autoatendimento para estacionamento rotativo, patinetes elétricos públicos e compartilhados, motos dos agentes de trânsito, viaturas da guarda municipal e polícia militar, entre outros.
Número de série, marca e modelo do equipamento;
Localização de instalação do equipamento ou da base: composta de CEP, bairro, cidade/UF, nome de rua, referência ("número 181", "oposto ao número 181", "KM 203", "S/N", "em frente ao Mercado do Tio" etc) e coordenadas GPS;
Situação: deve ser registrada a situação atual do equipamento, como: "ainda não instalado", "operacional", "mau funcionamento", "desativado", "furtado" etc;
Necessidade de manutenção: deve ser registrada a necessidade de manutenção do equipamento, se imediata (ex.: mau funcionamento) ou se agendada/periódica, bem como a data da próxima manutenção, se for o caso;
Outras características: propriedades particulares de cada tipo de equipamento. Ex.: câmeras de monitoramento podem ou não ter visão noturna, variam de resolução de captura, podem ser coloridas ou preto e branco etc; radares podem ser de velocidade (indicando qual é a velocidade máxima), de semáforo, fiscalização de conversão proibida etc.
Além dos equipamentos, a solução também deverá permitir o cadastro dos agentes que atuam diretamente nas operações de mobilidade e segurança da cidade, como agentes de trânsito, guardas municipais e policiais, possibilitando que esses profissionais também façam parte da visão integrada do F.O.G.O.


## 2ª Parte – Central de Operações da Cidade

Com os equipamentos e agentes devidamente cadastrados, o próximo passo é transformar esses dados em uma visão operacional da cidade.

PROMETHEUS passará a receber continuamente informações dos dispositivos IoT instalados nas vias, além da posição e situação das equipes que atuam em campo. Sua missão será criar uma Central de Operações capaz de apresentar, em tempo real, o que está acontecendo na cidade, permitindo que gestores identifiquem rapidamente problemas, acompanhem a disponibilidade dos recursos e tomem decisões com base em informações atualizadas.

O sistema deverá contar com um dashboard integrado a um mapa, no qual equipamentos e agentes possam ser visualizados de acordo com sua localização e situação atual.

A solução deverá permitir, no mínimo:

visualizar no mapa todos os equipamentos e agentes cadastrados, utilizando ícones ou identificações diferentes para cada tipo;
identificar de forma simples a situação de cada equipamento, como operacional, com mau funcionamento, em manutenção, desativado, furtado ou ainda não instalado;
acompanhar indicadores gerais, como quantidade total de equipamentos, equipamentos operacionais, equipamentos indisponíveis, percentual de disponibilidade e agentes em atividade;
aplicar filtros por tipo de equipamento, situação, bairro, região, órgão responsável ou outros critérios que considerar relevantes;
destacar equipamentos que necessitem de manutenção imediata ou que estejam próximos da data prevista para manutenção;
apresentar alertas para situações consideradas críticas, permitindo que eventos importantes ganhem maior destaque no painel;
possibilitar a consulta aos detalhes de cada equipamento ou agente diretamente pelo mapa;
apresentar uma visão consolidada que permita compreender rapidamente quais regiões da cidade estão operando normalmente e quais exigem atenção.

O objetivo é transformar os dados cadastrados na primeira parte em uma ferramenta de monitoramento e apoio à decisão, permitindo que os gestores e PROMETHEUS tenham uma visão única e atualizada da operação da cidade.

Sinta-se à vontade para criar novos indicadores, mapas de calor, gráficos, níveis de criticidade, agrupamentos por região ou qualquer outra funcionalidade que ajude a responder uma pergunta simples:

Se algo estiver acontecendo na cidade agora, PROMETHEUS conseguirá perceber?


## 3ª Parte – Cidade Preditiva

Agora que o F.O.G.O. já conhece os recursos disponíveis e consegue acompanhar a operação da cidade em tempo real, chegou o momento de dar o próximo passo: tentar antecipar o que ainda não aconteceu.

PROMETHEUS possui acesso aos dados históricos e às informações geradas continuamente pelos equipamentos, agentes e demais recursos da cidade. Sua missão será utilizar esses dados para criar mecanismos capazes de identificar padrões, tendências e situações que possam ajudar os gestores a agir antes que um problema aconteça ou se agrave.

Nesta etapa, a criatividade será parte importante do desafio. Não existe uma única resposta correta nem uma lista fechada de previsões que precisam ser desenvolvidas. Cada participante ou equipe poderá escolher quais problemas deseja antecipar e quais dados utilizar para isso.

identificar regiões, dias ou horários com maior probabilidade de ocorrências ou situações críticas;
estimar momentos em que determinadas regiões poderão necessitar de reforço de agentes ou equipes de segurança e mobilidade;
detectar comportamentos fora do padrão que possam indicar algum problema na operação;
identificar tendências na disponibilidade e utilização dos equipamentos;
criar índices ou níveis de risco para bairros, regiões ou períodos do dia;
gerar alertas preventivos ou recomendações para apoiar a tomada de decisão;
ou desenvolver qualquer outra solução preditiva que utilize os dados disponíveis para melhorar a operação da cidade.

As previsões poderão utilizar desde regras e análises estatísticas até algoritmos mais sofisticados, modelos de Machine Learning ou Inteligência Artificial. A tecnologia escolhida não será o mais importante. O que será avaliado é a capacidade de utilizar os dados de maneira inteligente e transformar uma previsão em algo realmente útil.

O sistema deverá deixar claro o que está sendo previsto, quais informações foram consideradas e como essa previsão pode ajudar na tomada de decisão.

Sinta-se à vontade para criar gráficos, mapas de calor, indicadores de risco, alertas, recomendações automáticas ou qualquer outra forma de demonstrar suas previsões.

PROMETHEUS já consegue enxergar o que está acontecendo na cidade.

Agora resta uma pergunta: Você consegue fazê-lo enxergar o que pode acontecer amanhã?


## CANAL DE SUPORTE
Dúvidas de operação

Antes de iniciar a construção, confira os parâmetros da missão e da entrega.

### Preciso fazer o desafio em alguma linguagem ou tecnologia específica?

Não! Você pode fazer o desafio na linguagem que se sentir mais confortável. Aceitamos até "Portugol" :)

### É verdade que será aceito até "Portugol"?

Sim, nunca mentimos. Na verdade, um de nós sempre mente e o outro sempre diz a verdade. Não, espere... isso é história para outro desafio... É, nunca mentimos ;)

### Preciso utilizar tecnologias front-end?

Não também! Sabemos que existem muitas pessoas que não se sentem confortáveis com CSS, desenvolvimento mobile etc. Então, se quiser, pode fazer apenas uma API, um script único para execução no terminal, ou qualquer outra forma de desenvolvimento que não envolva o front-end.

### E se eu não souber nenhuma linguagem de programação?

Busque resolver com algoritmos. Se você ganhar, seu professor ficará Feliz x2. Caso você tenha entrado há pouco tempo e não aprendeu algoritmos, redija um texto nos explicando como você resolveria os problemas do Sistema de Defesa Global. Consideraremos também :) Mas não fica fazendo textinho se souber alguma linguagem, vai que a gente pergunta para seu professor se você manja das paradas. Podemos fazer isto? Sim! Faremos? Ainda não sabemos.

### Até qual horário posso entregar?

O desafio poderá ser enviado até dia 27 de Outubro de 2026 (terça-feira) às 23:59.

### Como será a avaliação desse desafio?

A avaliação será bem simples: Quem resolver mais e/ou melhor os problemas ganha.

### Como faço o envio?

A gente gostaria que você enviasse o código fonte escrito à mão pelo correio 🤪! Mas aceitamos o código fonte e quaisquer outros arquivos úteis para a execução do projeto.
P.S.: Envie sempre todas as informações necessárias para rodarmos o projeto. Sempre que um projeto roda de primeira, avaliamos ele com um sorriso no rosto e isto coincidentemente gera uma nota melhor. Caso você envie um vídeo do sistema sendo executado você ganhará um ponto extra. Não precisa aparecer e nem falar no vídeo se não quiser.

### Qual o formato esperado pelo Sistema de Defesa Global?

O grupo de cientistas esqueceu de definir as especificações, então são obrigados legalmente a aceitar a maioria dos formatos (contanto que resolva os problemas descritos lá em cima), então pode ser um sistema, um app, um robô, um prêmio da megasena, etc.

O limite de envio é de 50 MB. Se o arquivo ultrapassar esse tamanho, revise se não há arquivos desnecessários, como a pasta node_modules. Caso ainda precise enviar um projeto maior, coloque-o em um repositório no GitHub e deixe-o público, ou em um Drive com acesso liberado para qualquer pessoa com o link. Copie o link e coloque-o em um arquivo .txt. Em seguida, faça a submissão desse arquivo para que possamos visualizar.

### E as outras dúvidas que eu tenho?

Como nosso algoritmo de reconhecimento de dúvidas é um MVP, ele não poderá mais te ajudar este ano.

### Como saberei que ganhei?

Vamos divulgar o vencedor no instagram e facebook da DSIN.
Seguem ai os links: Instagram e Facebook
