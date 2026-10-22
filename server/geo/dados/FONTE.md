# Fonte dos dados geográficos de Marília-SP

- **Origem:** © colaboradores do OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright).
- **Coleta:** 2026-10-17, via Overpass API (servidores: https://overpass-api.de/api/interpreter), pelo script `scripts/geo/baixar-osm.mjs`.
- **Município:** relação OSM 298306 (`admin_level=8`, `name=Marília`, estado de São Paulo), escolhida por conter o centro da cidade (-22,2139; -49,9458).

## O que há em cada arquivo

- `bairros.json` — 65 bairros: 64 de nós `place=suburb|neighbourhood|quarter` (base) e 1 de áreas `landuse=residential` com `name` (complemento, ponto central da área), aceitos só se o nome parece bairro (Jardim, Vila, Parque, Bairro, Núcleo, Chácara…) e descartados se contêm Condomínio, Residencial, Conjunto, Resort, Boulevard, Village, Loteamento, Terras de, Silenzio ou Recanto (a lista de exclusão vale também para os nós place). Cada bairro mantido tem ao menos 2 vias coletadas a até 400 m do seu centro (exceto "Centro") e está dentro do limite urbano. Espaços repetidos nos nomes foram normalizados; a grafia do OSM foi mantida, salvo cinco nomes sem acento que ganharam a forma correta (22/10/2026): Parque dos Ipês, Jóquei Clube, Jardim São Vicente de Paulo, Jardim Guarujá e Jardim Teotônio Vilela. Nomes que parecem estranhos mas não têm fonte para corrigir (ex.: "Jardim Domingos de Leo", "Jardim California") ficam como vieram do OSM.
  - **Centro:** criado nas coordenadas do nó OSM place=city "Marília" (centro histórico).
  - `regiao`: quadrante em relação ao centro; até 1,2 km do centro = `Centro`.
  - `cep`: **aproximado** — número plausível gerado a partir do nome, dentro de uma faixa por região (Centro 17500–17509, Norte 17510–17514, Sul 17515–17519, Leste 17520–17529, Oeste 17530–17539); não é o CEP oficial do bairro.
- `ruas.json` — 1380 vias nomeadas (`highway` = primary, secondary, tertiary, residential) da mancha urbana principal; sem estradas/rodovias rurais; por nome fica a maior via do OSM, simplificada (Douglas-Peucker) a no máximo 30 pontos, 5 casas decimais, `[lng, lat]`.
- `shared/limite-marilia.json` — **envoltória convexa das vias da mancha urbana principal + 300 m** (não é o perímetro administrativo do município, grande e rural). A mancha é a maior componente 8-conectada de uma grade de ~300 m em que cada célula tem ao menos 6 vias distintas (limiar empírico: com 3 a mancha engloba distritos rurais e chega a ~87 km²). Área: **70.0 km²**. Polígono simples, anel único e fechado, `[lng, lat]`.

## Consultas (Overpass QL)

```
[out:json][timeout:60];
rel["boundary"="administrative"]["admin_level"="8"]["name"="Marília"](-23,-51,-21,-49);
out tags bb;

[out:json][timeout:90];
area(3600298306)->.m;
(node(area.m)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
 node(area.m)["place"~"^(city|town)$"]["name"="Marília"];
 way(area.m)["landuse"="residential"]["name"];);
out tags center;

[out:json][timeout:180];
area(3600298306)->.m;
way(area.m)(-22.27,-50.00,-22.16,-49.89)["highway"~"^(primary|secondary|tertiary|residential)$"]["name"];
out tags geom;
```
