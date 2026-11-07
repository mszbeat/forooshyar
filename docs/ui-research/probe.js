// Interaction probes: sticky header, mega menu, container metrics, focus states.
const { chromium } = require('/tmp/pw/node_modules/playwright');
const fs = require('node:fs');

const [, , url, slug] = process.argv;
const OUT = `/home/user/research/${slug}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);

  const report = {};

  // ---- container / grid metrics -------------------------------------------
  report.layout = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const candidates = Array.from(document.querySelectorAll('div,section,main,header'))
      .map(el => {
        const r = el.getBoundingClientRect();
        const s = cs(el);
        return { cls: String(el.className).slice(0, 70), w: Math.round(r.width), left: Math.round(r.left), maxW: s.maxWidth, pad: s.paddingLeft + '/' + s.paddingRight, ml: s.marginLeft };
      })
      .filter(x => x.w > 600 && x.w < 1400 && x.left > 20)
      .slice(0, 12);
    const bodyCS = cs(document.body);
    return { candidates, bodyMaxWidth: bodyCS.maxWidth, bodyPadding: bodyCS.padding };
  });

  // ---- sticky header behaviour --------------------------------------------
  const headerSel = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('header, nav, [class*="navbar"], [class*="nav_"]'))
      .find(el => el.getBoundingClientRect().height > 40 && el.getBoundingClientRect().top < 80);
    if (!h) return null;
    h.setAttribute('data-probe', 'header');
    const s = getComputedStyle(h);
    return { h: Math.round(h.getBoundingClientRect().height), position: s.position, bg: s.backgroundColor, backdrop: s.backdropFilter, border: s.borderBottom, transition: s.transition };
  });
  report.headerAtTop = headerSel;
  await page.screenshot({ path: `${OUT}/header-top.png`, clip: { x: 0, y: 0, width: 1440, height: 130 } });

  await page.evaluate(() => window.scrollTo(0, 600));
  await sleep(1200);
  report.headerAfterScroll = await page.evaluate(() => {
    const h = document.querySelector('[data-probe="header"]');
    if (!h) return null;
    const s = getComputedStyle(h);
    return { h: Math.round(h.getBoundingClientRect().height), position: s.position, bg: s.backgroundColor, backdrop: s.backdropFilter, border: s.borderBottom, boxShadow: s.boxShadow, top: Math.round(h.getBoundingClientRect().top) };
  });
  await page.screenshot({ path: `${OUT}/header-scrolled.png`, clip: { x: 0, y: 0, width: 1440, height: 130 } });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  // ---- mega menu -----------------------------------------------------------
  const navTrigger = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const t = candidates.find(el => {
      const txt = (el.textContent || '').trim();
      return /^(Products|Services|Solutions)$/.test(txt) && el.getBoundingClientRect().top < 100;
    });
    if (!t) return null;
    t.setAttribute('data-probe', 'nav');
    return t.textContent.trim();
  });
  if (navTrigger) {
    await page.hover('[data-probe="nav"]');
    await sleep(1400);
    await page.screenshot({ path: `${OUT}/mega-menu.png` });
    report.megaMenu = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('[class*="dropdown"],[class*="menu"],[class*="panel"],[role="menu"]'))
        .filter(el => { const r = el.getBoundingClientRect(); return r.height > 120 && r.width > 300 && getComputedStyle(el).visibility !== 'hidden'; })
        .slice(0, 3)
        .map(el => {
          const s = getComputedStyle(el);
          const links = el.querySelectorAll('a').length;
          return { cls: String(el.className).slice(0, 60), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), bg: s.backgroundColor, radius: s.borderRadius, shadow: s.boxShadow.slice(0, 70), links, cols: s.columnCount || s.gridTemplateColumns };
        });
      return panels;
    });
    // hover a link inside the panel to capture hover state colours
    report.navLinkHover = await page.evaluate(async () => {
      const link = Array.from(document.querySelectorAll('[role="menu"] a, [class*="dropdown"] a, [class*="menu"] a'))
        .find(el => el.getBoundingClientRect().height > 20 && el.getBoundingClientRect().width > 100);
      if (!link) return null;
      const before = getComputedStyle(link).color;
      link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return { before, after: getComputedStyle(link).color, bg: getComputedStyle(link).backgroundColor, radius: getComputedStyle(link).borderRadius };
    });
    await page.keyboard.press('Escape');
  }

  // ---- typography scale of paragraphs -------------------------------------
  report.paragraphs = await page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('p,li')).slice(0, 400)) {
      const r = el.getBoundingClientRect();
      if (r.height < 12) continue;
      const s = getComputedStyle(el);
      out.push(`${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.color}`);
    }
    const counts = {};
    out.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  });

  // ---- focus ring ---------------------------------------------------------
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  report.focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), outline: s.outline, boxShadow: s.boxShadow };
  });

  // ---- card surfaces ------------------------------------------------------
  report.cards = await page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('div,article,a')).slice(0, 2500)) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 220 || r.height < 100 || r.height > 700) continue;
      if (s.boxShadow === 'none' && s.borderRadius === '0px') continue;
      out.push({ radius: s.borderRadius, shadow: s.boxShadow.slice(0, 60), border: s.border, bg: s.backgroundColor });
      if (out.length > 40) break;
    }
    const counts = {};
    out.forEach(o => { const k = `${o.radius} | ${o.shadow} | ${o.border}`; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  });

  fs.writeFileSync(`${OUT}/interactions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 2600));
  await browser.close();
})();
