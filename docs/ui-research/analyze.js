// Crawl + screenshot + token extraction for a marketing site.
// usage: node analyze.js <url> <slug> [maxSections]
const { chromium } = require('/tmp/pw/node_modules/playwright');
const fs = require('node:fs');

const [, , url, slug, maxSectionsArg] = process.argv;
const OUT = `/home/user/research/${slug}`;
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3500);
  // Drive lazy content: scroll through the page slowly.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 260));
    }
    window.scrollTo(0, 0);
  });
  await sleep(2000);

  fs.writeFileSync(`${OUT}/page.html`, await page.content());
  await page.screenshot({ path: `${OUT}/desktop-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/desktop-fold.png`, fullPage: false });

  // ---- token + structure extraction -------------------------------------
  const data = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const pick = (el, props) => Object.fromEntries(props.map(p => [p, cs(el).getPropertyValue(p)]));

    const body = document.body;
    const root = document.documentElement;
    const cssVars = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule.style && rule.selectorText && /:root|html/.test(rule.selectorText)) {
          for (const name of Array.from(rule.style)) {
            if (name.startsWith('--')) cssVars[name] = rule.style.getPropertyValue(name).trim();
          }
        }
      }
    }

    // sections
    const sectionSel = 'section, header, footer, main > div, [class*="section"], [class*="Section"]';
    const sections = Array.from(document.querySelectorAll(sectionSel))
      .filter(el => el.getBoundingClientRect().height > 120)
      .slice(0, 60)
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const heading = el.querySelector('h1,h2,h3');
        const s = cs(el);
        return {
          i,
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 90),
          h: Math.round(el.scrollHeight),
          top: Math.round(r.top + window.scrollY),
          bg: s.backgroundColor,
          bgImage: s.backgroundImage.slice(0, 120),
          padTop: s.paddingTop, padBottom: s.paddingBottom,
          heading: heading ? heading.textContent.trim().slice(0, 90) : null,
          headingTag: heading ? heading.tagName : null,
          headingSize: heading ? cs(heading).fontSize : null,
          headingWeight: heading ? cs(heading).fontWeight : null,
          headingColor: heading ? cs(heading).color : null,
          headingLetterSpacing: heading ? cs(heading).letterSpacing : null,
          buttons: el.querySelectorAll('a[class*="btn"],button,[class*="utton"]').length,
          images: el.querySelectorAll('img').length,
          videos: el.querySelectorAll('video').length,
        };
      });

    // buttons / CTAs
    const buttons = Array.from(document.querySelectorAll('a, button'))
      .filter(el => {
        const s = cs(el); const r = el.getBoundingClientRect();
        return r.height > 26 && r.width > 60 && r.top < 3000;
      })
      .slice(0, 14)
      .map(el => ({
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 46),
        ...pick(el, ['background-color', 'background-image', 'color', 'border-radius', 'padding', 'font-size', 'font-weight', 'border', 'box-shadow', 'height']),
      }));

    // headlines
    const headlines = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 24).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 110),
      ...pick(el, ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'max-width', 'text-align']),
    }));

    // fonts actually loading
    const fontFaces = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule.constructor.name === 'CSSFontFaceRule') fontFaces.push(rule.style.fontFamily + ' ' + rule.style.fontWeight);
      }
    }

    // colours used most (backgrounds of visible boxes)
    const colourCount = {};
    Array.from(document.querySelectorAll('*')).slice(0, 4000).forEach(el => {
      const s = cs(el);
      const bg = s.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)') colourCount[bg] = (colourCount[bg] || 0) + 1;
    });
    const topColours = Object.entries(colourCount).sort((a, b) => b[1] - a[1]).slice(0, 18);

    const radii = {};
    Array.from(document.querySelectorAll('*')).slice(0, 3000).forEach(el => {
      const r = cs(el).borderRadius;
      if (r && r !== '0px') radii[r] = (radii[r] || 0) + 1;
    });

    return {
      title: document.title,
      metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
      cssVars,
      bodyStyle: pick(body, ['font-family', 'font-size', 'line-height', 'color', 'background-color', 'letter-spacing']),
      htmlLang: root.lang, dir: cs(body).direction,
      fontFaces: Array.from(new Set(fontFaces)).slice(0, 20),
      fontsUsed: Array.from(new Set(Array.from(document.querySelectorAll('h1,h2,p,a,button')).slice(0, 200).map(el => cs(el).fontFamily))).slice(0, 12),
      sections,
      buttons,
      headlines,
      topColours,
      radii: Object.entries(radii).sort((a, b) => b[1] - a[1]).slice(0, 10),
      counts: {
        a: document.querySelectorAll('a').length,
        button: document.querySelectorAll('button').length,
        img: document.querySelectorAll('img').length,
        svg: document.querySelectorAll('svg').length,
        video: document.querySelectorAll('video').length,
        h1: document.querySelectorAll('h1').length,
        h2: document.querySelectorAll('h2').length,
        form: document.querySelectorAll('form').length,
        input: document.querySelectorAll('input').length,
      },
      stickyHeaders: Array.from(document.querySelectorAll('header,nav,[class*="header"],[class*="nav"]')).slice(0, 6).map(el => ({ cls: String(el.className).slice(0, 60), pos: cs(el).position, top: cs(el).top, h: Math.round(el.getBoundingClientRect().height), backdrop: cs(el).backdropFilter, bg: cs(el).backgroundColor })),
      scrollHeight: document.body.scrollHeight,
    };
  });
  data.consoleErrors = consoleErrors;
  fs.writeFileSync(`${OUT}/tokens.json`, JSON.stringify(data, null, 2));

  // ---- section screenshots -------------------------------------------------
  const maxSections = Number(maxSectionsArg || 14);
  const sectionBoxes = await page.evaluate((limit) => {
    const sel = 'section, header, footer, [class*="section"], [class*="Section"]';
    return Array.from(document.querySelectorAll(sel))
      .map((el, i) => ({ i, h: el.scrollHeight, top: el.getBoundingClientRect().top + window.scrollY }))
      .filter(b => b.h > 200)
      .slice(0, limit);
  }, maxSections);

  let n = 0;
  for (const box of sectionBoxes) {
    try {
      await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 40)), box.top);
      await sleep(700);
      await page.screenshot({ path: `${OUT}/section-${String(n).padStart(2, '0')}.png`, fullPage: false });
      n += 1;
    } catch { /* ignore */ }
  }

  // ---- mobile -------------------------------------------------------------
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);
  await mobile.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200)); }
    window.scrollTo(0, 0);
  });
  await sleep(1500);
  await mobile.screenshot({ path: `${OUT}/mobile-fold.png` });
  const menuButton = await mobile.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button,[role="button"],[class*="menu"],[class*="burger"]')).find(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 16 && r.width < 70 && r.top < 160 && s.visibility !== 'hidden';
    });
    if (!b) return null;
    b.setAttribute('data-probe', 'menu');
    return true;
  });
  if (menuButton) {
    try {
      await mobile.click('[data-probe="menu"]');
      await sleep(1200);
      await mobile.screenshot({ path: `${OUT}/mobile-menu.png` });
    } catch { /* ignore */ }
  }

  console.log(`done ${slug}: ${sectionBoxes.length} sections, ${data.sections.length} structure rows, ${data.headlines.length} headlines`);
  await browser.close();
})();
