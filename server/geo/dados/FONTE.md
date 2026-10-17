# Fonte dos dados geográficos de Marília-SP

- **Origem:** © colaboradores do OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright).
- **Coleta:** 2026-10-17, via Overpass API (servidores consultados: https://overpass-api.de/api/interpreter), pelo script `scripts/geo/baixar-osm.mjs`.
- **Município:** relação OSM 298306 (`admin_level=8`, `name=Marília`, estado de São Paulo), escolhida por conter o centro da cidade (-22,2139; -49,9458).

## O que há em cada arquivo

- `bairros.json` — 112 bairros: 78 de nós `place=suburb|neighbourhood|quarter` e 34 de áreas `landuse=residential` com `name` (complemento, usando o ponto central da área). Nomes repetidos (sem considerar acento/caixa) foram unificados. Só entram bairros dentro do limite urbano (6 fora dele foram descartados).
  - `regiao`: quadrante em relação ao centro; até 1,2 km do centro = `Centro`.
  - `cep`: **aproximado** — número plausível da faixa 17500-000…17539-999 gerado a partir do nome; não é o CEP oficial do bairro.
- `ruas.json` — 1500 vias nomeadas (`highway` = primary, secondary, tertiary, residential) no entorno urbano; por nome, fica a maior via do OSM, simplificada (Douglas-Peucker) a no máximo 30 pontos, 5 casas decimais, `[lng, lat]`.
- `shared/limite-marilia.json` — **envoltória convexa das vias urbanas coletadas com folga de 300 m** (não é o perímetro administrativo do município, que é grande e rural). Polígono simples, anel único e fechado, `[lng, lat]`.

## Consultas (Overpass QL)

```
[out:json][timeout:60];
rel["boundary"="administrative"]["admin_level"="8"]["name"="Marília"](-23,-51,-21,-49);
out tags bb;

[out:json][timeout:90];
area(3600298306)->.m;
(node(area.m)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
 way(area.m)["landuse"="residential"]["name"];);
out tags center;

[out:json][timeout:180];
area(3600298306)->.m;
way(area.m)(-22.27,-50.00,-22.16,-49.89)["highway"~"^(primary|secondary|tertiary|residential)$"]["name"];
out tags geom;
```
