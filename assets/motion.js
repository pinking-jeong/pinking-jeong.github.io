/* PINKING ARCHIVE — 영상처럼 재생되는 쇼릴 + 스크롤에 따라 움직이는 장면.
   견본: 디자인 컬렉션 '클로디'의 ai_anharu 'Claude Motion Reel' 장면 순서(MOTION → TIMING → SPACING → with EASE → TYPE → SYSTEM),
   크림/먹 번갈아·주황 한 점·재단선·타임코드·진행 막대·빠른 큰 글자 모션 블러. 그라디언트·빛 번짐 없음.
   prefers-reduced-motion 이나 config.js motion:false 면 쇼릴은 멈춘 첫 장면, 스크롤 장면은 정지 배치로 보인다. */
(() => {
  const S = window.SITE || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || S.motion === false;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;           // 0.83,0,0.17,1 에 가까운 곡선
  const B = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const tc = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}.${pad(Math.floor((s % 1) * 100))}`;

  /* ═════════ 1. 쇼릴(영상처럼 재생) ═════════ */
  const reel = $(".reel");
  if (reel) {
    const SCENES = [
      { id: "motion",  dark: true,  name: "MOTION" },
      { id: "timing",  dark: false, name: "TIMING" },
      { id: "spacing", dark: true,  name: "SPACING" },
      { id: "ease",    dark: false, name: "EASE" },
      { id: "type",    dark: true,  name: "TYPE" },
      { id: "system",  dark: false, name: "SYSTEM" },
    ];
    const SEG = 2.5, DUR = SCENES.length * SEG;   // 15.00 SEC
    const screen = $(".screen", reel), stage = $(".scenes", reel);
    // 장면 틀 만들기
    stage.innerHTML = SCENES.map((s, i) => `<div class="scene ${s.dark ? "dk" : "lt"}" data-id="${s.id}" aria-hidden="${i ? "true" : "false"}">${{
      motion: `<div class="sc-mini"><span>01 — KINETIC</span><span>120 BPM</span></div>
               <div class="mo-rows"><div class="mo">MOTION · MOTION · MOTION ·</div><div class="mo out">MOTION · MOTION · MOTION ·</div><div class="mo">MOTION · MOTION · MOTION ·</div></div>
               <span class="pdot"></span>`,
      timing: `<div class="sc-mini"><span>02 — TIMING</span><span>24 FPS</span></div>
               <div class="ti-num">00</div><div class="ti-lab">FRAMES / 24</div>
               <div class="ti-ruler"><span class="ti-head"></span></div>`,
      spacing: `<div class="sc-mini"><span>03 — SPACING</span><span>ONION SKIN · 2F</span></div>
               <div class="sc-title"><span class="serif">&amp;</span><span class="big-en">SPACING</span></div>
               <svg class="sp-svg" viewBox="0 0 400 160" aria-hidden="true"></svg>`,
      ease: `<div class="sc-mini"><span>04 — EASE</span><span>CUBIC-BEZIER</span></div>
               <div class="sc-title"><span class="serif">with</span><span class="big-en">EASE</span></div>
               <svg class="ea-svg" viewBox="0 0 300 170" aria-hidden="true"></svg>`,
      type: `<div class="sc-mini"><span>05 — TYPE</span><span class="ty-lab">WDTH 62</span></div>
               <div class="ty-wrap"><div class="ty-word">TYPE</div></div><div class="ty-note"><span class="serif">in type,</span> the width is a voice.</div><span class="ty-dot"></span>`,
      system: `<div class="sc-mini"><span>06 — SYSTEM</span><span>6 × 4 GRID</span></div>
               <div class="sc-title"><span class="serif">on a</span><span class="big-en">SYSTEM</span></div>
               <div class="sy-grid">${Array.from({ length: 24 }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</div>`,
    }[s.id]}</div>`).join("");
    const scEls = $$(".scene", stage);
    // 타임라인 아래 장면 표시
    const scrub = $(".scrub", reel);
    scrub.insertAdjacentHTML("beforeend", SCENES.map((s, i) => `<span class="mk" style="left:${(i * SEG / DUR * 100).toFixed(3)}%"><em>${pad(i + 1)} ${s.name}</em></span>`).join(""));

    // SPACING 잔상 경로
    const spPts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; spPts.push([30 + t * 340, 140 - Math.abs(Math.sin(t * Math.PI * 2.5)) * Math.pow(1 - t, 1.15) * 120]); }
    const spSvg = $(".sp-svg", stage);
    spSvg.innerHTML = `<line x1="10" y1="152" x2="390" y2="152" stroke="currentColor" stroke-width="1"/>` +
      spPts.map(([x, y], i) => `<ellipse class="g" cx="${x}" cy="${y}" rx="11" ry="${11 - (i % 3)}" fill="none" stroke="currentColor" stroke-width=".9" stroke-dasharray="${i % 2 ? "2 2" : "0"}" opacity="0"/>`).join("") +
      `<circle class="b" r="12" fill="var(--point)"/>`;
    const spG = $$(".g", spSvg), spB = $(".b", spSvg);
    // EASE 곡선
    const eaSvg = $(".ea-svg", stage), EX = t => 30 + B(t, .83, .17) * 240, EY = t => 150 - B(t, 0, 1) * 130;
    let d = ""; for (let i = 0; i <= 80; i++) { const t = i / 80; d += (i ? "L" : "M") + EX(t).toFixed(1) + " " + EY(t).toFixed(1); }
    let grid = ""; for (let i = 0; i <= 6; i++) grid += `<line x1="${30 + i * 40}" y1="20" x2="${30 + i * 40}" y2="150" stroke="currentColor" stroke-width=".5" stroke-dasharray="2 3" opacity=".45"/>`;
    for (let i = 0; i <= 4; i++) grid += `<line x1="30" y1="${20 + i * 32.5}" x2="270" y2="${20 + i * 32.5}" stroke="currentColor" stroke-width=".5" stroke-dasharray="2 3" opacity=".45"/>`;
    eaSvg.innerHTML = grid + `<path class="cv" d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/><circle class="pt" r="6" fill="var(--point)"/>
      <text x="30" y="166" font-size="8" font-family="JetBrains Mono" fill="currentColor">cubic-bezier(0.83, 0.00, 0.17, 1.00)</text><text class="tv" x="270" y="166" text-anchor="end" font-size="8" font-family="JetBrains Mono" fill="currentColor">T 0.00  V 0.00</text>`;
    const eaCv = $(".cv", eaSvg), eaPt = $(".pt", eaSvg), eaTv = $(".tv", eaSvg), eaLen = eaCv.getTotalLength();
    eaCv.style.strokeDasharray = eaLen;

    const tcEl = $(".rtc", reel), barEl = $(".rbar b", reel), scEl = $(".rsc", reel), timeEl = $(".rtime", reel), scrubB = $(".scrub b", reel), playBtn = $(".rplay", reel);
    let t = 0, playing = !reduce, last = null, inView = false, cur = -1;

    function render() {
      const k = Math.min(SCENES.length - 1, Math.floor(t / SEG)), q = (t - k * SEG) / SEG;   // q: 장면 안 진행 0~1
      if (k !== cur) {
        scEls.forEach((el, i) => { el.classList.toggle("on", i === k); el.setAttribute("aria-hidden", i === k ? "false" : "true"); });
        screen.classList.toggle("dark", SCENES[k].dark);
        if (cur !== -1 && !reduce) {   // 장면 넘김: 큰 글자가 빠르게 지나가며 흐려짐
          scEls[k].animate([{ transform: "translateY(18%)", filter: "blur(14px)", opacity: 0 }, { transform: "none", filter: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.83,0,.17,1)" });
        }
        cur = k;
      }
      const el = scEls[k], e = ease(clamp(q * 1.25));
      switch (SCENES[k].id) {
        case "motion": $$(".mo", el).forEach((m, i) => { const dir = i % 2 ? 1 : -1, x = (dir * (1 - e) * 60) + dir * -20 * q, v = Math.abs(1 - q) * 18 * (1 - e);
          m.style.transform = `translateX(${x}%) skewX(${dir * -v * .5}deg)`; m.style.filter = `blur(${(v * .45).toFixed(1)}px)`; }); break;
        case "timing": { const f = Math.min(24, Math.floor(q * 28)); $(".ti-num", el).textContent = pad(f); $(".ti-head", el).style.left = (f / 24 * 100) + "%"; break; }
        case "spacing": { const n = Math.floor(clamp(q * 1.2) * spPts.length); spG.forEach((g, i) => g.setAttribute("opacity", i < n ? .75 : 0)); const p = spPts[Math.max(0, Math.min(spPts.length - 1, n - 1))] || spPts[0]; spB.setAttribute("cx", p[0]); spB.setAttribute("cy", p[1]); break; }
        case "ease": { const tt = clamp(q * 1.3); eaCv.style.strokeDashoffset = eaLen * (1 - clamp(q * 2.2)); eaPt.setAttribute("cx", EX(tt)); eaPt.setAttribute("cy", EY(tt)); eaTv.textContent = `T ${tt.toFixed(2)}  V ${B(tt, 0, 1).toFixed(2)}`; break; }
        case "type": { const v = 62 + Math.sin(q * Math.PI) * 63; $(".ty-word", el).style.fontVariationSettings = `"wdth" ${v.toFixed(0)}`; $(".ty-lab", el).textContent = `WDTH ${v.toFixed(0)}`; break; }
        case "system": $$(".sy-grid i", el).forEach((c, i) => c.classList.toggle("on", i < Math.floor(clamp(q * 1.25) * 24))); break;
      }
      tcEl.textContent = tc(t); timeEl.textContent = `${tc(t)} / ${tc(DUR)}`; scEl.textContent = `SC ${pad(k + 1)} / ${pad(SCENES.length)}`;
      const pct = (t / DUR * 100).toFixed(2) + "%"; barEl.style.width = pct; scrubB.style.width = pct;
      scrub.setAttribute("aria-valuenow", t.toFixed(1)); scrub.setAttribute("aria-valuetext", `${tc(t)}, ${SCENES[k].name}`);
    }
    function frame(now) {
      if (playing && inView) {
        if (last != null) { const next = t + Math.min(.1, (now - last) / 1000); if (next >= DUR) reel.dispatchEvent(new CustomEvent("pk:lap")); t = next % DUR; }   // 한 바퀴 돌았음을 알린다(자동 넘김 tour.js). 탭을 떠났다 돌아와도 한꺼번에 건너뛰지 않는다
        last = now; render();
      } else last = null;
      requestAnimationFrame(frame);
    }
    const setPlay = p => { playing = p; playBtn.textContent = p ? "❚❚ PAUSE" : "▶ PLAY"; playBtn.setAttribute("aria-label", p ? "멈춤" : "재생"); reel.classList.toggle("paused", !p); };
    playBtn.addEventListener("click", () => setPlay(!playing));
    reel.addEventListener("pk:restart", () => { t = 0; last = null; setPlay(true); render(); });   // 자동 넘김이 처음부터 틀 때
    reel.addEventListener("keydown", e => { if (e.key === " " || e.key === "k") { e.preventDefault(); setPlay(!playing); }
      if (e.key === "ArrowRight") { t = Math.min(DUR - .01, t + SEG); render(); } if (e.key === "ArrowLeft") { t = Math.max(0, t - SEG); render(); } });
    screen.addEventListener("click", () => setPlay(!playing));
    // 타임라인 끌기(scrub)
    const seek = e => { const r = scrub.getBoundingClientRect(); t = clamp((e.clientX - r.left) / r.width) * (DUR - .01); render(); };
    scrub.addEventListener("pointerdown", e => { scrub.setPointerCapture(e.pointerId); seek(e); scrub._drag = true; reel.classList.add("seeking"); });
    scrub.addEventListener("pointermove", e => { if (scrub._drag) seek(e); });
    scrub.addEventListener("pointerup", () => { scrub._drag = false; reel.classList.remove("seeking"); });
    new IntersectionObserver(es => { inView = es[0].isIntersecting; }, { threshold: .25 }).observe(reel);
    setPlay(playing); render(); requestAnimationFrame(frame);
  }

  /* ═════════ 2. 스크롤 장면(화면 고정 + 스크롤만큼 진행) ═════════ */
  const story = $(".story");
  let storyUpdate = () => {};
  if (story) {
    const pin = $(".story-pin", story), words = $$(".st-word", story), track = $(".st-track", story);
    const path = $(".st-path", story), dot = $(".st-dot", story), num = $(".st-num", story), pctEl = $(".st-pct", story), steps = words.length;
    const len = path.getTotalLength(); path.style.strokeDasharray = len;
    storyUpdate = () => {
      const r = story.getBoundingClientRect(), total = story.offsetHeight - innerHeight;
      const p = reduce ? 1 : clamp(-r.top / total);
      const k = Math.min(steps - 1, Math.floor(p * steps)), q = p * steps - k;
      pin.classList.toggle("dark", k % 2 === 1);   // 장면마다 크림/먹 번갈아
      if (r.top <= 0 && r.bottom >= innerHeight) document.body.classList.toggle("on-ink", k % 2 === 1);   // 위 막대 색도 맞춤
      words.forEach((w, i) => {
        let o = 0, y = 40, b = 16, s = 1.15;
        if (i === k) { const a = clamp(q / .22), z = i === steps - 1 ? 0 : clamp((q - .78) / .22); o = a * (1 - z); y = (1 - ease(a)) * 40 - ease(z) * 40; b = (1 - a) * 16 + z * 16; s = 1.15 - .15 * ease(a); }
        if (reduce) { o = i === steps - 1 ? 1 : 0; y = 0; b = 0; s = 1; }
        w.style.opacity = o.toFixed(3); w.style.transform = `translateY(${y.toFixed(1)}%) scale(${s.toFixed(3)})`; w.style.filter = `blur(${b.toFixed(1)}px)`;
      });
      path.style.strokeDashoffset = (len * (1 - p)).toFixed(1);
      const pt = path.getPointAtLength(len * p); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
      const maxX = track.scrollWidth - track.parentElement.clientWidth; track.style.transform = `translateX(${(-maxX * ease(p)).toFixed(1)}px)`;
      num.textContent = `${pad(k + 1)} / ${pad(steps)}`; pctEl.textContent = `SCROLL ${pad(Math.round(p * 100), 3)}%`;
    };
  }

  /* ═════════ 3. 모든 쪽: 스크롤에 따라 움직이는 작은 효과 ═════════ */
  const heroLines = () => $$(".hero .line");   // site.js 가 로딩 뒤에 만들므로 그때그때 찾음
  const pageTitle = $(".sec .head .big-ko");
  const para = $$("[data-speed]");
  const wdthBound = () => $$("[data-scroll-wdth]");
  function scrollFx() {
    const y = scrollY, vh = innerHeight;
    // 첫 화면 큰 글자: 내릴수록 줄마다 좌우로 벌어지며 흐려짐
    const hl = heroLines();
    if (hl.length && !reduce) { const p = clamp(y / (vh * .9)); hl.forEach((l, i) => { const dir = i % 2 ? 1 : -1;
      l.style.transform = `translateX(${(dir * p * 18).toFixed(2)}vw)`; l.style.filter = `blur(${(p * 6).toFixed(1)}px)`; l.style.opacity = (1 - p * .7).toFixed(3); }); }
    // 각 쪽 제목: 내릴수록 작아지고 옅어짐
    if (pageTitle && !reduce) { const p = clamp(y / (vh * .7)); pageTitle.style.transform = `translateY(${(p * 30).toFixed(1)}px) scale(${(1 - p * .12).toFixed(3)})`; pageTitle.style.transformOrigin = "left bottom"; pageTitle.style.opacity = (1 - p * .5).toFixed(3); }
    // 시차(parallax)
    if (!reduce) para.forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) return; const c = r.top + r.height / 2 - vh / 2;
      el.style.transform = `translate3d(0,${(c * +el.dataset.speed).toFixed(1)}px,0)`; });
    // 글자 폭이 스크롤에 따라 바뀌는 제목
    wdthBound().forEach(el => { const r = el.getBoundingClientRect(); const p = reduce ? .5 : clamp(1 - (r.top + r.height / 2) / vh); el.style.fontVariationSettings = `"wdth" ${(62 + p * 63).toFixed(0)}`; });
    storyUpdate();
  }
  let ticking = false;
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { scrollFx(); ticking = false; }); } }, { passive: true });
  addEventListener("resize", scrollFx);
  scrollFx();
})();
