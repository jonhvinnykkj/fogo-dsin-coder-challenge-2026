// Preparação única do Leaflet para o bundler: CSS do mapa e do agrupamento de marcadores, e os ícones padrão
// apontando para os arquivos empacotados pelo Vite (sem isso o marcador padrão aparece quebrado).
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import icone2x from 'leaflet/dist/images/marker-icon-2x.png';
import icone from 'leaflet/dist/images/marker-icon.png';
import sombra from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: icone, iconRetinaUrl: icone2x, shadowUrl: sombra });

export { L };
