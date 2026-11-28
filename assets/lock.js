/* PINKING ARCHIVE — 잠긴 쪽 열기.
   잠긴 자료는 scripts/lock-page.mjs 가 비밀번호로 암호화해 locked/ 에 둔 것이다(AES-256-GCM, 열쇠는 PBKDF2-SHA256).
   이 저장소는 공개되어 있으므로 '가리기'로는 막을 수 없다 — 올라가는 것은 암호문뿐이고, 비밀번호를 넣은 브라우저 안에서만 풀린다.
   비밀번호와 풀린 내용은 어디에도 저장하지 않는다(새로 고치면 다시 묻는다). 외부 라이브러리 없음. */
(() => {
  const FORMAT = new TextEncoder().encode("pinking-lock/v1");   // 형식 표시 — 암호문에 함께 묶여 있어, 다른 형식의 자료와 섞이면 풀리지 않는다
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const core = {
    /* 비밀번호로 열쇠를 만들어 암호문을 푼다. 비밀번호가 틀리거나 암호문·공개 값이 바뀌었으면 예외가 난다. */
    async decrypt(password, cipher, { salt, iv, iterations }) {
      const typed = new TextEncoder().encode(password.normalize("NFC"));   // 한글 비밀번호가 기기마다 다르게 조합되어도 같게
      const material = await crypto.subtle.importKey("raw", typed, "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations },
        material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: FORMAT }, key, cipher);
    },
    /* 풀린 덩어리(gzip)를 글(HTML)로 편다. */
    unpack(packed) {
      return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    },
    async open(password, cipher, params) { return core.unpack(await core.decrypt(password, cipher, params)); },
  };
  if (typeof document === "undefined") { globalThis.pkLockCore = core; return; }   // 시험(node)에서는 여기까지만 쓴다

  const form = document.querySelector("form[data-lock]");
  if (!form) return;
  const input = form.querySelector("input[type=password]"), button = form.querySelector("button"), note = form.querySelector(".lock-note");
  const say = text => { note.textContent = text; };
  if (!globalThis.crypto?.subtle || typeof DecompressionStream !== "function") {
    say("× 이 브라우저에서는 열 수 없습니다. 최신 Chrome · Safari · Firefox 로 열어 주세요.");
    button.disabled = true;
    return;
  }
  let busy = false;
  const retry = text => { say(text); busy = false; button.disabled = false; };
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy || !input.value) return;
    busy = true; button.disabled = true;
    say("여는 중… (몇 초 걸릴 수 있습니다)");
    let cipher, packed;
    try {
      const res = await fetch(form.dataset.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cipher = await res.arrayBuffer();
    } catch { return retry("× 잠긴 자료를 받아 오지 못했습니다. 잠시 뒤 다시 해 주세요."); }
    try {
      packed = await core.decrypt(input.value, cipher, { salt: form.dataset.salt, iv: form.dataset.iv, iterations: Number(form.dataset.iterations) });
    } catch { input.select(); return retry("× 비밀번호가 맞지 않습니다."); }
    try {
      const page = await core.unpack(packed);
      input.value = "";
      document.open(); document.write(page); document.close();   // 풀린 자료가 이 쪽을 통째로 대신한다
    } catch { retry("× 풀었지만 화면에 띄우지 못했습니다. 브라우저를 최신으로 올린 뒤 다시 해 주세요."); }
  });
})();
