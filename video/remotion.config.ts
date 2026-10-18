// Configuração do Remotion para o vídeo do F.O.G.O.
// O Remotion baixa um Chrome próprio (~190 MB) na primeira renderização. Para reaproveitar um que já existe no Mac,
// aponte REMOTION_CHROME para o executável chrome-headless-shell; sem a variável, o Remotion baixa o dele.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint('src/index.ts');
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
