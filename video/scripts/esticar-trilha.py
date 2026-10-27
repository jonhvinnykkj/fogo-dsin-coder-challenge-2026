#!/usr/bin/env python3
"""Estica a trilha (public/audio/trilha.mp3, feita para o vídeo de 2:26) até a duração do vídeo novo, sem gerar outra.

Repete compassos inteiros do miolo (o groove estável, depois da subida dos primeiros 15 s e antes do acorde final),
emendando no tempo da batida com cruzamento curto, e mantém o fim original: a música continua acabando junto com o
vídeo. A sobra menor que um compasso vira silêncio no começo (a trilha já entra devagar).

Uso: ~/ferramentas/voz/.venv/bin/python scripts/esticar-trilha.py <duracao_do_video_s>
Grava public/audio/trilha-longa.mp3 (a original fica intacta).
"""
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / 'public' / 'audio' / 'trilha.mp3'
DESTINO = RAIZ / 'public' / 'audio' / 'trilha-longa.mp3'
TAXA = 44100
CRUZA = int(0.06 * TAXA)  # 60 ms


def main() -> None:
    alvo = float(sys.argv[1])
    y, _ = librosa.load(ORIGEM, sr=TAXA, mono=False)
    mono = librosa.to_mono(y)
    tempo, batidas = librosa.beat.beat_track(y=mono, sr=TAXA, units='samples')
    tempo = float(np.atleast_1d(tempo)[0])
    compasso = 4 * 60 / tempo
    duracao = y.shape[1] / TAXA
    falta = alvo - duracao
    if falta <= 0:
        raise SystemExit(f'O vídeo ({alvo:.1f} s) não é mais longo que a trilha ({duracao:.1f} s)')

    # trecho que se repete: da 1ª batida depois de 30 s até a última antes de 30 s do fim, em compassos inteiros
    b = batidas[(batidas > 30 * TAXA) & (batidas < y.shape[1] - 30 * TAXA)]
    ini = int(b[0])
    compassos_trecho = int((b[-1] - ini) / TAXA // compasso)
    fim = ini + int(round(compassos_trecho * compasso * TAXA))
    trecho = fim - ini
    compassos_falta = int(falta // compasso)
    vezes, resto = divmod(compassos_falta, compassos_trecho)
    pedacos = [y[:, :fim]]
    for _ in range(vezes):
        pedacos.append(y[:, ini:fim])
    if resto:
        pedacos.append(y[:, ini:ini + int(round(resto * compasso * TAXA))])
    pedacos.append(y[:, fim:])

    saida = pedacos[0]
    rampa = np.linspace(0, 1, CRUZA)
    for p in pedacos[1:]:
        mistura = saida[:, -CRUZA:] * (1 - rampa) + p[:, :CRUZA] * rampa
        saida = np.concatenate([saida[:, :-CRUZA], mistura, p[:, CRUZA:]], axis=1)
    sobra = int(round(alvo * TAXA)) - saida.shape[1]
    if sobra > 0:
        saida = np.concatenate([np.zeros((2, sobra), dtype=saida.dtype), saida], axis=1)
    else:
        saida = saida[:, -sobra:]

    wav = DESTINO.with_suffix('.wav')
    sf.write(wav, saida.T, TAXA)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '192k', str(DESTINO)], check=True)
    wav.unlink()
    print(f'tempo {tempo:.1f} BPM, compasso {compasso:.3f} s; trecho de {compassos_trecho} compassos ({trecho / TAXA:.1f} s) '
          f'repetido {vezes}× + {resto} compassos; silêncio no começo {max(sobra, 0) / TAXA:.2f} s; final {saida.shape[1] / TAXA:.2f} s')


if __name__ == '__main__':
    main()
