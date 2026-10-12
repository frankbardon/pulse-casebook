const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const p = await b.newPage({viewport:{width:1300,height:900}});
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('file://'+require('path').resolve(process.argv[2])); await p.waitForTimeout(1500);
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>window.__film.capture(1280));
  const times = process.argv.slice(3).map(Number);
  for (const t of times) {
    const d = await p.evaluate(t=>{window.__film.render(t); return window.__film.toJPEG(0.9);}, t);
    fs.writeFileSync(`still_${String(t).replace('.','_')}.jpg`, Buffer.from(d.split(',')[1],'base64'));
  }
  console.log('errors:', errs);
  await b.close();
})();
