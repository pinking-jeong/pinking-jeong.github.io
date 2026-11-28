/* lock-page.mjs 의 시험. 사용: node --test scripts/lock-page.test.mjs
   브라우저에서 실제로 열리는지는 scripts/check_lock.py 가 본다(이 시험은 Node 의 WebCrypto 로 assets/lock.js 의 푸는 부분만 돌린다). */
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, pbkdf2Sync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { build, cleanPassword, generatePassword, isInside, lock, lockPage, savePassword, typeKeys, unlock } from "./lock-page.mjs";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAST = 1000;   // 시험에서는 반복 횟수를 줄여 빨리 돈다
const FORMAT = "pinking-lock/v1";
const PASSWORD = "맑은 가을 하늘 아래 열두 고개";
const SECRET = "이-문장은-암호문에서-보이면-안-된다";
const HTML = `<!doctype html><html lang="ko"><head><title>시험 자료</title></head><body><p>${SECRET}</p>${"<p>본문 문단입니다.</p>".repeat(400)}</body></html>`;
const mode = file => statSync(file).mode & 0o777;

function tempSite() {
  const root = mkdtempSync(join(tmpdir(), "lock-test-"));
  const site = join(root, "site"), outside = join(root, "밖");
  mkdirSync(site); mkdirSync(outside);
  cpSync(join(SITE, "works.html"), join(site, "works.html"));
  writeFileSync(join(outside, "자료.html"), HTML);
  return { root, site, outside, source: join(outside, "자료.html") };
}
/* Node 의 다른 구현(pbkdf2Sync + createCipheriv)으로 같은 형식을 따로 만든다 — 잠그는 쪽과 푸는 쪽이 같은 실수를 해도 드러나게 */
function classicKey(password, params) {
  return pbkdf2Sync(Buffer.from(password.normalize("NFC")), Buffer.from(params.salt, "base64"), params.iterations, 32, "sha256");
}

test("잠갔다 풀면 원본과 같다(브라우저와 같은 코드로 푼다)", async () => {
  const { cipher, params } = await lock(HTML, PASSWORD, FAST);
  assert.equal(await unlock(PASSWORD, cipher, params), HTML);
  assert.equal(params.iterations, FAST);
});

test("다른 구현으로도 풀리고, 다른 구현이 잠근 것도 풀린다(형식: PBKDF2-SHA256 → AES-256-GCM, 꼬리표 16바이트, 형식 표시를 함께 묶음)", async () => {
  const { cipher, params } = await lock(HTML, PASSWORD, FAST);
  const body = Buffer.from(cipher), opener = createDecipheriv("aes-256-gcm", classicKey(PASSWORD, params), Buffer.from(params.iv, "base64"));
  opener.setAAD(Buffer.from(FORMAT)); opener.setAuthTag(body.subarray(body.length - 16));
  assert.equal(gunzipSync(Buffer.concat([opener.update(body.subarray(0, body.length - 16)), opener.final()])).toString("utf8"), HTML);

  const mine = { salt: Buffer.alloc(16, 7).toString("base64"), iv: Buffer.alloc(12, 9).toString("base64"), iterations: FAST };
  const seal = aad => { const c = createCipheriv("aes-256-gcm", classicKey(PASSWORD, mine), Buffer.alloc(12, 9)); if (aad) c.setAAD(Buffer.from(aad));
    return Buffer.concat([c.update(gzipSync(Buffer.from(HTML))), c.final(), c.getAuthTag()]); };
  assert.equal(await unlock(PASSWORD, seal(FORMAT), mine), HTML);
  await assert.rejects(unlock(PASSWORD, seal(null), mine));              // 형식 표시 없이 잠근 것은 풀리지 않는다
  await assert.rejects(unlock(PASSWORD, seal("pinking-lock/v0"), mine));
});

test("암호문은 줄이기만 한 것이 아니다: gzip 으로 풀리지 않고, 원본 글자가 없고, 바이트가 고르게 퍼져 있다", async () => {
  const { cipher } = await lock(HTML, PASSWORD, FAST);
  const body = Buffer.from(cipher);
  assert.throws(() => gunzipSync(body));
  assert.notEqual(body.subarray(0, 2).toString("hex"), "1f8b");
  assert.equal(body.includes(Buffer.from(SECRET)), false);
  assert.equal(body.includes(Buffer.from("<html")), false);
  assert.ok(body.length < Buffer.byteLength(HTML) / 4);
  const big = Buffer.from((await lock(Array.from({ length: 4000 }, (_, i) => `<p>${i * 7919 % 9973}</p>`).join(""), PASSWORD, FAST)).cipher);
  assert.ok(new Set(big).size > 240, `서로 다른 바이트 값 ${new Set(big).size}개`);
});

test("비밀번호가 틀리면 열리지 않는다", async () => {
  const { cipher, params } = await lock(HTML, PASSWORD, FAST);
  await assert.rejects(unlock(PASSWORD + "!", cipher, params));
  await assert.rejects(unlock("", cipher, params));
});

test("암호문이나 공개 값이 한 군데라도 바뀌면 열리지 않는다", async () => {
  const { cipher, params } = await lock(HTML, PASSWORD, FAST);
  const bent = Uint8Array.from(cipher); bent[bent.length >> 1] ^= 1;
  await assert.rejects(unlock(PASSWORD, bent, params));
  await assert.rejects(unlock(PASSWORD, cipher, { ...params, iterations: FAST + 1 }));
  const other = await lock(HTML, PASSWORD, FAST);
  await assert.rejects(unlock(PASSWORD, cipher, { ...params, salt: other.params.salt }));
  await assert.rejects(unlock(PASSWORD, cipher, { ...params, iv: other.params.iv }));
});

test("만들 때마다 소금·초기값·암호문이 달라진다", async () => {
  const a = await lock(HTML, PASSWORD, FAST), b = await lock(HTML, PASSWORD, FAST);
  assert.notEqual(a.params.salt, b.params.salt);
  assert.notEqual(a.params.iv, b.params.iv);
  assert.equal(Buffer.from(a.cipher).equals(Buffer.from(b.cipher)), false);
});

test("한글 비밀번호는 조합 방식(NFC·NFD)이 달라도 열린다", async () => {
  const { cipher, params } = await lock(HTML, PASSWORD.normalize("NFD"), FAST);
  assert.equal(await unlock(PASSWORD.normalize("NFC"), cipher, params), HTML);
  assert.equal(await unlock(PASSWORD.normalize("NFD"), cipher, params), HTML);
});

test("비밀번호 다듬기: 끝의 줄바꿈은 떼고, 16자 미만은 받지 않는다", () => {
  assert.equal(cleanPassword("correct horse battery\n"), "correct horse battery");
  assert.equal(cleanPassword(PASSWORD.normalize("NFD")), PASSWORD.normalize("NFC"));
  assert.throws(() => cleanPassword("짧은비번"));
  assert.throws(() => cleanPassword("123456789012345\n"));
});

test("무작위 비밀번호: 헷갈리는 글자 없이 5자씩 네 묶음이고 매번 다르다", () => {
  const made = Array.from({ length: 50 }, generatePassword);
  for (const p of made) { assert.match(p, /^[a-hjkmnp-z2-9]{5}(-[a-hjkmnp-z2-9]{5}){3}$/); assert.equal(cleanPassword(p), p); }
  assert.equal(new Set(made).size, 50);
  assert.ok(new Set(made.join("").replaceAll("-", "")).size >= 28);   // 31자 가운데 거의 다 쓰인다
});

test("터미널 입력: 방향키·Delete 같은 제어 글쇠는 비밀번호에 섞이지 않는다", () => {
  assert.deepEqual(typeKeys("abcd", "\u001b[Defgh"), { typed: "abcdefgh" });           // ←
  assert.deepEqual(typeKeys("abcd", "\u001b[3~ef"), { typed: "abcdef" });              // Delete
  assert.deepEqual(typeKeys("ab", "\u001bOPc\u001b[1;5Cd\u001b"), { typed: "abcd" });   // F1 · Ctrl+→ · Esc
  assert.deepEqual(typeKeys("한글비밀", "\u007f"), { typed: "한글비" });
  assert.deepEqual(typeKeys("abc", "\u0015xy"), { typed: "xy" });                       // Ctrl-U 는 모두 지움
  assert.deepEqual(typeKeys("abc", "de\rfg"), { typed: "abcde", done: true });          // Enter 뒤는 버린다
  assert.deepEqual(typeKeys("abc", "\u0004"), { typed: "", abort: true });              // Ctrl-D
  assert.deepEqual(typeKeys("abc", "d\u0003"), { typed: "", abort: true });             // Ctrl-C
  assert.deepEqual(typeKeys("", "a\u0085b\tc"), { typed: "abc" });                      // 그 밖의 제어 문자
});

test("비밀번호 파일: 본인만 읽게 쓰고, 이미 있으면 덮어쓰지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "lock-pw-"));
  try {
    const dir = join(root, "conf");
    mkdirSync(dir, { mode: 0o755 });
    const file = savePassword("sample", PASSWORD + "\n", { dir });
    assert.equal(readFileSync(file, "utf8"), PASSWORD);
    assert.equal(mode(file), 0o600);
    assert.equal(mode(dir), 0o700);                                  // 느슨하던 폴더 권한도 조인다
    assert.throws(() => savePassword("sample", "다른 비밀번호 열여섯 글자 이상입니다", { dir }), /이미 정해 둔/);
    assert.equal(readFileSync(file, "utf8"), PASSWORD);
    writeFileSync(file, "x");
    savePassword("sample", "다른 비밀번호 열여섯 글자 이상입니다", { dir, force: true });
    assert.equal(readFileSync(file, "utf8"), "다른 비밀번호 열여섯 글자 이상입니다");
    assert.equal(mode(file), 0o600);
    assert.throws(() => savePassword("sample2", "짧다", { dir }), /짧다/);
    assert.throws(() => savePassword("../밖", PASSWORD, { dir }), /slug/);
    assert.deepEqual(readdirSync(dir), ["sample.pw"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("저장소 안팎 가리기: '..x' 폴더, 심볼릭 링크, 대소문자를 바꾼 경로에 속지 않는다", () => {
  const { root, site, outside, source } = tempSite();
  try {
    mkdirSync(join(site, "..x")); writeFileSync(join(site, "..x", "a.html"), HTML);
    mkdirSync(join(site, "sub")); writeFileSync(join(site, "sub", "b.html"), HTML);
    symlinkSync(join(site, "sub", "b.html"), join(outside, "링크.html"));
    symlinkSync(source, join(site, "밖을-가리킴.html"));
    assert.equal(isInside(join(site, "..x", "a.html"), site), true);
    assert.equal(isInside(join(site, "sub", "b.html"), site), true);
    assert.equal(isInside(join(outside, "링크.html"), site), true);        // 밖에 있는 링크가 안의 파일을 가리킴
    assert.equal(isInside(join(site, "밖을-가리킴.html"), site), false);  // 안에 있는 링크가 밖의 파일을 가리킴(읽히는 것은 밖의 파일)
    assert.equal(isInside(source, site), false);
    assert.equal(isInside(site, site), true);
    const shouted = join(root, "SITE", "sub", "b.html");
    if (existsSync(shouted)) assert.equal(isInside(shouted, site), true);   // 대소문자를 가리지 않는 디스크(맥 기본)에서만 해당
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("잠근 쪽에는 제목·설명·공개 값만 들어간다", () => {
  const page = lockPage({ title: "시험 <제목> $' $&", note: "설명 & 한 줄", src: "locked/x.abc.bin", params: { salt: "c2FsdA==", iv: "aXY=", iterations: 7 } });
  assert.equal(page.match(/<title>/g).length, 1);
  assert.match(page, /<title>시험 &lt;제목&gt; \$&#39; \$&amp; — PINKING<\/title>/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(page, /<meta name="referrer" content="no-referrer">/);
  assert.match(page, /<script src="assets\/lock\.js" defer><\/script>/);
  assert.match(page, /data-lock data-src="locked\/x\.abc\.bin" data-salt="c2FsdA==" data-iv="aXY=" data-iterations="7"/);
  assert.match(page, /설명 &amp; 한 줄/);
  assert.match(page, /<input class="search" id="lock-pw" type="password" autocomplete="off"/);
  assert.equal(page.includes("tour.js"), false);
});

test("build: 암호문과 잠근 쪽을 쓰고, 지난 암호문은 지우고, 원본 글자는 어디에도 남기지 않는다", async () => {
  const { root, site, source } = tempSite();
  try {
    mkdirSync(join(site, "locked"));
    writeFileSync(join(site, "locked", "sample.0000000000.bin"), "지난 암호문");
    writeFileSync(join(site, "locked", "sample.1111111111.bin.part"), "쓰다 만 것");
    writeFileSync(join(site, "locked", "sample-2.2222222222.bin"), "이름이 비슷한 다른 자료");
    const made = await build({ source, slug: "sample", title: "시험 자료", note: "한 줄", site, password: PASSWORD + "\n" });
    assert.equal(made.page, "sample.html");
    assert.match(made.bin, /^locked\/sample\.[0-9a-f]{10}\.bin$/);
    assert.equal(made.republished, false);
    assert.deepEqual(readdirSync(join(site, "locked")).sort(), [made.bin.slice(7), "sample-2.2222222222.bin"].sort());
    const page = readFileSync(join(site, "sample.html"), "utf8");
    assert.ok(page.includes(`data-src="${made.bin}"`));
    const params = { salt: /data-salt="([^"]+)"/.exec(page)[1], iv: /data-iv="([^"]+)"/.exec(page)[1], iterations: Number(/data-iterations="(\d+)"/.exec(page)[1]) };
    assert.equal(params.iterations, 3_000_000);
    assert.equal(await unlock(PASSWORD, readFileSync(join(site, made.bin)), params), HTML);
    for (const file of [join(site, "sample.html"), join(site, made.bin)]) {
      assert.equal(readFileSync(file).includes(Buffer.from(SECRET)), false, file);
      assert.equal(readFileSync(file).includes(Buffer.from(PASSWORD)), false, file);
    }
    const again = await build({ source, slug: "sample", title: "시험 자료", site, password: PASSWORD });   // 제가 만든 쪽은 다시 써도 된다
    assert.notEqual(again.bin, made.bin);
    assert.deepEqual(again.removed, [made.bin.slice(7)]);
    assert.deepEqual(readdirSync(site).filter(f => f.endsWith(".part")), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build: 원본이 저장소 안에 있거나, 비밀번호가 짧거나, 이름이 이상하거나, 기존 쪽과 이름이 겹치면 아무것도 쓰지 않는다", async () => {
  const { root, site, source } = tempSite();
  try {
    writeFileSync(join(site, "안에-둔-자료.html"), HTML);
    writeFileSync(join(site, "index.html"), "<html><body>첫 쪽</body></html>");
    const template = readFileSync(join(site, "works.html"), "utf8");
    await assert.rejects(build({ source: join(site, "안에-둔-자료.html"), slug: "sample", title: "제목", site, password: PASSWORD }), /저장소 안/);
    await assert.rejects(build({ source, slug: "sample", title: "제목", site, password: "짧다" }), /짧다/);
    await assert.rejects(build({ source, slug: "../밖", title: "제목", site, password: PASSWORD }), /slug/);
    await assert.rejects(build({ source, slug: "sample", title: "", site, password: PASSWORD }), /title/);
    await assert.rejects(build({ source: join(root, "없는-파일.html"), slug: "sample", title: "제목", site, password: PASSWORD }), /없다/);
    await assert.rejects(build({ source, slug: "index", title: "제목", site, password: PASSWORD }), /덮어쓰지 않는다/);
    await assert.rejects(build({ source, slug: "works", title: "제목", site, password: PASSWORD }), /덮어쓰지 않는다/);
    assert.equal(readFileSync(join(site, "index.html"), "utf8"), "<html><body>첫 쪽</body></html>");
    assert.equal(readFileSync(join(site, "works.html"), "utf8"), template);
    assert.equal(existsSync(join(site, "sample.html")), false);
    assert.equal(existsSync(join(site, "locked")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
