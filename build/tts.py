import json, sys, soundfile as sf
from kokoro_onnx import Kokoro
voice = sys.argv[1]
k = Kokoro('models/kokoro-v1.0.onnx', 'models/voices-v1.0.bin')
cues = json.load(open('cues.json'))
lens = []
for i, c in enumerate(cues):
    audio, sr = k.create(c['say'], voice=voice, speed=1.0, lang='en-us')
    sf.write(f'vo/{i:02d}.wav', audio, sr)
    lens.append(round(len(audio) / sr, 3))
    print(i, lens[-1], c['say'][:60], flush=True)
json.dump({'sr': sr, 'lens': lens}, open('vo/lens.json', 'w'))
