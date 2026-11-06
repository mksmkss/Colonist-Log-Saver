(() => {
  if (window.__colonistLogSaver) return;
  window.__colonistLogSaver = true;

  // 仮想スクロールなので、描画された項目を data-index をキーに蓄積する
  const entries = new Map(); // index -> { index, text, time }
  const ITEM_SEL = '[class*="scrollItemContainer"][data-index]';
  let gameKey = location.hash || location.pathname;

  function nodeToText(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent;
      else if (n.nodeName === 'IMG') {
        if (n.classList.contains('avatarImage-JNCoQelY') || /avatar/i.test(n.className)) return;
        const alt = n.getAttribute('alt');
        const dice = alt && alt.match(/^dice_(\d)$/);
        if (dice) out += `🎲${dice[1]}`;
        else if (alt && !/アバター|avatar/i.test(alt)) out += `[${alt}]`;
      } else if (n.nodeName === 'HR') out += '----------';
      else if (n.nodeType === Node.ELEMENT_NODE) out += nodeToText(n);
    });
    return out;
  }

  function messageText(item) {
    const part = item.querySelector('[class*="messagePart"]');
    const root = part || item;
    if (root.querySelector('hr')) return '----------';
    return nodeToText(root).replace(/\s+/g, ' ').trim();
  }

  function scan() {
    let added = 0;
    document.querySelectorAll(ITEM_SEL).forEach((el) => {
      if (!el.querySelector('[class*="feedMessage"]')) return;
      // チャット発言は除外（チャット欄内、または発言者ボタン/ユーザー名を持つ行）
      if (el.closest('[class*="chatContainer"]') || el.querySelector('[class*="playerDropdown"], [class*="username"]')) return;
      const idx = Number(el.getAttribute('data-index'));
      const text = messageText(el);
      if (!text) return;
      const prev = entries.get(idx);
      if (!prev || prev.text !== text) {
        entries.set(idx, { index: idx, text, time: prev ? prev.time : Date.now() });
        added++;
      }
    });
    if (added) updateUI();
  }

  // 新しいゲームに入ったら（URLのハッシュ変更）自動クリア
  function checkGameChange() {
    const key = location.hash || location.pathname;
    if (key !== gameKey) {
      gameKey = key;
      entries.clear();
      updateUI();
    }
  }

  function missingCount() {
    if (!entries.size) return 0;
    const max = Math.max(...entries.keys());
    return max + 1 - entries.size;
  }

  // ログ欄（チャット以外）のスクロール要素を探す
  function findLogScroller() {
    const cands = [...document.querySelectorAll('[class*="virtualContainer"]')].filter(
      (c) => !c.closest('[class*="chatContainer"]') && c.querySelector('[class*="feedMessage"]')
    );
    for (const c of cands) {
      for (let el = c; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
      }
    }
    return null;
  }

  let filling = false;
  async function fillAll() {
    if (filling) return;
    const sc = findLogScroller();
    if (!sc) return;
    filling = true;
    const saved = sc.scrollTop;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      sc.scrollTop = 0;
      await wait(150);
      scan();
      const step = Math.max(50, sc.clientHeight * 0.6);
      while (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2) {
        const before = sc.scrollTop;
        sc.scrollTop = before + step;
        await wait(120);
        scan();
        if (sc.scrollTop === before) break;
      }
      scan();
    } finally {
      sc.scrollTop = saved;
      filling = false;
      updateUI();
    }
  }

  function sorted() {
    return [...entries.values()].sort((a, b) => a.index - b.index);
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const id = (gameKey.replace(/[^\w-]/g, '') || 'game').slice(0, 30);
    return `colonist-${id}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // ---- UI ----
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#1f2937;color:#fff;' +
    'font:12px/1.4 sans-serif;padding:8px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.4);' +
    'display:flex;gap:6px;align-items:center;opacity:.92';
  const label = document.createElement('span');
  const mk = (t, fn) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.style.cssText = 'cursor:pointer;border:0;border-radius:4px;padding:3px 7px;background:#4b5563;color:#fff;font-size:12px';
    b.onclick = fn;
    return b;
  };
  box.append(
    label,
    mk('TXT', () => download(stamp() + '.txt', sorted().map((e) => e.text).join('\n'), 'text/plain')),
    mk('JSON', () => download(stamp() + '.json', JSON.stringify(sorted(), null, 2), 'application/json')),
    mk('コピー', () => navigator.clipboard.writeText(sorted().map((e) => e.text).join('\n'))),
    mk('全取得', () => fillAll()),
    mk('出目', () => { statsOpen = !statsOpen; updateUI(); }),
    mk('クリア', () => { entries.clear(); updateUI(); })
  );

  // ---- 出目集計 ----
  let statsOpen = false;
  const stats = document.createElement('div');
  stats.style.cssText =
    'position:fixed;right:12px;bottom:56px;z-index:2147483647;background:#1f2937;color:#fff;' +
    'font:12px/1.5 monospace;padding:8px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.4);' +
    'opacity:.95;display:none;white-space:pre';

  function rolls() {
    const out = [];
    sorted().forEach((e) => {
      const m = e.text.match(/^(.*?)\s*巻き\s*🎲(\d)\s*🎲(\d)/);
      if (m) out.push({ who: m[1], sum: Number(m[2]) + Number(m[3]) });
    });
    return out;
  }

  function renderStats() {
    const r = rolls();
    const cnt = {};
    for (let i = 2; i <= 12; i++) cnt[i] = 0;
    r.forEach((x) => cnt[x.sum]++);
    const max = Math.max(1, ...Object.values(cnt));
    let t = `出目 ${r.length}回` + (missingCount() > 0 ? `  ⚠欠け${missingCount()}件あり→「全取得」` : '') + '\n';
    for (let i = 2; i <= 12; i++) {
      const pct = r.length ? Math.round((cnt[i] / r.length) * 100) : 0;
      t += `${String(i).padStart(2)} ${'█'.repeat(Math.round((cnt[i] / max) * 16)).padEnd(16)} ${cnt[i]} (${pct}%)\n`;
    }
    t += `直近: ${r.slice(-10).map((x) => x.sum).join(', ') || '-'}`;
    stats.textContent = t;
  }

  function updateUI() {
    const miss = missingCount();
    label.textContent = `ログ ${entries.size}件` + (filling ? '（取得中…）' : miss > 0 ? `（欠け${miss}）` : '');
    stats.style.display = statsOpen ? 'block' : 'none';
    if (statsOpen) renderStats();
  }
  updateUI();
  document.documentElement.append(box, stats);

  let timer = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; checkGameChange(); scan(); }, 150);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', checkGameChange);
  scan();
  // 読み込み後と、ゲーム切替後に自動で最初までスクロールして全部拾う
  setTimeout(fillAll, 2500);
  window.addEventListener('hashchange', () => setTimeout(fillAll, 2500));
})();
