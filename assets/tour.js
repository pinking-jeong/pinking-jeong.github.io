/* PINKING ARCHIVE — 자동 넘김(첫 쪽).
   첫 화면 애니메이션이 끝나면 장면을 하나씩 내려가며 보여 주고, 맨 아래에 닿으면 넘김 막을 치고 첫 화면으로 돌아온다.
   직접 휠·터치·글쇠를 쓰거나 화면을 누르면 멈춘다. 그 밖의 까닭(Tab 이동·스크롤 막대·페이지 내 찾기 등)으로 화면이 옮겨져도 멈춘다.
   위 막대 가운데 단추(▶ 재생 · ❚❚ 멈춤)로 지금 보는 장면부터 다시 잇는다.
   config.js: autoScroll(켜고 끄기) · autoScrollLoop(첫 화면으로 돌아온 뒤 되풀이).
   prefers-reduced-motion 이나 motion:false 면 단추도 만들지 않는다. 외부 라이브러리 없음. */
(() => {
  const S = window.SITE || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || S.motion === false;
  if (reduce || S.autoScroll === false || document.body.dataset.page !== "home") return;

  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // site.css 의 --ease 에 가까운 곡선

  /* ── 시간(초)과 빠르기 ── */
  const HOLD = { hero: 3.2, plain: 3.0, type: 3.4, foot: 3.0, lead: .4, tail: 1.0 };   // 장면에 머무는 시간(lead·tail: 훑기 앞뒤)
  const GLIDE = { min: .9, perScreen: 1.1, max: 1.6 };   // 다음 장면으로 넘어가는 시간(이동 거리에 비례)
  const PAN_SPEED = .3;       // 한 화면보다 긴 장면을 훑는 빠르기(화면 높이/초)
  const PAN_MIN = 1.2;        // 훑기의 가장 짧은 시간
  const STORY_SECONDS = 11;   // 스크롤 장면(낱말 넷)을 처음부터 끝까지 훑는 시간
  const REEL_PAN_AT = .4;     // 쇼릴이 화면보다 클 때, 재생 시간의 이만큼이 지나면 아래쪽으로 옮겨 보여 준다
  const REEL_GRACE = 3;       // 쇼릴이 한 바퀴 돌았다는 신호를 못 받아도 이만큼 더 기다리고 넘어간다
  const REEL_SECONDS = 15;    // 쇼릴 길이를 화면에서 읽지 못했을 때 쓰는 값
  const WIPE_SECONDS = .82;   // 넘김 막이 다 덮이는 시간(site.css .wipe 의 .8s)
  const BOTTOM_INSET = 40;    // 아래 틀(타임코드 줄)이 차지하는 높이
  const EDGE = 8;             // 화면보다 큰 쇼릴을 위·아래 끝에 맞출 때 두는 틈
  const MAX_FRAME = .1;       // 한 프레임에 흐르는 시간의 한도(탭을 떠났다 돌아와도 건너뛰지 않게)
  const DRIFT = 3;            // 자동 넘김이 옮겨 둔 자리에서 이만큼(px) 넘게 벗어나 있으면 다른 손이 움직인 것으로 본다
  const QUIET_MS = 400;       // 단추로 막 재생한 뒤, 남아 있던 관성 휠에 바로 멈추지 않도록 봐주는 시간
  const BARE_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);   // 혼자 눌러서는 아무 일도 하지 않는 글쇠
  const ICON = { play: "▶\uFE0E", pause: "❚❚" };   // \uFE0E: 휴대폰에서 그림 문자(이모지)로 바뀌지 않게
  const TITLE = { play: "자동 넘김 재생", pause: "자동 넘김 멈춤" };

  let run = 0;            // 실행 번호 — 멈추거나 새로 시작하면 올라가고, 앞선 실행의 기다림은 모두 끊긴다
  let playing = false, wiping = false, scenes = [], btn = null;
  let lastY = 0;          // 자동 넘김이 마지막으로 옮겨 놓은 자리
  let quietUntil = 0;     // 이 시각까지는 남은 관성 휠·그로 인한 움직임을 봐준다
  const alive = id => id === run;
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const topInset = () => $(".topbar")?.offsetHeight || 0;
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const pageTop = el => el.getBoundingClientRect().top + scrollY;
  const jump = y => { scrollTo({ top: y, behavior: "instant" }); lastY = scrollY; };   // html 의 scroll-behavior:smooth 를 거치지 않고 바로 옮긴다
  const drifted = () => Math.abs(scrollY - lastY) > DRIFT;
  const quiet = () => performance.now() < quietUntil;
  const kindOf = el => el.matches(".hero") ? "hero" : el.matches(".foot") ? "foot" : el.matches(".story") ? "story"
    : el.matches(".reel-sec") ? "reel" : $(".wdth", el) ? "type" : "plain";

  /* 이 장면을 보여 줄 스크롤 구간 [처음, 끝]. 끝이 처음보다 크면 그만큼 훑어 내려간다. */
  function range(el) {
    const kind = kindOf(el), vh = innerHeight, lim = y => clamp(Math.round(y), 0, maxY());
    if (kind === "hero") return [0, 0];
    if (kind === "foot") return [maxY(), maxY()];
    if (kind === "story") { const top = pageTop(el); return [lim(top), lim(top + el.offsetHeight - vh)]; }
    const box = kind === "reel" ? $(".screen", el) || el : el;
    const top = pageTop(box), h = box.offsetHeight, room = vh - topInset() - BOTTOM_INSET;
    if (h <= room) { const y = lim(top - topInset() - (room - h) / 2); return [y, y]; }   // 들어오면 위 막대 아래 가운데에 둔다
    // 구역은 제 안쪽 여백이 있으니 화면 끝에 맞추고, 쇼릴 화면은 위 막대·아래 틀을 피해 틈을 둔다
    const a = lim(box === el ? top : top - topInset() - EDGE);
    const b = lim(box === el ? top + h - vh : top + h - vh + BOTTOM_INSET + EDGE);
    return [a, Math.max(a, b)];
  }

  /* seconds 초 동안 매 프레임 step(진행 0~1) 을 부른다. step 이 true 를 돌려주면 일찍 끝낸다.
     끝까지 갔으면 true, 중간에 멈춰졌으면 false. */
  async function tween(id, seconds, step) {
    let t = 0, last = performance.now();
    while (alive(id)) {
      const now = await frame();
      if (!alive(id)) return false;
      if (drifted()) { if (quiet()) lastY = scrollY; else { stop(); return false; } }   // 다른 손이 화면을 옮겼다
      t += Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000)); last = now;
      const p = seconds > 0 ? Math.min(1, t / seconds) : 1;
      if (step(p) === true || p >= 1) return true;
    }
    return false;
  }
  const wait = (id, seconds) => tween(id, seconds, () => false);
  const waitUntil = (id, done, maxSeconds) => tween(id, maxSeconds, () => done());
  /* glide·pan 의 to 는 목표 자리를 돌려주는 함수다 — 창 크기가 바뀌거나 글꼴이 늦게 실려도 매 프레임 다시 잰다. */
  function glide(id, to) {        // 다음 장면으로: 천천히 출발해 천천히 멈춘다
    const from = scrollY, dist = Math.abs(to() - from);
    if (dist < 2) return Promise.resolve(alive(id));
    const seconds = clamp(dist / innerHeight * GLIDE.perScreen, GLIDE.min, GLIDE.max);
    return tween(id, seconds, p => { jump(from + (to() - from) * ease(p)); });
  }
  function pan(id, to, seconds) {  // 긴 장면 훑기: 일정한 빠르기
    const from = scrollY;
    return tween(id, seconds, p => { jump(from + (to() - from) * p); });
  }
  const panSeconds = to => Math.max(PAN_MIN, Math.abs(to - scrollY) / (innerHeight * PAN_SPEED));

  /* 쇼릴: 처음부터 틀고 한 바퀴가 끝날 때까지 머문다(motion.js 와 pk:restart · pk:lap 으로 주고받는다) */
  async function playReel(id, el, endOf) {
    const reel = $(".reel", el);
    if (!reel) return wait(id, HOLD.plain);
    const total = parseFloat($(".scrub", reel)?.getAttribute("aria-valuemax")) || REEL_SECONDS;
    let lapped = false, spent = 0;
    const onLap = () => { lapped = true; };
    reel.addEventListener("pk:lap", onLap);
    reel.dispatchEvent(new CustomEvent("pk:restart"));
    try {
      if (endOf() > scrollY + 2) {   // 화면보다 큰 쇼릴: 위쪽을 보여 주다가 아래쪽으로 옮긴다
        const seconds = panSeconds(endOf());
        if (!(await wait(id, total * REEL_PAN_AT)) || !(await pan(id, endOf, seconds))) return false;
        spent = total * REEL_PAN_AT + seconds;
      }
      return await waitUntil(id, () => lapped, Math.max(0, total + REEL_GRACE - spent));
    } finally { reel.removeEventListener("pk:lap", onLap); }
  }

  /* TYPE 장면: 포인터가 왼쪽에서 오른쪽으로 갔다 돌아오는 것처럼 글자 폭을 한 번 움직인다(site.js 의 pointermove 처리에 맡긴다).
     터치 화면에서는 site.js 가 스스로 움직이므로 머물기만 한다. 이벤트는 위로 퍼지지 않게 해 십자선 커서가 끌려가지 않는다. */
  async function sweepType(id, el) {
    const wrap = $(".wdth-wrap", el);
    if (!wrap || typeof PointerEvent !== "function" || !matchMedia("(pointer:fine)").matches) return wait(id, HOLD.type);
    const done = await tween(id, HOLD.type, p => {
      const r = wrap.getBoundingClientRect();
      wrap.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width * Math.sin(p * Math.PI), clientY: r.top + r.height / 2 }));
    });
    wrap.dispatchEvent(new PointerEvent("pointerleave"));
    return done;
  }

  /* 장면 하나: 그 자리로 넘어가 → 머물거나 재생하고 → 화면보다 길면 끝까지 훑는다. 멈춰졌으면 false.
     resume 이 참이고 이미 긴 장면의 중간에 있으면, 처음으로 되돌아가지 않고 그 자리부터 훑는다. */
  async function showScene(id, el, resume) {
    const kind = kindOf(el), startOf = () => range(el)[0], endOf = () => range(el)[1];
    const [start, end] = range(el);
    const inside = resume && end > start && scrollY > start && scrollY <= end;
    if (!inside && !(await glide(id, startOf))) return false;
    if (kind === "reel") return playReel(id, el, endOf);
    if (kind === "story") {
      if (!inside && !(await wait(id, HOLD.lead))) return false;
      const seconds = STORY_SECONDS * (endOf() - scrollY) / Math.max(1, endOf() - startOf());
      return await pan(id, endOf, seconds) && wait(id, HOLD.tail);
    }
    const held = inside || await (kind === "type" ? sweepType(id, el) : wait(id, HOLD[kind] || HOLD.plain));
    if (!held) return false;
    if (endOf() <= scrollY + 2) return true;
    return await pan(id, endOf, panSeconds(endOf())) && wait(id, HOLD.tail);
  }

  /* 첫 화면 큰 글자를 등장 전 상태로 되돌린다(전환 없이 바로) */
  function resetHero(hero) {
    const parts = $$(".line>span", hero);
    parts.forEach(s => { s.style.transition = "none"; });
    hero.classList.remove("in");
    void hero.offsetWidth;
    parts.forEach(s => { s.style.transition = ""; });
  }

  /* 맨 아래에서 첫 화면으로: 넘김 막을 덮고 → 맨 위로 옮기고 → 막을 걷으며 첫 화면 애니메이션을 다시 튼다 */
  async function goHome(id) {
    const wipe = $(".wipe"), hero = $(".hero");
    if (wipe) {
      wiping = true;
      wipe.classList.remove("gone"); wipe.classList.add("from-bottom");
      await frame();
      if (!alive(id)) return false;
      wipe.classList.remove("from-bottom"); wipe.classList.add("cover");
      if (!(await wait(id, WIPE_SECONDS))) return false;
    }
    if (hero) resetHero(hero);
    jump(0);
    if (wipe) { wipe.className = "wipe gone"; wiping = false; }
    await frame();
    if (hero) hero.classList.add("in");
    return alive(id);
  }

  function setPlaying(on) {
    playing = on;
    btn.textContent = on ? ICON.pause : ICON.play;
    btn.title = on ? TITLE.pause : TITLE.play;
    btn.setAttribute("aria-pressed", String(on));   // 이름은 '자동 넘김' 그대로 두고 켜짐·꺼짐만 알린다
  }
  function stop() {   // 여러 번 불러도 되고, 돌던 것이 없어도 덮다 만 막은 걷는다
    run++;
    if (wiping) { const wipe = $(".wipe"); if (wipe) wipe.className = "wipe gone"; wiping = false; }
    if (playing) setPlaying(false);
  }
  async function play(from, resume) {
    const id = ++run;
    lastY = scrollY;
    setPlaying(true);
    for (let i = from; alive(id); i = (i + 1) % scenes.length) {
      if (!(await showScene(id, scenes[i], resume))) return;
      resume = false;
      if (i < scenes.length - 1) continue;
      if (!(await goHome(id))) return;
      if (S.autoScrollLoop === false) { stop(); return; }
    }
  }
  /* 지금 보고 있는 장면(아래 틀의 장면 번호와 같은 기준). 맨 아래에 있으면 마지막 장면. */
  function currentIndex() {
    if (scrollY >= maxY() - 2) return scenes.length - 1;
    let cur = 0;
    scenes.forEach((el, i) => { if (el.getBoundingClientRect().top < innerHeight * .5) cur = i; });
    return cur;
  }

  function init() {
    scenes = $$("[data-scene]");
    const brand = $(".topbar .brand");
    if (!brand || scenes.length < 2) return;
    brand.insertAdjacentHTML("afterend", `<button class="auto-btn" type="button" aria-label="자동 넘김"></button>`);
    btn = $(".topbar .auto-btn");
    document.body.classList.add("has-auto");
    const start = (from, resume) => { play(from, resume).catch(stop); };   // 도중에 탈이 나면 멈춘 상태로 돌려놓는다
    btn.addEventListener("click", () => { if (playing) { stop(); return; } quietUntil = performance.now() + QUIET_MS; start(currentIndex(), true); });
    // 손으로 움직이면 멈춘다(단추 자신은 빼고). 다른 곳에서 이벤트가 퍼지는 것을 막아도 듣도록 capture 로 건다.
    const manual = e => { if (playing && !btn.contains(e.target) && !(e.type === "wheel" && quiet())) stop(); };
    ["wheel", "touchstart", "pointerdown", "focusin"].forEach(type => addEventListener(type, manual, { passive: true, capture: true }));
    // 글쇠를 누르면 멈춘다(Tab 으로 링크를 옮겨 다닐 때 화면이 달아나지 않게). 단추 위의 스페이스·엔터는 단추 누르기이므로 뺀다.
    addEventListener("keydown", e => {
      if (!playing || BARE_KEYS.has(e.key) || (btn.contains(e.target) && (e.key === " " || e.key === "Enter"))) return;
      stop();
    }, { capture: true });
    // 그 밖의 까닭으로 화면이 옮겨져도 멈춘다: 스크롤 막대 끌기, 페이지 내 찾기, 초점 이동, 화면 확대 도구 등
    addEventListener("scroll", () => { if (playing && drifted() && !quiet()) stop(); }, { passive: true });
    addEventListener("resize", () => { lastY = scrollY; });   // 창 크기가 바뀌며 브라우저가 맞춘 자리는 받아들인다
    addEventListener("pagehide", stop);                       // 다른 쪽으로 떠났다가 '뒤로'로 돌아왔을 때 혼자 돌고 있지 않게
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", e => { if (e.matches) stop(); });
    setPlaying(false);
    if (scrollY < 10) start(0, false);   // 새로 고침 등으로 중간에서 열렸으면 스스로 시작하지 않는다
  }
  if (document.body.classList.contains("pk-ready")) init();
  else document.addEventListener("pk:ready", init, { once: true });
})();
