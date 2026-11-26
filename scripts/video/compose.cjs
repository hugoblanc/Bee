// Compose chaque plan en image 1080x1920 (légende + capture dans un cadre de téléphone).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const shots = JSON.parse(fs.readFileSync(path.join(__dirname, 'shots.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
const CSS = `
* { margin: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; font-family: Inter, system-ui, sans-serif; overflow: hidden; }
.shot { background: linear-gradient(180deg, #fff7e0 0%, #fde9b8 100%); display: flex; flex-direction: column; align-items: center; height: 100%; }
.cap { height: 400px; width: 100%; padding: 60px 70px 0; text-align: center; }
.cap h1 { font-size: 62px; font-weight: 800; color: #1c1917; letter-spacing: -0.5px; line-height: 1.1; }
.cap p { margin-top: 22px; font-size: 40px; line-height: 1.3; color: #57534e; font-weight: 500; }
.phone { width: 700px; height: 1456px; border-radius: 64px; background: #111; padding: 18px; box-shadow: 0 30px 60px rgba(0,0,0,.35); }
.phone img { width: 100%; height: 100%; border-radius: 48px; display: block; object-fit: cover; object-position: top; }
.card { background: radial-gradient(circle at 50% 30%, #f59e0b 0%, #b45309 70%, #78350f 100%); color: white; height: 100%;
  display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 90px; }
.card .logo { font-size: 160px; margin-bottom: 30px; }
.card h1 { font-size: 92px; font-weight: 800; letter-spacing: -1px; line-height: 1.05; }
.card p { margin-top: 40px; font-size: 50px; line-height: 1.35; font-weight: 500; opacity: .95; }
`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const list = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    let body;
    if (s.card) {
      const logo = i === 0 || i === shots.length - 1 ? '<div class="logo">🐝</div>' : '';
      body = `<div class="card">${logo}<h1>${esc(s.title)}</h1><p>${esc(s.sub)}</p></div>`;
    } else {
      const img = 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64');
      body = `<div class="shot"><div class="cap"><h1>${esc(s.title)}</h1><p>${esc(s.sub)}</p></div><div class="phone"><img src="${img}"></div></div>`;
    }
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
    await page.waitForTimeout(50);
    const out = path.join(__dirname, 'composed', `f${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: out });
    list.push({ out, dur: s.dur });
  }
  // Liste pour ffmpeg (concat) : la dernière image est répétée sans durée, comme l'exige le format.
  const lines = list.flatMap((f) => [`file '${f.out}'`, `duration ${f.dur}`]);
  lines.push(`file '${list[list.length - 1].out}'`);
  fs.writeFileSync(path.join(__dirname, 'concat.txt'), lines.join('\n') + '\n');
  await browser.close();
  console.log('composed', list.length);
})();
