import json, numpy as np, soundfile as sf, subprocess
cues=json.load(open('cues.json')); meta=json.load(open('vo/lens.json')); sr=meta['sr']
dur=float(open('dur.txt').read())
track=np.zeros(int(dur*sr)+sr, dtype=np.float32)
for i,c in enumerate(cues):
    a,_=sf.read(f'vo/{i:02d}.wav', dtype='float32')
    st=int(c['t']*sr); track[st:st+len(a)]+=a
    if i+1<len(cues): assert c['t']+len(a)/sr <= cues[i+1]['t'], ('overlap', i)
track=track[:int(dur*sr)]
peak=np.abs(track).max(); track*=0.89/peak
sf.write('narration.wav', track, sr)
print('ok', round(dur,2), 'peak', peak)
