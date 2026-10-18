#!/usr/bin/env python3
"""Trilha instrumental e efeitos sonoros do vídeo do F.O.G.O. (ElevenLabs), um pedido por vez.

- Música: POST /v1/music, instrumental, com o comprimento do vídeo (o fim da música coincide com o fim do vídeo).
- Efeitos: POST /v1/sound-generation, um som curto e discreto por momento (alerta crítico, 3 transições de capítulo,
  2 tiques para as placas de número).
- Chave da linha 1 do ~/.config/elevenlabs/.env; se ela for recusada para música/efeitos, tenta a da linha 2.
- Só fica o arquivo de HTTP 200 (na falha a API grava o JSON de erro no lugar do áudio). 401/cota: para e avisa.
- Normaliza: trilha em -16 LUFS, efeitos em -20 LUFS (a mixagem no Remotion parte desses níveis).

Uso: ~/ferramentas/voz/.venv/bin/python scripts/trilha.py <duracao_do_video_s> <pasta_temporaria>
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AUDIO = RAIZ / 'public' / 'audio'

MUSICA = (
    'Calm, modern instrumental technology background music for a product demo of a city operations control room. '
    '92 BPM, steady and confident, institutional. Soft analog synth pads, clean plucked arpeggio, warm round bass, '
    'light electronic percussion with a gentle kick and subtle hi-hats. Slow, gradual build during the first 15 seconds, '
    'then a steady understated groove that sits comfortably under a voice-over. No vocals, no choir, no epic climax, '
    'no big drops or risers. Ends cleanly on a soft, resolved final chord.'
)

EFEITOS = {
    'alerta': ('Short subtle digital notification ping for a critical alert on a control room dashboard, two soft clean high tones, modern, not cartoonish', 1.2),
    'transicao-1': ('Soft airy whoosh, smooth and quick, warm and low, subtle modern UI transition, no impact', 1.0),
    'transicao-2': ('Gentle swish of air passing from left to right, light and clean, subtle modern UI transition, no impact', 1.0),
    'transicao-3': ('Smooth subtle whoosh with a faint digital shimmer at the end, soft modern UI transition, no impact', 1.1),
    'tique-a': ('Very light soft tick, a tiny clean click like a precise dial settling into place, subtle UI sound', 0.5),
    'tique-b': ('Tiny muted wooden tick, soft and short, subtle UI confirmation click', 0.5),
}


def chave(linha: int) -> str:
    return open(os.path.expanduser('~/.config/elevenlabs/.env')).read().splitlines()[linha - 1].split('=', 1)[1].strip()


def pedir(url: str, corpo: dict, destino: Path) -> int:
    """Faz o pedido com a chave da linha 1 e, se ela for recusada (401/403), com a da linha 2. Devolve a linha usada."""
    parcial = destino.with_suffix('.parcial')
    for linha in (1, 2):
        for tentativa in range(6):
            r = subprocess.run(['curl', '-s', '-o', str(parcial), '-w', '%{http_code}', url, '-H', f'xi-api-key: {chave(linha)}',
                                '-H', 'Content-Type: application/json', '-d', json.dumps(corpo)], capture_output=True, text=True)
            codigo = r.stdout.strip()
            if codigo == '200':
                parcial.rename(destino)
                return linha
            erro = parcial.read_text(errors='ignore')[:400] if parcial.exists() else ''
            parcial.unlink(missing_ok=True)
            if codigo == '429' and 'concurrent' in erro and tentativa < 5:
                time.sleep(10 + 5 * tentativa)
                continue
            if codigo in ('401', '403') and linha == 1 and 'quota' not in erro:
                print(f'linha 1 recusada ({codigo}): {erro[:160]} — tentando a linha 2', flush=True)
                break
            raise SystemExit(f'PARAR {destino.name}: HTTP {codigo} {erro}')
    raise SystemExit(f'PARAR {destino.name}: as duas chaves recusaram')


def normalizar(origem: Path, destino: Path, alvo: float) -> float:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(origem), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    medido = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])
    ganho = alvo - medido
    if medido < -50:  # som curto demais para a medida integrada (tique de 0,5 s): normaliza pelo pico em -9 dBFS
        pico = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(origem), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
        ganho = -9.0 - float(re.findall(r'max_volume:\s+(-?[\d.]+) dB', pico.stderr)[-1])
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(origem), '-af', f'volume={ganho:.2f}dB,alimiter=limit=0.95',
                    '-c:a', 'libmp3lame', '-b:a', '160k', str(destino)], check=True)
    return medido


if __name__ == '__main__':
    duracao = float(sys.argv[1])
    tmp = Path(sys.argv[2])
    tmp.mkdir(parents=True, exist_ok=True)
    (AUDIO / 'sfx').mkdir(parents=True, exist_ok=True)
    relatorio = {}

    bruto = tmp / 'trilha-bruta.mp3'
    if not bruto.exists():
        linha = pedir('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
                      {'prompt': MUSICA, 'music_length_ms': int(round(duracao * 1000)), 'force_instrumental': True}, bruto)
        print(f'trilha gerada (chave da linha {linha})', flush=True)
    relatorio['trilha'] = {'prompt': MUSICA, 'lufs_original': normalizar(bruto, AUDIO / 'trilha.mp3', -16.0)}

    for nome, (texto, segundos) in EFEITOS.items():
        bruto = tmp / f'{nome}-bruto.mp3'
        if not bruto.exists():
            linha = pedir('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
                          {'text': texto, 'duration_seconds': segundos, 'prompt_influence': 0.55}, bruto)
            print(f'efeito {nome} gerado (chave da linha {linha})', flush=True)
        relatorio[nome] = {'prompt': texto, 'segundos': segundos, 'lufs_original': normalizar(bruto, AUDIO / 'sfx' / f'{nome}.mp3', -20.0)}

    (tmp / 'trilha-relatorio.json').write_text(json.dumps(relatorio, ensure_ascii=False, indent=1))
    print(json.dumps({k: round(v['lufs_original'], 1) for k, v in relatorio.items()}), flush=True)
