#!/usr/bin/env python3
"""Narração do vídeo do F.O.G.O. com a ElevenLabs (voz Brian), frase por frase.

1. gerar: uma requisição por vez (curl; o urllib toma 403), com previous_text/next_text. Pergunta vai sozinha, com
   ajustes próprios e 4 tomadas; frase com "Claude Code" ganha 2 tomadas. Só fica o arquivo de HTTP 200 (na falha a
   API grava o JSON de erro no lugar do áudio). 401/cota: para e avisa, sem trocar voz nem serviço.
2. montar: junta todas as tomadas num arquivo só e roda o WhisperX uma vez (timestamps por palavra); corta o silêncio
   do começo e qualquer lixo depois da última palavra esperada; escolhe a pergunta que mais sobe no fim (librosa.yin
   com porta de energia) e o "Claude Code" que a transcrição entende; aplica um ganho único para -16 LUFS e grava
   public/audio/narracao/<id>.mp3 + public/audio/narracao.json (durações, tomada escolhida, transcrição).

Uso: ~/ferramentas/voz/.venv/bin/python scripts/narrar.py <narracao.json> <pasta_temporaria> [gerar|montar|tudo]
"""
import difflib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

VOZ = 'nPczCjzI2devNBz1zQrb'  # Brian
URL = f'https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_128'
AJUSTE = {'stability': 0.5, 'similarity_boost': 0.8, 'style': 0.2, 'use_speaker_boost': True, 'speed': 0.92}
AJUSTE_PERGUNTA = {'stability': 0.3, 'similarity_boost': 0.8, 'style': 0.45, 'use_speaker_boost': True, 'speed': 1.15}
SEMENTES = [7, 19, 31, 43, 59, 71]
TAXA = 44100
RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'public' / 'audio' / 'narracao'
MANIFESTO = RAIZ / 'public' / 'audio' / 'narracao.json'
WHISPERX = os.path.expanduser('~/.local/bin/whisperx')


def chave(linha: int = 1) -> str:
    # o arquivo tem duas linhas; grep juntaria as duas e o curl quebra
    return open(os.path.expanduser('~/.config/elevenlabs/.env')).read().splitlines()[linha - 1].split('=', 1)[1].strip()


def norm(texto: str) -> str:
    t = unicodedata.normalize('NFD', texto.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return ' '.join(re.sub(r'[^a-z0-9 ]+', ' ', t).split())


def tomadas_de(frase: dict) -> int:
    return int(frase.get('tomadas', 1))


def gerar(frases: list, tmp: Path) -> None:
    pasta = tmp / 'tomadas'
    pasta.mkdir(parents=True, exist_ok=True)
    for i, frase in enumerate(frases):
        anterior = frases[i - 1]['fala'] if i > 0 else None
        seguinte = frases[i + 1]['fala'] if i + 1 < len(frases) else None
        for k in range(tomadas_de(frase)):
            destino = pasta / f"{frase['id']}_{k}.mp3"
            if destino.exists():
                continue
            corpo = {
                'text': frase['fala'],
                'model_id': 'eleven_multilingual_v2',
                'language_code': 'pt',
                'seed': SEMENTES[k],
                'voice_settings': AJUSTE_PERGUNTA if frase.get('pergunta') else AJUSTE,
            }
            if anterior and not frase.get('semContexto'):
                corpo['previous_text'] = anterior
            if seguinte and not frase.get('semContexto'):
                corpo['next_text'] = seguinte
            parcial = destino.with_suffix('.parcial')
            for tentativa in range(6):
                r = subprocess.run(
                    ['curl', '-s', '-o', str(parcial), '-w', '%{http_code}', URL, '-H', f'xi-api-key: {chave()}',
                     '-H', 'Content-Type: application/json', '-d', json.dumps(corpo)],
                    capture_output=True, text=True)
                codigo = r.stdout.strip()
                if codigo == '200':
                    parcial.rename(destino)
                    break
                erro = parcial.read_text(errors='ignore')[:400] if parcial.exists() else ''
                parcial.unlink(missing_ok=True)
                if codigo == '429' and 'concurrent' in erro and tentativa < 5:
                    time.sleep(8 + 4 * tentativa)  # outra sessão usando a mesma conta: espera e tenta de novo
                    continue
                raise SystemExit(f"PARAR {frase['id']} tomada {k}: HTTP {codigo} {erro}")
            print(f"gerada {frase['id']}_{k}", flush=True)


def subida_final(y: np.ndarray, sr: int) -> float:
    """Quanto o tom sobe no fim (semitons): último terço dos quadros com voz contra o trecho anterior."""
    f0 = librosa.yin(y, fmin=65, fmax=320, sr=sr, frame_length=2048, hop_length=256)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=256)[0]
    n = min(len(f0), len(rms))
    f0, rms = f0[:n], rms[:n]
    voz = f0[rms >= 0.3 * rms.max()]
    if len(voz) < 12:
        return -99.0
    st = 12 * np.log2(voz / np.median(voz))
    st = np.where(st > 6, st - 12, np.where(st < -6, st + 12, st))  # corrige saltos de oitava do yin
    corte = int(len(st) * 0.7)
    fim, antes = st[corte:], st[int(len(st) * 0.3):corte]
    return float(np.median(fim) - np.median(antes)) + 0.5 * float(np.median(fim) - np.median(st))


def trechos_com_voz(y: np.ndarray, sr: int, limiar_db: float = -42.0, pausa: float = 0.45) -> list:
    """Trechos (início, fim em s) com som acima do limiar; pausas menores que `pausa` (vírgulas) ficam dentro do trecho."""
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    if rms.max() <= 0:
        return []
    db = 20 * np.log10(np.maximum(rms, 1e-9) / rms.max())
    ativo = db > limiar_db
    trechos, ini = [], None
    for i, a in enumerate(ativo):
        tempo = i * 256 / sr
        if a and ini is None:
            ini = tempo
        elif not a and ini is not None:
            trechos.append([ini, tempo])
            ini = None
    if ini is not None:
        trechos.append([ini, len(y) / sr])
    juntos = []
    for a, b in trechos:
        if juntos and a - juntos[-1][1] < pausa:
            juntos[-1][1] = b
        else:
            juntos.append([a, b])
    return [(a, b) for a, b in juntos if b - a > 0.08]


def lufs(caminho: Path) -> float:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(caminho), '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True)
    valores = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    return float(valores[-1])


def montar(frases: list, tmp: Path) -> None:
    pasta = tmp / 'tomadas'
    # 1) todas as tomadas num arquivo só, com 1,2 s de silêncio entre elas
    trechos, mapa, pos = [], [], 0.0
    silencio = np.zeros(int(1.2 * TAXA), dtype=np.float32)
    for frase in frases:
        for k in range(tomadas_de(frase)):
            y, _ = librosa.load(pasta / f"{frase['id']}_{k}.mp3", sr=TAXA, mono=True)
            mapa.append({'id': frase['id'], 'k': k, 'inicio': pos, 'dur': len(y) / TAXA, 'y': y})
            trechos += [y, silencio]
            pos += len(y) / TAXA + 1.2
    junto = tmp / 'todas.wav'
    sf.write(junto, np.concatenate(trechos), TAXA)
    saida_wx = tmp / 'whisperx'
    saida_wx.mkdir(exist_ok=True)
    if not (saida_wx / 'todas.json').exists():
        subprocess.run([WHISPERX, str(junto), '--model', 'small', '--language', 'pt', '--device', 'cpu', '--compute_type', 'int8',
                        '--output_format', 'json', '--output_dir', str(saida_wx)], check=True)
    palavras = [p for s in json.load(open(saida_wx / 'todas.json'))['segments'] for p in s.get('words', []) if 'start' in p and 'end' in p]

    # 2) recorte e nota de cada tomada
    por_frase: dict = {}
    for t in mapa:
        frase = next(f for f in frases if f['id'] == t['id'])
        dentro = [p for p in palavras if t['inicio'] - 0.05 <= p['start'] <= t['inicio'] + t['dur'] + 0.05]
        esperado = norm(frase['fala']).split()
        if dentro:
            fim_idx = len(dentro) - 1
            ultima = esperado[-1]
            for j in range(len(dentro) - 1, -1, -1):  # corta depois da última palavra esperada (lixo vem depois)
                if difflib.SequenceMatcher(None, norm(dentro[j]['word']), ultima).ratio() >= 0.75:
                    fim_idx = j
                    break
            # O WhisperX não alinha números ("350" vira 0,6 s e empurra tudo para trás), então o tempo das palavras só
            # decide SE há lixo depois da última palavra esperada; ONDE cortar vem da energia do áudio.
            voz = trechos_com_voz(t['y'], TAXA)
            ini = max(0.0, (voz[0][0] if voz else dentro[0]['start'] - t['inicio']) - 0.06)
            if fim_idx < len(dentro) - 1:  # há palavras depois da última esperada: corta antes delas
                limite = dentro[fim_idx + 1]['start'] - t['inicio'] - 0.04
                fim_voz = max([b for a, b in voz if a < limite] or [limite])
                fim = min(limite, fim_voz + 0.12)
            else:
                fim = (voz[-1][1] + 0.12) if voz else t['dur']
            fim = min(t['dur'], max(fim, dentro[fim_idx]['end'] - t['inicio'] + 0.1))
            transcricao = ' '.join(p['word'] for p in dentro[: fim_idx + 1])
        else:
            ini, fim, transcricao = 0.0, t['dur'], ''
        y = t['y'][int(ini * TAXA): int(fim * TAXA)]
        # um fiapo de som curto depois de uma pausa no fim (respiro, sílaba solta) sai também
        # (trechos de até 0,08 s nem contam como voz: o fim fica sempre no último trecho de verdade + 0,12 s)
        finos = trechos_com_voz(y, TAXA, pausa=0.25)
        if len(finos) >= 2 and finos[-1][1] - finos[-1][0] < 0.22 and finos[-1][0] - finos[-2][1] >= 0.25:
            finos = finos[:-1]
        if finos:
            y = y[: int(min(len(y) / TAXA, finos[-1][1] + 0.12) * TAXA)]
        n_fade = int(0.03 * TAXA)
        if len(y) > 2 * n_fade:
            y = y.copy()
            y[-n_fade:] *= np.linspace(1, 0, n_fade)
        semelhanca = difflib.SequenceMatcher(None, norm(frase['fala']), norm(transcricao)).ratio()
        item = {'k': t['k'], 'y': y, 'transcricao': transcricao.strip(), 'semelhanca': round(semelhanca, 3)}
        if frase.get('pergunta'):
            item['subida'] = round(subida_final(y, TAXA), 2)
        if frase.get('exigir'):
            item['ouviu_exigidas'] = all(w in norm(transcricao).split() for w in frase['exigir'])
        if 'claude code' in norm(frase['fala']):
            # o transcritor escreve a pronúncia inglesa de "Claude" como "Cloud": as duas contam como entendidas
            item['entende_claude_code'] = any(x in norm(transcricao) for x in ('claude code', 'cloud code'))
        por_frase.setdefault(t['id'], []).append(item)

    # 3) escolha das tomadas
    escolhidas = {}
    for frase in frases:
        opcoes = por_frase[frase['id']]
        if frase.get('pergunta'):
            melhor = max(opcoes, key=lambda o: (o['semelhanca'] >= 0.8, o['subida'], o['semelhanca']))
        elif 'claude code' in norm(frase['fala']):
            melhor = max(opcoes, key=lambda o: (o['entende_claude_code'], o['semelhanca']))
        elif frase.get('exigir'):
            melhor = max(opcoes, key=lambda o: (o['ouviu_exigidas'], o['semelhanca']))
        else:
            melhor = max(opcoes, key=lambda o: o['semelhanca'])
        escolhidas[frase['id']] = melhor
        resumo = {k: v for k, v in melhor.items() if k != 'y'}
        print(frase['id'], 'tomada', resumo, '| outras:', [{k: v for k, v in o.items() if k not in ('y', 'transcricao')} for o in opcoes if o is not melhor], flush=True)

    # 4) um ganho só para a narração inteira chegar a -16 LUFS (preserva a dinâmica entre as frases)
    tudo = tmp / 'escolhidas.wav'
    sf.write(tudo, np.concatenate([escolhidas[f['id']]['y'] for f in frases]), TAXA)
    ganho = 10 ** ((-16.0 - lufs(tudo)) / 20)
    SAIDA.mkdir(parents=True, exist_ok=True)
    manifesto = []
    for frase in frases:
        e = escolhidas[frase['id']]
        y = np.clip(e['y'] * ganho, -0.99, 0.99)
        wav = tmp / f"{frase['id']}.wav"
        sf.write(wav, y, TAXA)
        mp3 = SAIDA / f"{frase['id']}.mp3"
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '128k', str(mp3)], check=True)
        manifesto.append({
            'id': frase['id'], 'cena': frase['cena'], 'texto': frase['texto'], 'fala': frase['fala'],
            'arquivo': f"audio/narracao/{frase['id']}.mp3", 'duracao': round(len(y) / TAXA, 3),
            'tomada': e['k'], 'semente': SEMENTES[e['k']], 'transcricao': e['transcricao'], 'semelhanca': e['semelhanca'],
            **({'subida_semitons': e['subida']} if 'subida' in e else {}),
        })
    MANIFESTO.write_text(json.dumps(manifesto, ensure_ascii=False, indent=1))
    total = sum(m['duracao'] for m in manifesto)
    print(f'narração: {len(manifesto)} frases, {total:.1f} s de fala, ganho {20 * np.log10(ganho):+.1f} dB', flush=True)


if __name__ == '__main__':
    frases = json.load(open(sys.argv[1]))
    tmp = Path(sys.argv[2])
    etapa = sys.argv[3] if len(sys.argv) > 3 else 'tudo'
    if etapa in ('gerar', 'tudo'):
        gerar(frases, tmp)
    if etapa in ('montar', 'tudo'):
        montar(frases, tmp)
