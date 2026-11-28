#!/usr/bin/env python3
"""잠긴 쪽(scripts/lock-page.mjs · assets/lock.js)이 실제 브라우저에서 잠기고 열리는지 본다(헤드리스 크롬, 맥 기준 경로).

사용: uv run --no-project --with websocket-client python scripts/check_lock.py
        → 이 저장소의 사본을 임시 폴더에 만들고, 시험용 자료를 시험용 비밀번호로 잠가 열어 본다(진짜 자료·비밀번호와 무관).
      uv run --no-project --with websocket-client python scripts/check_lock.py <주소 또는 사이트 폴더> <쪽.html> --password-file <파일> --expect-title <글자>
        → 이미 만들어 둔 잠긴 쪽을 진짜 비밀번호로 열어 본다. 비밀번호는 파일에서 읽어 브라우저에 넣기만 하고 어디에도 찍지 않는다.
필요한 것: Google Chrome, Node 20 이상, websocket-client(위 명령이 임시로 받아 쓴다)."""
import functools
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import check_tour as ct

REPO = Path(__file__).resolve().parent.parent
PORT = 9383
TEST_PASSWORD = "시험용 비밀번호 열여섯 글자 이상입니다"
TEST_TITLE = "시험용 잠긴 자료"
FIXTURE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>시험용 잠긴 자료</title></head>
<body><h1 id="marker">열렸습니다 — 시험용 본문</h1><p id="count"></p>
<script>const DATA = { items: [1, 2, 3] }; let state = "ok";
document.getElementById("count").textContent = "항목 " + DATA.items.length + "개 · 상태 " + state; window.__ran = true;</script>
<script>document.addEventListener("keydown", e => { if (e.key === "g") document.body.dataset.key = "g"; });</script>
</body></html>
"""
MAKE = """import { build } from %s;
const [site, source, password, title] = process.argv.slice(2);
await build({ source, slug: "fixture", title, note: "시험 · 비밀번호가 있어야 열립니다.", site, password });
"""
STATE = """(() => { const q = s => document.querySelector(s);
  return { title: document.title, form: !!q("form[data-lock]"), note: (q(".lock-note") || {}).textContent || "", topbar: !!q(".topbar"), marker: (q("#marker") || {}).textContent || "",
    count: (q("#count") || {}).textContent || "", ran: window.__ran === true, chars: document.body ? document.body.innerText.length : 0, key: document.body ? document.body.dataset.key || "" : "",
    disabled: q("form[data-lock] button") ? q("form[data-lock] button").disabled : null, typed: q("#lock-pw") ? q("#lock-pw").value.length : -1 }; })()"""


def option(name: str, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def make_fixture_site(root: Path) -> Path:
    """저장소 사본(쪽·스타일·스크립트만)에 시험용 자료를 시험용 비밀번호로 잠가 둔다."""
    site, outside = root / "site", root / "outside"
    site.mkdir()
    outside.mkdir()
    for name in ("works.html", "config.js"):
        shutil.copy(REPO / name, site / name)
    shutil.copytree(REPO / "assets", site / "assets")
    shutil.copytree(REPO / "data", site / "data")
    (outside / "fixture.html").write_text(FIXTURE, encoding="utf-8")
    script = root / "make.mjs"
    script.write_text(MAKE % json.dumps(str(REPO / "scripts" / "lock-page.mjs")), encoding="utf-8")
    subprocess.run(["node", str(script), str(site), str(outside / "fixture.html"), TEST_PASSWORD, TEST_TITLE], check=True, timeout=120)
    return site


def submit(cdp: ct.CDP, text: str) -> None:
    cdp.js("(() => { const i = document.querySelector('#lock-pw'); i.value = ''; i.focus(); })()")
    cdp.call("Input.insertText", text=text)
    for kind in ("keyDown", "keyUp"):
        cdp.call("Input.dispatchKeyEvent", type=kind, key="Enter", code="Enter", windowsVirtualKeyCode=13, **({"text": "\r"} if kind == "keyDown" else {}))


def wait_for(cdp: ct.CDP, done, seconds: float) -> float:
    start = time.time()
    while time.time() - start < seconds and not done(cdp.js(STATE)):
        time.sleep(0.3)
    return time.time() - start


def run(cdp: ct.CDP, url: str, password: str, expect_title: str, fixture: bool, shots: Path) -> list:
    results = []
    cdp.viewport(1440, 780)
    cdp.call("Page.navigate", url=url)
    time.sleep(2.5)
    first = cdp.js(STATE)
    cdp.shot(shots / "잠김.png")
    results.append(ct.check("잠긴 쪽이 뜨고 비밀번호 칸이 있음", first["form"] and first["topbar"] and not first["marker"], f"{first['title']} · {first['note']}"))
    results.append(ct.check("잠긴 쪽에는 본문이 없음", first["chars"] < 1500, f"화면 글자 {first['chars']}자"))

    submit(cdp, "틀린 비밀번호를 열여섯 글자 넘게 넣어 봅니다")
    took = wait_for(cdp, lambda s: "×" in s["note"], 40)
    wrong = cdp.js(STATE)
    results.append(ct.check("틀린 비밀번호: 열리지 않고 알림이 뜸", wrong["form"] and "맞지 않습니다" in wrong["note"] and wrong["disabled"] is False, f"{wrong['note']} ({took:.1f}초)"))

    submit(cdp, password)
    took = wait_for(cdp, lambda s: not s["form"], 60)
    time.sleep(1.5)
    opened = cdp.js(STATE)
    cdp.shot(shots / "열림.png")
    results.append(ct.check("맞는 비밀번호: 자료가 그 자리에서 열림", not opened["form"] and not opened["topbar"] and expect_title in opened["title"], f"{opened['title']} · {took:.1f}초 · 화면 글자 {opened['chars']}자"))
    if fixture:
        for kind in ("keyDown", "keyUp"):
            cdp.call("Input.dispatchKeyEvent", type=kind, key="g", code="KeyG", windowsVirtualKeyCode=71, **({"text": "g"} if kind == "keyDown" else {}))
        time.sleep(0.3)
        results.append(ct.check("열린 자료의 스크립트와 글쇠 처리가 동작", opened["ran"] and "항목 3개" in opened["count"] and cdp.js(STATE)["key"] == "g", opened["count"]))
    kept = cdp.js("JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage)].map(k => k.filter(n => /pw|pass|lock|key/i.test(n))))")
    results.append(ct.check("비밀번호·열쇠를 브라우저에 저장하지 않음", kept == "[[],[]]", kept))
    cdp.call("Page.reload")
    time.sleep(2.5)
    again = cdp.js(STATE)
    results.append(ct.check("새로 고치면 다시 잠김", again["form"] and again["typed"] == 0 and not again["marker"]))
    results.append(ct.check("콘솔 오류 없음", not cdp.errors, "; ".join(cdp.errors[:3])))
    return results


def main() -> int:
    args = [a for i, a in enumerate(sys.argv[1:], start=1) if not a.startswith("--") and not sys.argv[i - 1].startswith("--")]
    temp = Path(tempfile.mkdtemp(prefix="lock-check-"))
    fixture = not args
    source = str(make_fixture_site(temp)) if fixture else args[0]
    page = "fixture.html" if fixture else args[1]
    password_file = option("--password-file")
    password = Path(password_file).read_text(encoding="utf-8").rstrip("\n") if password_file else TEST_PASSWORD
    local = "://" not in source
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(ct.Quiet, directory=source if local else "."))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = (f"http://127.0.0.1:{server.server_address[1]}" if local else source.rstrip("/")) + "/" + page
    chrome = subprocess.Popen([ct.CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
                               f"--user-data-dir={temp / 'profile'}", "--no-first-run", "--window-size=1440,900", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                break
            except OSError:
                time.sleep(0.2)
        cdp = ct.CDP(next(t for t in targets if t["type"] == "page")["webSocketDebuggerUrl"])
        for domain in ("Page", "Runtime", "Log"):
            cdp.call(f"{domain}.enable")
        shots = temp / "shots"
        shots.mkdir()
        print(f"여는 곳: {url}")
        results = run(cdp, url, password, option("--expect-title", TEST_TITLE), fixture, shots)
    finally:
        chrome.terminate()
        server.shutdown()
    print(f"결과: {results.count(True)}/{len(results)} 통과 · 화면 갈무리: {temp / 'shots'}")
    return 1 if False in results else 0


if __name__ == "__main__":
    sys.exit(main())
