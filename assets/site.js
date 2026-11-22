/* PINKING ARCHIVE — 공용 동작. 외부 라이브러리 없음.
   움직임: 로딩 카운터 · 글자 흐림 등장 · 주황 점 낙하 · 재단선 틀 + 타임코드/장면/진행 막대 · 십자선 커서 ·
   자석 단추 · 글자 뒤섞기 · 스크롤 속도 글자 줄(모션 블러) · 폭 조절 글꼴 · FIG 도형 애니메이션 · 카드 기울기 ·
   3D 진열대 · 페이지 넘김 막 · 숫자 세기. prefers-reduced-motion 이면 거의 다 끈다. */
(() => {
  const S = window.SITE || {};
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || S.motion === false;
  const fine = matchMedia("(pointer:fine)").matches;
  const page = document.body.dataset.page || "home";
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  if (reduce) document.body.classList.add("no-motion");

  /* ── 설정 칸 적용 ── */
  const R = document.documentElement.style;
  const C = S.colors || {}, F = S.fonts || {};
  if (C.paper) R.setProperty("--paper", C.paper);
  if (C.ink) R.setProperty("--ink", C.ink);
  if (C.point) R.setProperty("--point", C.point);
  if (F.displayKo) R.setProperty("--f-ko", F.displayKo);
  if (F.displayEn) R.setProperty("--f-en", F.displayEn);
  if (F.serif) R.setProperty("--f-serif", F.serif);
  if (F.mono) R.setProperty("--f-mono", F.mono);
  if (F.body) R.setProperty("--f-body", F.body);
  if (S.space) R.setProperty("--sp", S.space);
  const menu = S.menu || [];

  /* ── 틀·막대·바닥 만들기 ── */
  document.body.insertAdjacentHTML("afterbegin",
    `<a class="skip" href="#main">본문으로 건너뛰기</a>
     <div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i>
       <div class="hud"><span class="tc">00:00.00</span><span class="sc">SC 01</span><span class="bar"><b></b></span><span class="dur">15.00 SEC</span></div></div>
     <header class="topbar"><div class="row">
       <a class="brand" href="index.html"><span>${esc(S.name || "")}</span><small>${esc(S.nameKo || "")}</small></a>
       <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav">MENU</button>
       <nav id="nav" aria-label="주 메뉴">${menu.map((m, i) => `<a href="${esc(m.href)}"${page === m.id ? ' aria-current="page"' : ""} data-scr><span>${pad(i + 1)}</span>${esc(m.ko)}</a>`).join("")}</nav>
     </div></header>
     <div class="wipe ${reduce ? "gone" : ""}" aria-hidden="true"></div>`);
  document.body.insertAdjacentHTML("beforeend",
    `<footer class="foot on-ink-sec" data-scene>
       <div class="metaline"><span>${esc(S.meta || "")}</span><span>END ROLL</span></div>
       <p class="big-ko">${esc(S.tagline || "")}</p>
       <div class="cols">
         <div>${menu.map(m => `<a href="${esc(m.href)}">${esc(m.en)} — ${esc(m.ko)}</a>`).join("<br>")}</div>
         <div>${S.links?.github ? `<a href="${esc(S.links.github)}" target="_blank" rel="noopener">GITHUB ↗</a><br>` : ""}${S.links?.email ? `<a href="mailto:${esc(S.links.email)}">MAIL ↗</a><br>` : ""}<span class="mute">© ${new Date().getFullYear()} ${esc(S.name || "")} · MADE WITH CLAUDE</span></div>
       </div></footer>`);

  /* 메뉴 단추(좁은 화면) */
  const mb = $(".menu-btn");
  mb.addEventListener("click", () => { const o = document.body.classList.toggle("menu-open"); mb.setAttribute("aria-expanded", o); mb.textContent = o ? "CLOSE" : "MENU"; });
  addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) mb.click(); });

  /* ── 페이지 넘김 막 ── */
  const wipe = $(".wipe");
  if (!reduce) requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.add("gone")));
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href]");
    if (!a || reduce || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.hash && u.pathname === location.pathname) return;
    e.preventDefault();
    wipe.classList.remove("gone"); wipe.classList.add("from-bottom");
    requestAnimationFrame(() => { wipe.classList.remove("from-bottom"); wipe.classList.add("cover"); });
    setTimeout(() => { location.href = u.href; }, 620);
  });
  addEventListener("pageshow", e => { if (e.persisted) { wipe.className = "wipe gone"; } });

  /* ── 첫 방문 로딩: 000 → 100 카운터 + 흐리게 지나가는 큰 낱말 ── */
  function loader(done) {
    if (reduce || page !== "home" || sessionStorage.getItem("pk-loaded")) return done();
    sessionStorage.setItem("pk-loaded", "1");
    document.body.insertAdjacentHTML("beforeend", `<div class="loader" aria-hidden="true"><div class="word">MOTION · ARCHIVE · MOTION ·</div><div class="num">000</div><div class="lb"><span>${esc(S.meta || "")}</span><span class="pct">LOADING</span></div></div>`);
    const L = $(".loader"), n = $(".num", L), w = $(".word", L);
    const t0 = performance.now(), dur = 1300;
    w.animate([{ transform: "translateX(100vw)", opacity: 1, filter: "blur(14px)" }, { transform: "translateX(-140%)", opacity: 1, filter: "blur(10px)" }], { duration: 1500, easing: "cubic-bezier(.83,0,.17,1)" });
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      n.textContent = pad(Math.round(e * 100), 3);
      if (p < 1) requestAnimationFrame(tick); else { L.classList.add("done"); setTimeout(() => L.remove(), 1000); done(); }
    };
    requestAnimationFrame(tick);
  }

  /* ── 나타나기 ── */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  const watch = root => $$("[data-reveal]", root).forEach((el, i) => { if (reduce) el.classList.add("in"); else { el.style.transitionDelay = (el.dataset.delay || (i % 4) * 80) + "ms"; io.observe(el); } });

  /* ── 위 메타·타임코드·장면 번호·진행 막대 ── */
  const tc = $(".hud .tc"), sc = $(".hud .sc"), bar = $(".hud .bar b");
  let scenes = [];
  function hud() {
    const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? scrollY / max : 0, s = p * 15;
    tc.textContent = `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}.${pad(Math.floor((s % 1) * 100))}`;
    bar.style.width = (p * 100).toFixed(2) + "%";
    let cur = 0; scenes.forEach((el, i) => { if (el.getBoundingClientRect().top < innerHeight * .5) cur = i; });
    sc.textContent = `SC ${pad(cur + 1)} / ${pad(scenes.length || 1)}`;
    // 막대 아래가 먹색 구역이면 막대도 먹색판
    const probe = document.elementsFromPoint(innerWidth / 2, 70).find(el => el.closest && el.closest(".sec,.hero,.foot,.kinetic"));
    document.body.classList.toggle("on-ink", !!probe?.closest(".ink,.on-ink-sec,.foot,.kinetic"));
  }

  /* ── 십자선 커서 + 좌표 ── */
  if (fine && !reduce) {
    document.body.classList.add("cursor-on");
    document.body.insertAdjacentHTML("beforeend", `<div class="cursor" aria-hidden="true"><span class="h"></span><span class="v"></span><span class="xy"></span></div>`);
    const cu = $(".cursor"), xy = $(".xy", cu);
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; cu.classList.toggle("hot", !!e.target.closest("a,button,.chip,.fig,.card,.prod,input")); });
    const loop = () => { cx += (x - cx) * .35; cy += (y - cy) * .35; cu.style.transform = `translate(${cx}px,${cy}px)`; xy.textContent = `X ${pad(Math.round(cx), 4)} · Y ${pad(Math.round(cy), 4)}`; requestAnimationFrame(loop); };
    loop();
  }

  /* ── 자석 단추 ── */
  function magnet(root = document) {
    if (!fine || reduce) return;
    $$(".pill, .chip", root).forEach(b => {
      b.addEventListener("pointermove", e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px,${(e.clientY - r.top - r.height / 2) * .35}px)`; });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });
  }

  /* ── 글자 뒤섞기(모노 라벨) ── */
  const GLY = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/·—";
  function scramble(el) {
    if (reduce || el._busy) return;
    const fin = el.dataset.txt || (el.dataset.txt = el.textContent); el._busy = true; let f = 0;
    const id = setInterval(() => {
      el.textContent = [...fin].map((c, i) => i < f / 2 ? c : c === " " ? " " : GLY[Math.random() * GLY.length | 0]).join("");
      if (++f > fin.length * 2) { clearInterval(id); el.textContent = fin; el._busy = false; }
    }, 22);
  }
  document.addEventListener("pointerover", e => { const el = e.target.closest("[data-scr]"); if (el && !el.contains(e.relatedTarget)) { const t = el.querySelector("span") ? null : el; if (t) scramble(t); } });

  /* ── 스크롤 속도 글자 줄(모션 블러) ── */
  let vel = 0, last = scrollY;
  function kinetic() {
    const rows = $$(".k-row"); if (!rows.length || reduce) return;
    rows.forEach(r => { r.innerHTML = r.innerHTML.repeat(4); r._x = Math.random() * -400; });
    const loop = () => {
      rows.forEach((r, i) => {
        const dir = i % 2 ? 1 : -1, w = r.scrollWidth / 4;
        r._x += dir * (0.6 + Math.abs(vel) * .35);
        if (r._x < -w) r._x += w; if (r._x > 0) r._x -= w;
        r.style.transform = `translate3d(${r._x}px,0,0) skewX(${Math.max(-12, Math.min(12, vel * -.4))}deg)`;
        r.style.filter = `blur(${Math.min(6, Math.abs(vel) * .18).toFixed(2)}px)`;
      });
      vel *= .9; requestAnimationFrame(loop);
    };
    loop();
  }
  addEventListener("scroll", () => { vel = scrollY - last; last = scrollY; hud(); }, { passive: true });
  addEventListener("resize", hud);

  /* ── 폭 조절 글꼴(TYPE · WDTH) ── */
  function wdth() {
    $$(".wdth").forEach(el => {
      const lab = el.parentElement.querySelector(".wdth-label");
      const set = v => { el.style.fontVariationSettings = `"wdth" ${v.toFixed(0)}`; if (lab) lab.textContent = `WDTH ${v.toFixed(0)} · RANGE 62–125`; };
      set(62);
      if (reduce) return;
      el.parentElement.addEventListener("pointermove", e => { const r = el.parentElement.getBoundingClientRect(); set(62 + (e.clientX - r.left) / r.width * 63); });
      el.parentElement.addEventListener("pointerleave", () => set(62));
      if (!fine) { let t = 0; const loop = () => { t += .01; set(93.5 + Math.sin(t) * 31.5); requestAnimationFrame(loop); }; loop(); }
    });
  }

  /* ── 숫자 세기 ── */
  function counters(root = document) {
    $$("[data-count]", root).forEach(el => {
      const to = +el.dataset.count; if (reduce) { el.textContent = pad(to); return; }
      const ob = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; ob.disconnect(); const t0 = performance.now();
        const t = n => { const p = Math.min(1, (n - t0) / 1200); el.textContent = pad(Math.round(to * (1 - Math.pow(1 - p, 4)))); if (p < 1) requestAnimationFrame(t); }; requestAnimationFrame(t); });
      ob.observe(el);
    });
  }

  /* ── 카드 기울기 ── */
  function tilt(root = document) {
    if (!fine || reduce) return;
    $$(".card", root).forEach(c => {
      c.addEventListener("pointermove", e => { const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        c.style.transform = `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg) translateZ(0)`; });
      c.addEventListener("pointerleave", () => { c.style.transform = ""; });
    });
  }

  /* ── FIG 도형 애니메이션(SPACING·EASE·SYSTEM·TYPE) ── */
  const NS = "http://www.w3.org/2000/svg";
  function figSpacing(svg) {   // 공이 튀며 남기는 잔상(onion skin)
    const pts = []; for (let i = 0; i <= 26; i++) { const t = i / 26, x = 18 + t * 150, b = Math.abs(Math.sin(t * Math.PI * 2.2)) * Math.pow(1 - t, 1.3); pts.push([x, 150 - b * 120]); }
    svg.innerHTML = `<line x1="8" y1="162" x2="192" y2="162" stroke="currentColor" stroke-width="1"/>` +
      pts.map(([x, y], i) => `<ellipse class="ghost" cx="${x}" cy="${y}" rx="${10 + (i % 3)}" ry="${12 - (i % 3)}" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="${i % 2 ? "2 2" : "0"}" style="opacity:0"/>`).join("") +
      `<circle class="ball" cx="${pts[26][0]}" cy="${pts[26][1]}" r="11" fill="var(--point)"/>`;
    if (reduce) { $$(".ghost", svg).forEach(g => g.style.opacity = .7); return; }
    const gs = $$(".ghost", svg), ball = $(".ball", svg); let k = 0;
    const step = () => { const i = k % (gs.length + 12); gs.forEach((g, j) => g.style.opacity = j <= i ? .75 : 0); const p = pts[Math.min(i, pts.length - 1)]; ball.setAttribute("cx", p[0]); ball.setAttribute("cy", p[1]); k++; };
    setInterval(step, 90);
  }
  function figEase(svg) {      // cubic-bezier(.83,0,.17,1) 그래프 위를 움직이는 점
    const B = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    const X = t => 20 + B(t, .83, .17) * 160, Y = t => 170 - B(t, 0, 1) * 140;
    let d = ""; for (let i = 0; i <= 60; i++) { const t = i / 60; d += (i ? "L" : "M") + X(t).toFixed(1) + " " + Y(t).toFixed(1); }
    let grid = ""; for (let i = 0; i <= 4; i++) { grid += `<line x1="${20 + i * 40}" y1="30" x2="${20 + i * 40}" y2="170" stroke="currentColor" stroke-width=".4" stroke-dasharray="2 3" opacity=".5"/><line x1="20" y1="${30 + i * 35}" x2="180" y2="${30 + i * 35}" stroke="currentColor" stroke-width=".4" stroke-dasharray="2 3" opacity=".5"/>`; }
    svg.innerHTML = grid + `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="${X(0) - 2}" y="${Y(0) - 2}" width="4" height="4" fill="currentColor"/><rect x="${X(1) - 2}" y="${Y(1) - 2}" width="4" height="4" fill="currentColor"/>
      <circle class="pt" r="4.5" fill="var(--point)"/><text class="tv" x="20" y="190" font-size="7" font-family="JetBrains Mono" fill="currentColor">cubic-bezier(0.83, 0.00, 0.17, 1.00)</text>`;
    const pt = $(".pt", svg), tv = $(".tv", svg); let t = reduce ? .47 : 0;
    const set = () => { pt.setAttribute("cx", X(t)); pt.setAttribute("cy", Y(t)); };
    set(); if (reduce) return;
    const loop = () => { t = (t + .006) % 1.25; const tt = Math.min(1, t); pt.setAttribute("cx", X(tt)); pt.setAttribute("cy", Y(tt));
      tv.textContent = `T ${tt.toFixed(2)}   V ${B(tt, 0, 1).toFixed(2)}`; requestAnimationFrame(loop); };
    loop();
  }
  function figSystem(svg) {    // 격자 칸 위로 반원·사분원이 차례로 돈다
    let h = ""; const cells = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = 20 + c * 40, y = 30 + r * 38; h += `<rect x="${x}" y="${y}" width="40" height="38" fill="none" stroke="currentColor" stroke-width=".4" stroke-dasharray="2 2" opacity=".6"/>`; cells.push([x, y]); }
    const shapes = [[0, 0, 0], [3, 0, 90], [5, 1, 0], [10, 1, 180], [12, 0, 270], [15, 2, 0]];
    h += shapes.map(([i, k, rot]) => { const [x, y] = cells[i]; const fill = k === 2 ? "var(--point)" : "currentColor";
      const p = k === 0 ? `M${x} ${y + 38}A40 38 0 0 1 ${x + 40} ${y}L${x + 40} ${y + 38}Z` : k === 1 ? `M${x} ${y + 38}A20 20 0 0 1 ${x + 40} ${y + 38}Z` : `M${x} ${y}h40v38h-40Z`;
      return `<path class="sh" d="${p}" fill="${fill}" style="transform-origin:${x + 20}px ${y + 19}px;transform:rotate(${rot}deg);transition:transform .9s cubic-bezier(.83,0,.17,1)"/>`; }).join("");
    svg.innerHTML = h;
    if (reduce) return;
    const sh = $$(".sh", svg); let k = 0;
    setInterval(() => { const el = sh[k++ % sh.length]; const m = /rotate\((-?\d+)deg\)/.exec(el.style.transform); el.style.transform = `rotate(${(+m[1] || 0) + 90}deg)`; }, 700);
  }
  function figType(svg) {      // 글자 폭이 숨쉬듯 바뀜
    svg.innerHTML = `<text class="tw" x="100" y="128" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="64" fill="currentColor" style="font-variation-settings:'wdth' 62">TYPE</text>
      <line x1="10" y1="140" x2="190" y2="140" stroke="currentColor" stroke-dasharray="3 3" stroke-width=".8"/><line x1="10" y1="60" x2="190" y2="60" stroke="currentColor" stroke-dasharray="3 3" stroke-width=".8"/>
      <circle cx="186" cy="60" r="4" fill="var(--point)"/><text class="tl" x="190" y="54" text-anchor="end" font-size="7" font-family="JetBrains Mono" fill="currentColor">WDTH 62</text>`;
    if (reduce) return;
    const tw = $(".tw", svg), tl = $(".tl", svg); let t = 0;
    const loop = () => { t += .015; const v = 93.5 + Math.sin(t) * 31.5; tw.style.fontVariationSettings = `'wdth' ${v.toFixed(0)}`; tl.textContent = `WDTH ${v.toFixed(0)}`; requestAnimationFrame(loop); };
    loop();
  }
  const FIGS = { SPACING: figSpacing, EASE: figEase, SYSTEM: figSystem, TYPE: figType };
  function figs(root = document) { $$("svg[data-fig]", root).forEach(s => { s.setAttribute("viewBox", "0 0 200 200"); s.setAttribute("aria-hidden", "true"); (FIGS[s.dataset.fig] || (() => {}))(s); }); }

  /* ── 자료 읽기 ── */
  const getJSON = async p => { try { const r = await fetch(p, { cache: "no-cache" }); return r.ok ? r.json() : null; } catch { return null; } };
  const fmtDate = d => (d || "").slice(0, 10).replace(/-/g, ".");

  /* ── 아주 작은 마크다운 ── */
  function md(src) {
    const inline = s => esc(s)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[\w./#-]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`)
      .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    const L = src.replace(/\r/g, "").split("\n"), out = []; let i = 0, hid = 0;
    while (i < L.length) {
      const l = L[i];
      if (/^```/.test(l)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(esc(L[i++])); i++; out.push(`<pre><code>${b.join("\n")}</code></pre>`); continue; }
      let m;
      if ((m = /^(#{2,3})\s+(.*)/.exec(l))) { const id = "h" + (++hid); out.push(`<h${m[1].length} id="${id}">${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^---\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^>\s?/.test(l)) { const b = []; while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, "")); out.push(`<blockquote>${inline(b.join(" "))}</blockquote>`); continue; }
      if (/^\s*[-*]\s+/.test(l)) { const b = []; while (i < L.length && /^\s*[-*]\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*[-*]\s+/, ""))}</li>`); out.push(`<ul>${b.join("")}</ul>`); continue; }
      if (/^\s*\d+\.\s+/.test(l)) { const b = []; while (i < L.length && /^\s*\d+\.\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*\d+\.\s+/, ""))}</li>`); out.push(`<ol>${b.join("")}</ol>`); continue; }
      if (/^\|.*\|\s*$/.test(l)) { const rows = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) rows.push(L[i++]); const cells = r => r.trim().slice(1, -1).split("|").map(c => c.trim());
        const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
        out.push(`<table>${body.map((r, k) => `<tr>${cells(r).map(c => k ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join("")}</tr>`).join("")}</table>`); continue; }
      if (!l.trim()) { i++; continue; }
      const b = []; while (i < L.length && L[i].trim() && !/^(#{2,3}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\||---\s*$)/.test(L[i])) b.push(L[i++]);
      out.push(`<p>${inline(b.join(" "))}</p>`);
    }
    return out.join("\n");
  }
  const front = txt => { const m = /^---\n([\s\S]*?)\n---\n?/.exec(txt.replace(/\r/g, "")); const meta = {};
    if (m) m[1].split("\n").forEach(l => { const k = l.indexOf(":"); if (k > 0) meta[l.slice(0, k).trim()] = l.slice(k + 1).trim().replace(/^"|"$/g, ""); });
    return { meta, body: m ? txt.slice(m[0].length) : txt }; };

  /* ── 페이지별 ── */
  const PAGES = {
    async home() {
      const hero = $(".hero");
      const lines = (S.heroLines || []).map((t, i, a) => `<span class="line"><span>${esc(t)}${i === a.length - 1 ? '<span class="dot" aria-hidden="true"></span>' : ""}</span></span>`).join("");
      $(".hero .big-ko").innerHTML = lines;
      $(".hero .mtl").textContent = S.meta || ""; $(".hero .mtr").textContent = S.metaRight || "";
      $(".hero .tag p").textContent = S.tagline || "";
      $(".figs").innerHTML = menu.map((m, i) => {
        const dark = i % 2 === 1;
        const word = { SPACING: ["&", "SPACING"], EASE: ["with", "EASE"], SYSTEM: ["on a", "SYSTEM"], TYPE: ["in", "TYPE"] }[m.fig] || ["", m.en];
        return `<a class="fig${dark ? " dark" : ""}" href="${esc(m.href)}" data-reveal>
          <span class="mini"><span>${esc(S.meta || "")}</span><span>${esc(m.fig || "")}</span></span>
          <span class="serif">${esc(word[0])}</span><span class="big-en en">${esc(word[1])}</span>
          <svg data-fig="${esc(m.fig || "")}"></svg>
          <span class="ruler"></span>
          <span class="nums"><span><small>FIG.</small>${pad(i + 1)}</span><span class="ko" style="font-size:22px;margin:0">${esc(m.ko)}</span><span><small>MENU</small>${pad(i + 1)}/${pad(menu.length)}</span></span>
          <span class="go">OPEN →</span></a>`; }).join("");
      $(".figs-meta .l").textContent = `FIG. 01-${pad(menu.length)} — INDEX`;
      const [col, posts, works, prods] = await Promise.all([getJSON("data/collect.json"), getJSON("posts/index.json"), getJSON("data/works.json"), getJSON("data/products.json")]);
      const nums = [col?.length || 0, posts?.length || 0, works?.length || 0, prods?.length || 0];
      $(".stats").innerHTML = menu.slice(0, 4).map((m, i) => `<div><b data-count="${nums[i]}">00</b><span>${esc(m.en)} · ${esc(m.ko)}</span></div>`).join("");
      counters($(".stats"));
      const latest = (posts || []).slice(0, 3);
      $(".latest").innerHTML = latest.length ? latest.map((p, i) => `<li><a href="post.html?p=${encodeURIComponent(p.slug)}"><span class="no">NO. ${pad(i + 1, 3)}</span><span><h3>${esc(p.title)}</h3><p class="mute">${esc(p.summary || "")}</p></span><span class="side">${fmtDate(p.date)}</span></a></li>`).join("") : `<li class="empty">아직 글이 없어요</li>`;
    },
    async collect() {
      const [items, feed] = await Promise.all([getJSON("data/collect.json"), getJSON("data/feed.json")]);
      const all = items || [], tags = [...new Set(all.flatMap(x => x.tags || []))];
      let on = "ALL", q = "";
      const chips = $(".chips"), list = $(".clist"), box = $(".search");
      chips.innerHTML = ["ALL", ...tags].map(t => `<button class="chip" type="button" aria-pressed="${t === on}">${esc(t)}</button>`).join("");
      const draw = () => {
        const first = new Map($$("li[data-k]", list).map(li => [li.dataset.k, li.getBoundingClientRect().top]));
        const vis = all.filter(x => (on === "ALL" || (x.tags || []).includes(on)) && (!q || (x.title + " " + (x.note || "") + " " + (x.source || "")).toLowerCase().includes(q)));
        list.innerHTML = vis.length ? vis.map((x, i) => `<li data-k="${esc(x.url)}"><a href="${esc(x.url)}" target="_blank" rel="noopener"><span class="no">FIG. ${pad(all.indexOf(x) + 1, 3)}</span><span><h3>${esc(x.title)}</h3><p class="mute">${esc(x.note || "")}</p></span><span class="side">${esc(x.source || "")}<br>${(x.tags || []).map(esc).join(" · ")}</span></a></li>`).join("") : `<li class="empty">찾는 것이 없어요</li>`;
        if (!reduce) $$("li[data-k]", list).forEach(li => { const t0 = first.get(li.dataset.k), t1 = li.getBoundingClientRect().top;
          li.animate(t0 == null ? [{ opacity: 0, transform: "translateY(24px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "none" }] : [{ transform: `translateY(${t0 - t1}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.83,0,.17,1)" }); });
        $(".ccount").textContent = `${pad(vis.length, 3)} / ${pad(all.length, 3)} ITEMS`;
      };
      chips.addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; on = b.textContent; $$(".chip", chips).forEach(c => c.setAttribute("aria-pressed", c === b)); draw(); });
      box.addEventListener("input", () => { q = box.value.trim().toLowerCase(); draw(); });
      draw(); magnet(chips);
      const fl = $(".flist"), fi = feed?.items || [];
      $(".fstamp").textContent = feed?.updated ? `UPDATED ${feed.updated} KST · ${pad(fi.length, 3)} ITEMS` : "자동 수집 대기 중";
      fl.innerHTML = fi.length ? fi.slice(0, 40).map((x, i) => `<li><a href="${esc(x.link)}" target="_blank" rel="noopener"><span class="no">RSS ${pad(i + 1, 3)}</span><span><h3>${esc(x.title)}</h3></span><span class="side">${esc(x.source)}<br>${esc(x.date || "")}</span></a></li>`).join("")
        : `<li class="empty">매일 아침 GitHub Actions 가 등록한 출처(data/feeds.json)의 새 글 제목을 모아 여기에 둡니다.</li>`;
    },
    async blog() {
      const posts = await getJSON("posts/index.json") || [];
      $(".plist").innerHTML = posts.length ? posts.map((p, i) => `<li><a href="post.html?p=${encodeURIComponent(p.slug)}"><span class="no">NO. ${pad(posts.length - i, 3)}</span><span><h3>${esc(p.title)}</h3><p class="mute">${esc(p.summary || "")}</p></span><span class="side">${fmtDate(p.date)}<br>${(p.tags || []).map(esc).join(" · ")}</span></a></li>`).join("") : `<li class="empty">아직 글이 없어요</li>`;
      $(".pcount").textContent = `${pad(posts.length, 3)} POSTS`;
    },
    async post() {
      const slug = new URLSearchParams(location.search).get("p") || "";
      const art = $(".post");
      if (!/^[\w-]+$/.test(slug)) { art.innerHTML = `<p class="empty">글을 찾지 못했어요. <a href="blog.html">글 목록으로</a></p>`; return; }
      let txt = ""; try { const r = await fetch(`posts/${slug}.md`, { cache: "no-cache" }); if (r.ok) txt = await r.text(); } catch {}
      if (!txt) { art.innerHTML = `<p class="empty">글을 찾지 못했어요. <a href="blog.html">글 목록으로</a></p>`; return; }
      const { meta, body } = front(txt), words = body.replace(/\s+/g, "").length, min = Math.max(1, Math.round(words / 500));
      document.title = `${meta.title || slug} — ${S.name}`;
      art.innerHTML = `<div class="metaline"><span>WRITE — ${fmtDate(meta.date)}</span><span>${min} MIN READ</span></div>
        <h1 data-reveal>${esc(meta.title || slug)}</h1>${meta.summary ? `<p class="sub" style="max-width:none;margin:0 0 40px" data-reveal>${esc(meta.summary)}</p>` : ""}
        <div class="md" data-reveal>${md(body)}</div>
        <p style="margin-top:60px"><a class="pill" href="blog.html">← 글 목록</a></p>`;
      const hs = $$(".md h2", art);
      if (hs.length > 1) {
        document.body.insertAdjacentHTML("beforeend", `<nav class="toc" aria-label="이 글의 차례">${hs.map(h => `<a href="#${h.id}">${esc(h.textContent)}</a>`).join("")}</nav>`);
        const links = $$(".toc a"); const tio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-20% 0px -70% 0px" });
        hs.forEach(h => tio.observe(h));
      }
      watch(art); magnet(art);
    },
    async works() {
      const all = await getJSON("data/works.json") || [], kinds = [...new Set(all.map(x => x.kind))];
      let on = "ALL"; const chips = $(".chips"), grid = $(".grid");
      chips.innerHTML = ["ALL", ...kinds].map(t => `<button class="chip" type="button" aria-pressed="${t === on}">${esc(t)}</button>`).join("");
      const draw = () => {
        const vis = all.filter(x => on === "ALL" || x.kind === on);
        grid.innerHTML = vis.map((x, i) => `<a class="card${x.sample ? " sample" : ""}" ${x.url ? `href="${esc(x.url)}" target="_blank" rel="noopener"` : 'role="article"'} data-reveal>
          <span class="mini"><span>${esc(x.kind)}</span><span>${esc(x.year || "")}</span></span><span class="fignum">${pad(all.indexOf(x) + 1)}</span>
          <h3>${esc(x.title)}</h3><p>${esc(x.desc || "")}</p>
          <span class="tagrow">${(x.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}${x.url ? "<span>OPEN ↗</span>" : ""}</span></a>`).join("");
        watch(grid); tilt(grid);
      };
      chips.addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; on = b.textContent; $$(".chip", chips).forEach(c => c.setAttribute("aria-pressed", c === b)); draw(); });
      draw(); magnet(chips);
    },
    async shop() {
      const all = await getJSON("data/products.json") || [];
      const ring = $(".ring"), steps = $(".steps"), det = $(".detail"); if (!all.length) { det.innerHTML = `<p class="empty">준비 중이에요</p>`; return; }
      const n = all.length, ang = 360 / n, rad = Math.round((Math.min(300, innerWidth * .62) / 2) / Math.tan(Math.PI / n)) + 40;
      ring.innerHTML = all.map((p, i) => `<div class="prod" role="button" tabindex="0" aria-label="${esc(p.title)}" style="transform:rotateY(${i * ang}deg) translateZ(${rad}px)" data-i="${i}">
        <span class="mini"><span>${esc(S.meta || "")}</span><span>${pad(i + 1)} / ${pad(n)}</span></span>
        <span class="kind">${esc(p.kind)}</span><h3>${esc(p.title)}</h3><span class="price">${esc(p.price)}</span></div>`).join("");
      steps.innerHTML = all.map((p, i) => `<button type="button" data-i="${i}">${pad(i + 1)} ${esc(p.short || p.kind)}</button>`).join("");
      let cur = 0, rot = 0;
      const go = i => {
        const d = ((i - cur) % n + n) % n, step = d > n / 2 ? d - n : d; rot -= step * ang; cur = (i % n + n) % n;
        ring.style.transform = `translateZ(-${rad}px) rotateY(${rot}deg)`;
        $$(".prod", ring).forEach((el, k) => el.classList.toggle("on", k === cur));
        $$("button", steps).forEach((b, k) => b.setAttribute("aria-current", k === cur));
        const p = all[cur];
        det.innerHTML = `<div><div class="mono">${pad(cur + 1)} / ${pad(n)} — ${esc(p.kind)}${p.sample ? " · 예시" : ""}</div><h3>${esc(p.title)}</h3><p>${esc(p.desc || "")}</p>
          <ul>${(p.points || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><div class="big-en" style="font-size:clamp(56px,7vw,110px)">${esc(p.price)}</div><p class="mute">${esc(p.format || "")}</p>
          ${p.buy_url ? `<a class="pill" href="${esc(p.buy_url)}" target="_blank" rel="noopener">구매하러 가기 ↗</a>` : `<button class="pill" disabled>준비 중</button>`}</div>`;
        magnet(det);
      };
      ring.style.transform = `translateZ(-${rad}px) rotateY(0deg)`;
      steps.addEventListener("click", e => { const b = e.target.closest("button"); if (b) go(+b.dataset.i); });
      ring.addEventListener("click", e => { const p = e.target.closest(".prod"); if (p) go(+p.dataset.i); });
      ring.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.i) go(+e.target.dataset.i); });
      $(".prev").addEventListener("click", () => go(cur - 1)); $(".next").addEventListener("click", () => go(cur + 1));
      addEventListener("keydown", e => { if (e.target.closest("input,textarea")) return; if (e.key === "ArrowLeft") go(cur - 1); if (e.key === "ArrowRight") go(cur + 1); });
      let sx = null; const st = $(".stage");
      st.addEventListener("pointerdown", e => { sx = e.clientX; }); st.addEventListener("pointerup", e => { if (sx == null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); sx = null; });
      if (!reduce) { let idle = setInterval(() => go(cur + 1), 4200); st.addEventListener("pointerenter", () => clearInterval(idle)); }
      go(0);
    },
  };

  /* ── 시작 ── */
  loader(async () => {
    const hero = $(".hero");
    await (PAGES[page] || (() => {}))();
    if (hero) requestAnimationFrame(() => hero.classList.add("in"));
    scenes = $$("[data-scene]");
    watch(document); figs(); kinetic(); wdth(); counters(); tilt(); magnet(); hud();
    $$(".scramble").forEach(el => el.addEventListener("pointerenter", () => scramble(el)));
  });
})();
