const NS = 'http://www.w3.org/2000/svg', PT = 25.4 / 72;
const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const ctx = document.createElement('canvas').getContext('2d');
const width = (t, mm) => { ctx.font = `700 100px ${FONT}`; return ctx.measureText(t).width / 100 * mm; };
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

export const people = cfg => Object.entries(cfg?.people || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.order - b.order);
export const clean = t => t.replace(/\s+/g, ' ').trim();
export const len = t => [...t].length;

const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);

// 제출 순서와 상관없이 작성자마다 칸이 고정되도록, 명단 전체를 섞는다.
export function arrange(writerIds, slotCount, seed, to) {
  let a = seed ?? hash(to);
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const s = [...Array(slotCount).keys()];
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return Object.fromEntries([...writerIds].sort().map((id, i) => [id, s[i]]));
}

function wrap(msg, n, fs, chord, words) {
  const tok = words ? msg.split(' ') : [...msg], lines = [];
  for (let i = 0; i < n; i++) {
    let l = '';
    while (tok.length) {
      const next = words ? (l ? l + ' ' : '') + tok[0] : (l + tok[0]).trimStart();
      if (width(next, fs) > chord(i)) break;
      l = next;
      tok.shift();
    }
    if (!l) return null;
    lines.push(l);
  }
  return tok.length ? null : lines;
}

function attempt(msg, sig, s, words, minPt) {
  for (let pt = 13; pt >= minPt; pt -= .25) {
    const fs = pt * PT, lh = fs * 1.28;
    for (let n = 1; n <= 14; n++) {
      const top = -(n + 1) * lh / 2;
      if (-top > s.ry) break;
      const chord = i => {
        const y = Math.max(Math.abs(top + i * lh), Math.abs(top + (i + 1) * lh));
        return y >= s.ry ? 0 : 2 * s.rx * Math.sqrt(1 - (y / s.ry) ** 2);
      };
      if (width(sig, fs * .9) > chord(n)) continue;
      const lines = wrap(msg, n, fs, chord, words);
      if (lines) return { pt, fs, lh, top, lines };
    }
  }
  return null;
}

// 단어 단위로 먼저 시도하고, 9pt로도 안 들어가면 글자 단위로 나눈다.
export const fit = (m, sig, s) => attempt(m, sig, s, true, 9) || attempt(m, sig, s, false, 6) || attempt(m, sig, s, true, 6);

export function renderPaper(L, cfg, to, messages, seed) {
  const P = people(cfg), name = P.find(p => p.id === to).name, writers = P.filter(p => p.id !== to), problems = [];
  const svg = el('svg', { viewBox: `0 0 ${L.page.width} ${L.page.height}`, class: 'paper', role: 'img', 'aria-label': `${name} 롤링페이퍼` });
  const text = (t, x, y, size, fill) => {
    const e = el('text', { x, y, 'font-size': size, fill, 'text-anchor': 'middle', 'font-weight': 700, 'font-family': FONT });
    e.textContent = t;
    svg.append(e);
  };
  svg.append(el('image', { href: L.background, width: L.page.width, height: L.page.height, preserveAspectRatio: 'none' }));
  if (L.cover) { const c = L.cover; svg.append(el('rect', { x: c.x, y: c.y, width: c.width, height: c.height, fill: c.color })); }
  const title = L.title.template.replace('{name}', () => name), ts = Math.min(17, 17 * L.title.maxWidth / width(title, 17));
  text(title, L.title.x, L.title.y + ts * .35, ts, L.title.color);
  const pos = arrange(writers.map(w => w.id), L.slots.length, seed, to);
  for (const m of messages.filter(m => m.to === to && !m.hidden)) {
    const w = writers.find(p => p.id === m.from), s = w && L.slots[pos[w.id]];
    if (!s) { problems.push(`${name}: 명단에 없는 사람의 문구가 빠졌어요.`); continue; }
    const sig = L.signature.replace('{name}', () => w.name), r = fit(clean(m.text), sig, s);
    if (!r) { problems.push(`${name}: ${w.name}의 문구가 칸에 들어가지 않아요.`); continue; }
    r.lines.forEach((l, k) => text(l, s.x, s.y + r.top + (k + .8) * r.lh, r.fs, L.textColor));
    text(sig, s.x, s.y + r.top + (r.lines.length + .8) * r.lh, r.fs * .9, L.textColor);
  }
  return { svg, problems };
}
