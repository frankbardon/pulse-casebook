import json, sys, soundfile as sf
from kokoro_onnx import Kokoro
voice = sys.argv[1]
import os
md = os.environ.get('KOKORO_DIR', 'models')
k = Kokoro(os.path.join(md, 'kokoro-v1.0.onnx'), os.path.join(md, 'voices-v1.0.bin'))
cues = json.load(open('cues.json'))
lens = []
for i, c in enumerate(cues):
    audio, sr = k.create(c['say'], voice=voice, speed=1.0, lang='en-us')
    sf.write(f'vo/{i:02d}.wav', audio, sr)
    lens.append(round(len(audio) / sr, 3))
    print(i, lens[-1], c['say'][:60], flush=True)
json.dump({'sr': sr, 'lens': lens}, open('vo/lens.json', 'w'))
