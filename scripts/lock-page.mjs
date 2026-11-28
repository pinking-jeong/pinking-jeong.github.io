#!/usr/bin/env node
/* 한 파일짜리 HTML 자료를 비밀번호로 암호화해, 비밀번호를 넣어야 열리는 쪽으로 만든다.

   1) 비밀번호 정하기 — 본인 터미널에서 직접 한다(다른 사람·도구에게 보이지 않게):
        node scripts/lock-page.mjs password <slug> --generate   ← 무작위로 만들어 한 번 보여 준다(권장)
        node scripts/lock-page.mjs password <slug>              ← 직접 정한다(화면에 보이지 않게 두 번 묻는다)
      → ~/.config/pinking-archive/<slug>.pw (본인만 읽기)에 저장한다. 이 저장소에는 들어가지 않는다.
        이미 있으면 덮어쓰지 않는다(바꾸려면 --force).
   2) 잠근 쪽 만들기:
        node scripts/lock-page.mjs build <자료.html> <slug> --title "제목" --note "제목 아래 한 줄"
      → locked/<slug>.<해시>.bin (암호문)과 <slug>.html (비밀번호 칸이 있는 쪽)을 만든다.
        그다음 data/works.json 에 url 이 "<slug>.html" 인 카드를 넣는다.

   꼭 알아 둘 것
   - 이 저장소는 공개된다. 올라가는 것은 암호문뿐이고, 원본 자료가 저장소 안에 있으면 멈춘다.
   - 암호문은 누구나 내려받아 비밀번호를 얼마든지 시도해 볼 수 있다. 안전은 비밀번호가 얼마나 '무작위'인가에 달려 있다 — 길이가 아니다.
     사람이 떠올린 문구(가사·속담·이름+숫자)는 길어도 사전 공격에 며칠이면 뚫릴 수 있다. --generate 를 쓰거나, 서로 관계없는 낱말 여섯 개 이상을 무작위로 골라 잇는다.
   - 한 번 올린 암호문은 저장소 기록에 영원히 남는다. 나중에 비밀번호를 바꿔 다시 만들어도 옛 암호문은 옛 비밀번호로 계속 풀린다 → 처음 올릴 때부터 최종 비밀번호여야 한다.
   - AES-256-GCM, 열쇠는 PBKDF2-HMAC-SHA256(300만 번). 만들 때마다 소금과 초기값을 새로 뽑는다. 브라우저 쪽은 assets/lock.js.
   필요한 것: Node 20 이상(외부 패키지 없음). 시험: node --test scripts/lock-page.test.mjs */
import { execFileSync } from "node:child_process";
import { randomInt, webcrypto as crypto } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { gzipSync } from "node:zlib";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET_DIR = join(homedir(), ".config", "pinking-archive");
const LOCKED_DIR = "locked";
const FORMAT = "pinking-lock/v1";   // assets/lock.js 의 FORMAT 과 같아야 한다
const ITERATIONS = 3_000_000;
const MIN_PASSWORD = 16;
const SALT_BYTES = 16, IV_BYTES = 12;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TEMPLATE_PAGE = "works.html";   // 머리말(글꼴·스타일·스크립트)을 이 쪽에서 가져와 다른 쪽과 늘 같게 둔다
const LOCK_MARK = "data-lock";        // 이 표시가 있는 쪽만 이 도구가 만든 쪽으로 보고 다시 쓴다
const GEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";   // 헷갈리는 글자(i·l·o·0·1)를 뺀 31자
const GEN_GROUPS = 4, GEN_GROUP_SIZE = 5;                 // 5자씩 네 묶음 = 20자, 약 99비트

const b64 = buf => Buffer.from(buf).toString("base64");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fail = message => { throw new Error(message); };
const secretPath = slug => join(SECRET_DIR, `${slug}.pw`);
const checkSlug = slug => SLUG.test(slug || "") ? slug : fail(`slug 는 영문 소문자·숫자·하이픈으로 2~41자: ${JSON.stringify(slug)}`);

/* 비밀번호 다듬기: 조합 방식을 하나로(NFC) 맞추고, 너무 짧으면 받지 않는다(길다고 안전한 것은 아니다 — 맨 위 설명). */
export function cleanPassword(raw) {
  const password = String(raw).replace(/\r?\n$/, "").normalize("NFC");
  if ([...password].length < MIN_PASSWORD) fail(`비밀번호가 너무 짧다(${MIN_PASSWORD}자 이상). 암호문이 공개되므로 --generate 로 만들거나 무작위 낱말 여섯 개 이상을 쓴다.`);
  return password;
}

/* 무작위 비밀번호: 5자씩 네 묶음(예: abcde-fghjk-mnpqr-stuvw). 묶음 사이의 줄표도 비밀번호의 일부다. */
export function generatePassword() {
  const group = () => Array.from({ length: GEN_GROUP_SIZE }, () => GEN_ALPHABET[randomInt(GEN_ALPHABET.length)]).join("");
  return Array.from({ length: GEN_GROUPS }, group).join("-");
}

/* 글(HTML)을 gzip 으로 줄인 뒤 비밀번호로 암호화한다. 암호문과, 푸는 데 필요한 공개 값(소금·초기값·반복 횟수)을 돌려준다. */
export async function lock(html, password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES)), iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const packed = gzipSync(Buffer.from(html, "utf8"), { level: 9 });
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(FORMAT) }, key, packed));
  return { cipher, params: { salt: b64(salt), iv: b64(iv), iterations } };
}

/* 브라우저가 쓰는 것과 같은 코드(assets/lock.js)로 풀어 본다. */
export async function unlock(password, cipher, params) {
  if (!globalThis.pkLockCore) runInThisContext(readFileSync(join(SITE, "assets", "lock.js"), "utf8"), { filename: "assets/lock.js" });
  return globalThis.pkLockCore.open(password, cipher, params);
}

/* 비밀번호 칸이 있는 쪽. 제목과 한 줄 설명 말고는 자료의 내용이 한 글자도 들어가지 않는다. */
export function lockPage({ title, note, src, params, site = SITE }) {
  const template = readFileSync(join(site, TEMPLATE_PAGE), "utf8");
  const bodyAt = template.indexOf("<body");
  if (bodyAt < 0) fail(`${TEMPLATE_PAGE} 에 <body 가 없다`);
  let head = template.slice(0, bodyAt);
  const swap = (pattern, text) => {   // 바꿀 글자 속의 $ 가 특별하게 풀리지 않도록 함수로 넘긴다
    if (!pattern.test(head)) fail(`${TEMPLATE_PAGE} 의 머리말이 예상과 다르다: ${pattern}`);
    head = head.replace(pattern, () => text);
  };
  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)} — PINKING</title>`);
  swap(/<meta name="description" content="[^"]*">/,
    `<meta name="description" content="비밀번호가 있어야 열리는 자료.">\n<meta name="robots" content="noindex">\n<meta name="referrer" content="no-referrer">`);
  swap(/<meta property="og:title" content="[^"]*"><meta property="og:description" content="[^"]*">/,
    `<meta property="og:title" content="${esc(title)} — PINKING"><meta property="og:description" content="비밀번호가 있어야 열리는 자료.">`);
  swap(/<\/head>/, `<script src="assets/lock.js" defer></script>\n</head>`);
  return `${head}<body data-page="locked">
<main id="main">

<section class="sec ink" data-scene>
  <div class="metaline"><span>WORKS — LOCKED</span><span>PASSWORD REQUIRED</span></div>
  <div class="head"><h1 class="big-ko" style="font-size:clamp(40px,7vw,104px);word-break:keep-all" data-reveal>${esc(title)}<span class="dot"></span></h1>
    <p class="sub" style="word-break:keep-all" data-reveal>${esc(note)}</p></div>
  <form class="lock" ${LOCK_MARK} data-src="${esc(src)}" data-salt="${esc(params.salt)}" data-iv="${esc(params.iv)}" data-iterations="${Number(params.iterations)}" data-reveal>
    <label class="mono" for="lock-pw">PASSWORD</label>
    <input class="search" id="lock-pw" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore required>
    <button class="pill" type="submit">열기 →</button>
    <p class="lock-note mono" role="status" aria-live="polite">비밀번호를 넣으면 이 자리에서 열립니다.</p>
  </form>
</section>
</main>
<noscript><p style="padding:40px">이 사이트는 자바스크립트를 켜야 내용이 보입니다.</p></noscript>
</body>
</html>
`;
}

/* file 이 folder 안(또는 그 자체)인가. 경로 글자가 아니라 파일 시스템의 번호(dev·ino)로 견줘, 대소문자·심볼릭 링크로 속지 않는다. */
export function isInside(file, folder) {
  const root = statSync(folder), same = s => s.dev === root.dev && s.ino === root.ino;
  for (let at = realpathSync.native(file); ; at = dirname(at)) {
    if (same(statSync(at))) return true;
    if (dirname(at) === at) return false;
  }
}

/* 이 자료의 암호문이 저장소 기록에 이미 올라간 적이 있는가(있다면 그 암호문은 옛 비밀번호로 계속 풀린다). */
function everCommitted(site, slug) {
  try {
    return execFileSync("git", ["-C", site, "log", "--all", "--oneline", "-1", "--", `${LOCKED_DIR}/${slug}.*.bin`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== "";
  } catch { return false; }
}

/* build: 원본을 읽어 암호문과 잠근 쪽을 쓴다. 쓰기 전에 브라우저와 같은 코드로 풀어 원본과 같은지 확인한다. */
export async function build({ source, slug, title, note, site = SITE, password }) {
  checkSlug(slug);
  if (!title) fail("--title 이 필요하다");
  if (!existsSync(source)) fail(`원본이 없다: ${source}`);
  if (isInside(source, site)) fail("원본 자료가 공개 저장소 안에 있다. 저장소 밖에 두고 그 경로를 적는다.");
  const pagePath = join(site, `${slug}.html`);
  if (existsSync(pagePath) && !readFileSync(pagePath, "utf8").includes(LOCK_MARK)) fail(`${slug}.html 은 이 도구가 만든 쪽이 아니다 — 덮어쓰지 않는다. 다른 slug 를 쓴다.`);
  const html = readFileSync(source, "utf8");
  if (!/<html[\s>]/i.test(html)) fail("HTML 문서가 아니다(<html> 이 없음)");
  const clean = cleanPassword(password);
  const { cipher, params } = await lock(html, clean);
  if (await unlock(clean, cipher, params) !== html) fail("풀어 본 결과가 원본과 다르다 — 쓰지 않고 멈춘다");
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", cipher)).toString("hex").slice(0, 10);
  const folder = join(site, LOCKED_DIR), name = `${slug}.${digest}.bin`;   // 이름에 해시를 넣어, 쪽과 암호문이 엇갈려 캐시되지 않게 한다
  mkdirSync(folder, { recursive: true });
  const mine = f => new RegExp(`^${slug}\\.[0-9a-f]{10}\\.bin(\\.part)?$`).test(f);
  const stale = readdirSync(folder).filter(f => mine(f) && f !== name);
  const page = lockPage({ title, note: note || "비밀번호가 있어야 열리는 자료입니다.", src: `${LOCKED_DIR}/${name}`, params, site });
  const republished = everCommitted(site, slug);
  writeFileSync(join(folder, `${name}.part`), cipher);
  renameSync(join(folder, `${name}.part`), join(folder, name));
  writeFileSync(`${pagePath}.part`, page);
  renameSync(`${pagePath}.part`, pagePath);
  stale.forEach(f => rmSync(join(folder, f)));
  return { page: `${slug}.html`, bin: `${LOCKED_DIR}/${name}`, plainBytes: Buffer.byteLength(html), cipherBytes: cipher.length, removed: stale, republished };
}

/* 터미널 글쇠 입력을 지금까지 친 글자에 반영한다. 방향키 같은 제어 글쇠는 버린다(비밀번호에 섞여 들어가지 않게). */
export function typeKeys(typed, chunk) {
  const keys = chunk.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001bO[ -~]|\u001b[ -~]?/g, "");   // ESC 로 시작하는 묶음(화살표·Delete·기능 글쇠 등)
  for (const ch of keys) {
    if (ch === "\r" || ch === "\n") return { typed, done: true };
    if (ch === "\u0003" || ch === "\u0004") return { typed: "", abort: true };   // Ctrl-C · Ctrl-D
    if (ch === "\u0015") typed = "";                                             // Ctrl-U: 모두 지움
    else if (ch === "\u007f" || ch === "\b") typed = [...typed].slice(0, -1).join("");
    else if (ch >= " " && !(ch >= "\u0080" && ch <= "\u009f")) typed += ch;
  }
  return { typed };
}

/* 터미널에서 글자를 보이지 않게 한 줄 받는다. */
function askHidden(question) {
  return new Promise((done, stop) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return stop(new Error("본인 터미널에서 직접 실행해야 한다(비밀번호를 화면에 보이지 않게 받기 위해)"));
    stdout.write(question);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    let typed = "";
    const finish = (error, value) => {
      stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); stdin.removeListener("end", onEnd);
      stdout.write("\n");
      if (error) stop(error); else done(value);
    };
    const onEnd = () => finish(new Error("입력이 끊겼다"));
    const onData = chunk => {
      const next = typeKeys(typed, chunk);
      typed = next.typed;
      if (next.abort) finish(new Error("그만둠 — 저장하지 않았다"));
      else if (next.done) finish(null, typed);
    };
    stdin.on("data", onData); stdin.on("end", onEnd);
  });
}

function refuseOverwrite(file, force) {
  if (existsSync(file) && !force) fail(`이미 정해 둔 비밀번호가 있다: ${file}\n  바꾸려면 --force 를 붙인다. 단, 이미 올린 암호문은 옛 비밀번호로 계속 풀린다.`);
}

/* 비밀번호를 본인만 읽는 파일로 저장한다(임시 파일에 쓴 뒤 바꿔치기, 폴더·파일 권한은 매번 다시 건다). */
export function savePassword(slug, password, { dir = SECRET_DIR, force = false } = {}) {
  const file = join(dir, `${checkSlug(slug)}.pw`);
  refuseOverwrite(file, force);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeFileSync(`${file}.tmp`, cleanPassword(password), { mode: 0o600 });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
  return file;
}

async function setPassword(slug, { generate, force }) {
  checkSlug(slug);
  refuseOverwrite(secretPath(slug), force);   // 묻기 전에 먼저 확인한다
  if (generate) {
    const password = generatePassword();
    const file = savePassword(slug, password, { force });
    console.log(`\n  ${password}\n\n위가 '${slug}' 의 비밀번호입니다(줄표 포함 ${password.length}자). 지금 안전한 곳에 적어 두세요 — 다시 보여 주지 않습니다.\n저장: ${file} (본인만 읽기, 저장소에 올라가지 않음)`);
    return;
  }
  console.log("사람이 떠올린 문구는 길어도 뚫릴 수 있습니다. 서로 관계없는 낱말 여섯 개 이상을 무작위로 고르거나, --generate 를 쓰는 편이 안전합니다.");
  const first = cleanPassword(await askHidden(`'${slug}' 을(를) 열 비밀번호(${MIN_PASSWORD}자 이상, 화면에 보이지 않습니다): `));
  if (cleanPassword(await askHidden("한 번 더: ")) !== first) fail("두 번 넣은 것이 서로 다르다 — 저장하지 않았다");
  const file = savePassword(slug, first, { force });
  console.log(`저장했습니다: ${file} (${[...first].length}자, 본인만 읽기). 이 파일은 저장소에 올라가지 않습니다.`);
}

const FLAGS = new Set(["generate", "force"]);   // 값 없이 쓰는 선택 사항
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) { out._.push(argv[i]); continue; }
    const name = argv[i].slice(2);
    if (FLAGS.has(name)) out[name] = true;
    else { out[name] = argv[i + 1] ?? fail(`${argv[i]} 뒤에 값이 필요하다`); i++; }
  }
  return out;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "password") return setPassword(args._[0], args);
  if (command === "build") {
    const [source, slug] = args._;
    checkSlug(slug);
    if (!existsSync(secretPath(slug))) fail(`비밀번호가 아직 없다. 먼저 본인 터미널에서: node scripts/lock-page.mjs password ${slug} --generate`);
    const made = await build({ source: resolve(source || ""), slug, title: args.title, note: args.note, password: readFileSync(secretPath(slug), "utf8") });
    console.log(`만듦: ${made.page} · ${made.bin} (원본 ${(made.plainBytes / 1e6).toFixed(2)}MB → 암호문 ${(made.cipherBytes / 1e6).toFixed(2)}MB)` + (made.removed.length ? ` · 지난 암호문 ${made.removed.length}개 지움` : ""));
    if (made.republished) console.log("주의: 이 자료의 옛 암호문이 저장소 기록에 이미 있다. 비밀번호를 바꿨더라도 옛 암호문은 옛 비밀번호로 계속 풀린다.");
    return;
  }
  fail("쓰는 법: node scripts/lock-page.mjs password <slug> [--generate] [--force]  |  node scripts/lock-page.mjs build <자료.html> <slug> --title \"제목\" [--note \"한 줄\"]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`실패: ${error.message}`); process.exit(1); });
}
