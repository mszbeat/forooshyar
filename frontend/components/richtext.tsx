'use client';

import type { ReactNode } from 'react';

/**
 * نمایش پیام‌های بات در پنل.
 *
 * بات پیام‌ها را با `parseMode: 'HTML'` تلگرام می‌فرستد (`<b>`، `<i>`، `<code>`،
 * `<pre>`). اگر همان متن خام در پنل نشان داده شود، کاربر تگ‌ها را می‌بیند —
 * دقیقاً همان چیزی که در تست پاسخ دیده شد. اینجا فقط تگ‌های مجاز به عناصر React
 * تبدیل می‌شوند و بقیه‌ی متن **به‌صورت متن** می‌ماند؛ پس HTML تزریقی اجرا نمی‌شود.
 */

const TAGS = ['b', 'strong', 'i', 'em', 'code', 'pre'] as const;
type Tag = typeof TAGS[number];

const OPEN = /^<(b|strong|i|em|code|pre)>/;
const CLOSE = /^<\/(b|strong|i|em|code|pre)>/;

function normalize(tag: string): Tag {
  if (tag === 'strong') return 'b';
  if (tag === 'em') return 'i';
  return tag as Tag;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    const close = CLOSE.exec(rest);
    if (close) { rest = rest.slice(close[0].length); continue; }

    const open = OPEN.exec(rest);
    if (open) {
      const tag = normalize(open[1]);
      rest = rest.slice(open[0].length);
      const endIndex = rest.search(new RegExp(`</${open[1]}>`));
      const inner = endIndex === -1 ? rest : rest.slice(0, endIndex);
      rest = endIndex === -1 ? '' : rest.slice(endIndex + open[1].length + 3);

      const children = renderInline(inner, `${keyPrefix}-${index}`);
      const key = `${keyPrefix}-${index}`;
      index += 1;
      if (tag === 'b') nodes.push(<b key={key}>{children}</b>);
      else if (tag === 'i') nodes.push(<i key={key} style={{ opacity: 0.85 }}>{children}</i>);
      else if (tag === 'code') nodes.push(<code key={key} className="rt-code">{children}</code>);
      else nodes.push(<pre key={key} className="rt-pre">{children}</pre>);
      continue;
    }

    const nextTag = rest.search(/<\/?(?:b|strong|i|em|code|pre)>/);
    if (nextTag === -1) {
      nodes.push(rest);
      break;
    }
    nodes.push(rest.slice(0, nextTag));
    rest = rest.slice(nextTag);
  }

  return nodes;
}

export function RichText({ text }: { text: string }) {
  return <div className="rt">{renderInline(text, 'rt')}</div>;
}
