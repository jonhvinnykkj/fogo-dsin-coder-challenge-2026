# Documentação do F.O.G.O.

O que está em cada lugar desta pasta.

## Para quem avalia

| Arquivo | O que é |
| --- | --- |
| [Relatorio-Tecnico-FOGO.pdf](Relatorio-Tecnico-FOGO.pdf) | Relatório técnico completo, no padrão ABNT (gerado a partir de `relatorio/`) |
| [SEGURANCA.md](SEGURANCA.md) | Papéis, permissões por rota, LGPD, auditoria e o que ficou de fora |
| [ENUNCIADO.md](ENUNCIADO.md) | O enunciado do desafio, para conferir os requisitos |

## Para o time

| Arquivo | O que é |
| --- | --- |
| [GUIA-DO-TIME.md](GUIA-DO-TIME.md) | Mapa do código, o caminho de um dado IoT, as fórmulas e as perguntas prováveis da comissão |
| [REVISAO-AVALIADOR.md](REVISAO-AVALIADOR.md) | Revisão do sistema como um avaliador faria, com o que foi corrigido em cada rodada |
| [design/](design/) | Documento de design e plano de implementação do começo do projeto (histórico: os caminhos citados ali podem ter mudado) |

## Material de apoio

| Pasta | O que é |
| --- | --- |
| [telas/](telas/) | Capturas usadas no README da raiz |
| [relatorio/](relatorio/) | Fonte do PDF: `modelo/` (HTML e CSS), `diagramas/` (Mermaid e SVG), `dados/` e `capturas/` (tirados do sistema rodando) e `scripts/` que geram tudo (`node docs/relatorio/scripts/gerar-pdf.mjs`) |

`design/` e `relatorio/` não entram no `.zip` de entrega (`npm run empacotar`).
