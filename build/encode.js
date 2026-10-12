const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [,, page, out, px, fps] = process.argv;
  const b = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const p = await b.newPage({viewport:{width:1300,height:900}});
  await p.goto('file://'+require('path').resolve(page)); await p.waitForTimeout(1500); await p.evaluate(()=>document.fonts.ready);
  const dur = await p.evaluate(px=>{window.__film.capture(+px); return window.__film.DUR;}, px);
  const ff = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate',fps,'-c:v','mjpeg','-i','-','-i','narration.wav','-map','0:v','-map','1:a','-c:a','aac','-b:a','160k','-ar','48000','-shortest','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',out], {stdio:['pipe','inherit','inherit']});
  const n = Math.round(dur*fps);
  for (let i=0;i<n;i++){
    const d = await p.evaluate(t=>{window.__film.render(t); return window.__film.toJPEG(0.93);}, i/fps);
    const buf = Buffer.from(d.split(',')[1],'base64');
    if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
    if(i%300===0) console.log('frame',i,'/',n);
  }
  ff.stdin.end(); await new Promise(r=>ff.on('close',r)); await b.close(); console.log('done');
})();
