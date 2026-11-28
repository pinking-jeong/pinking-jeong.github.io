#!/usr/bin/env python3
"""자동 넘김(assets/tour.js)을 크롬에서 실제 시간으로 돌려 확인한다(헤드리스 크롬 + 원격 디버깅, 맥 기준 경로).

사용: uv run --no-project --with websocket-client python scripts/check_tour.py [사이트 폴더 또는 주소] [화면 저장 폴더] [--page=motion.html] [--quick]
- 아무것도 안 적으면 이 저장소를 임시 서버로 띄워 index.html 의 전 과정을 본다(한 바퀴 + 멈춤·다시 재생·단추 자리 등, 2~3분).
- --page 로 볼 쪽을 고른다(기본 index.html). 쇼릴·스크롤 장면·글자 폭은 그 쪽에 있을 때만 본다.
- https:// 주소를 적으면 그 주소를 연다. --quick 은 처음 10초(스스로 내려가는지, 휠에 멈추는지)만 본다.
필요한 것: Google Chrome, websocket-client(위 명령이 임시로 받아 쓴다)."""
import base64
import functools
import http.server
import json
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9377
STATE = """(() => { const q = s => document.querySelector(s), t = s => (q(s) || {}).textContent || "", b = q(".auto-btn");
  return { y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight), on: !!b && b.getAttribute("aria-pressed") === "true", name: b ? b.getAttribute("aria-label") : null,
    btn: b ? b.textContent : null, sc: t(".hud .sc"), reel: t(".rtime").slice(0, 8), story: t(".st-pct"), wdth: t(".wdth-label").slice(0, 8),
    wipe: (q(".wipe") || {}).className || "", heroIn: !!q(".hero.in"), loader: !!q(".loader") }; })()"""
PARTS = """(() => { const has = s => !!document.querySelector(s);
  return { scenes: document.querySelectorAll("[data-scene]").length, hero: has(".hero"), reel: has(".reel"), story: has(".story"), type: has(".wdth-wrap") }; })()"""
RECTS = """(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)] : null; };
  const nav = document.querySelector(".topbar nav"), navShown = nav && getComputedStyle(nav).position !== "fixed";
  return { vw: document.documentElement.clientWidth, brand: r(".topbar .brand"), small: r(".topbar .brand small"), btn: r(".auto-btn"), right: navShown ? r(".topbar nav") : r(".menu-btn"), row: r(".topbar .row") }; })()"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass


class CDP:
    def __init__(self, url: str) -> None:
        self.ws = websocket.create_connection(url, timeout=30)
        self.n = 0
        self.errors: list = []

    def call(self, method: str, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if msg.get("method") == "Runtime.exceptionThrown":
                self.errors.append(msg["params"]["exceptionDetails"].get("exception", {}).get("description", "예외")[:200])
            if msg.get("method") == "Log.entryAdded" and msg["params"]["entry"].get("level") == "error":
                self.errors.append(msg["params"]["entry"].get("text", "")[:200])

    def js(self, expression: str):
        got = self.call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in got:
            raise RuntimeError(str(got["exceptionDetails"])[:300])
        return got["result"].get("value")

    def state(self) -> dict:
        return self.js(STATE)

    def shot(self, path: Path) -> None:
        path.write_bytes(base64.b64decode(self.call("Page.captureScreenshot", format="png")["data"]))

    def viewport(self, width: int, height: int, mobile: bool = False) -> None:
        self.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=mobile)

    def click(self, x: float, y: float) -> None:
        for kind in ("mousePressed", "mouseReleased"):
            self.call("Input.dispatchMouseEvent", type=kind, x=x, y=y, button="left", clickCount=1)

    def click_button(self) -> None:
        left, right, top, bottom = self.js(RECTS)["btn"]
        self.click((left + right) / 2, (top + bottom) / 2)


def watch(cdp: CDP, seconds: float, until=None, every: float = 0.5, echo: float = 0.0) -> list:
    """seconds 초 동안(또는 until 이 참이 될 때까지) 상태를 모은다."""
    rows, start, last_echo = [], time.time(), -99.0
    while time.time() - start < seconds:
        s = cdp.state()
        s["t"] = round(time.time() - start, 1)
        rows.append(s)
        if echo and s["t"] - last_echo >= echo:
            last_echo = s["t"]
            print(f"   {s['t']:5.1f}s  y={s['y']:>5}/{s['max']}  {s['sc']:<10} 쇼릴 {s['reel']:<8} {s['story']:<11} {s['wdth']:<8} 단추 {s['btn']}  {'넘김 막' if 'cover' in s['wipe'] else ''}")
        if until and until(rows):
            break
        time.sleep(every)
    return rows


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"[{'통과' if ok else '실패'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def quick_check(cdp: "CDP", url: str) -> list:
    """처음 10초만: 단추가 생기고, 스스로 내려가고, 휠에 멈추는가."""
    cdp.call("Page.navigate", url=url)
    rows = watch(cdp, 10.0, until=lambda rs: rs[-1]["y"] > 300)
    first = [check("단추가 생기고 스스로 내려감", rows[-1]["btn"] == "❚❚" and rows[-1]["y"] > 300, f"{rows[-1]['t']}초에 y={rows[-1]['y']}")]
    cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=120)
    time.sleep(1.2)
    still = watch(cdp, 3.0)
    return first + [check("휠에 멈추고 그 자리에 있음", not still[0]["on"] and len({r["y"] for r in still}) == 1, f"y={still[-1]['y']} 단추 {still[-1]['btn']}"),
                    check("콘솔 오류 없음", not cdp.errors, "; ".join(cdp.errors[:3]))]


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    quick = "--quick" in sys.argv
    source = args[0] if args else str(Path(__file__).resolve().parent.parent)
    out = Path(args[1]) if len(args) > 1 else Path(tempfile.mkdtemp(prefix="tour-shots-"))
    out.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=source if "://" not in source else "."))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    page_name = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--page=")), "index.html")
    url = source if "://" in source else f"http://127.0.0.1:{server.server_address[1]}/{page_name}"
    print(f"여는 곳: {url} · 화면 저장: {out}")
    profile = tempfile.mkdtemp(prefix="tour-check-")
    chrome = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
                               f"--user-data-dir={profile}", "--no-first-run", "--window-size=1440,900", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = []
    try:
        for _ in range(50):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                break
            except OSError:
                time.sleep(0.2)
        page = next(t for t in targets if t["type"] == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        for domain in ("Page", "Runtime", "Log"):
            cdp.call(f"{domain}.enable")
        cdp.viewport(1440, 780)
        if quick:
            results = quick_check(cdp, url)
            failed = results.count(False)
            print(f"\n결과: {len(results) - failed}/{len(results)} 통과")
            return 1 if failed else 0

        print("== A. 처음 열기 → 맨 아래 → 맨 위로 돌아와 다시 시작 (1440×780)")
        cdp.call("Page.navigate", url=url)
        time.sleep(0.4)

        def looped(rows: list) -> bool:   # 맨 아래를 찍고, 맨 위로 돌아온 뒤, 다시 내려가기 시작했는가
            bottom = next((i for i, r in enumerate(rows) if r["max"] > 0 and r["y"] >= r["max"] - 2), None)
            if bottom is None:
                return False
            home = next((i for i in range(bottom, len(rows)) if rows[i]["y"] == 0), None)
            return home is not None and any(r["y"] > 200 for r in rows[home:])

        shots = {3.0: "A_첫화면", 12.0: "A_쇼릴", 30.0: "A_스크롤장면"}
        rows, started = [], time.time()
        while time.time() - started < 110:
            part = watch(cdp, 1.5, echo=0.0)
            for r in part:
                r["t"] = round(r["t"] + (rows[-1]["t"] + 0.5 if rows else 0), 1)
            rows += part
            now = rows[-1]
            print(f"   {now['t']:5.1f}s  y={now['y']:>5}/{now['max']}  {now['sc']:<10} 쇼릴 {now['reel']:<8} {now['story']:<11} {now['wdth']:<8} 단추 {now['btn']}  {'넘김 막' if 'cover' in now['wipe'] else ''}")
            for at, name in list(shots.items()):
                if now["t"] >= at:
                    cdp.shot(out / f"{name}.png")
                    del shots[at]
            if looped(rows):
                break
        parts = cdp.js(PARTS)
        seen = sorted({r["sc"][:5] for r in rows if r["sc"]})
        bottom_i = next((i for i, r in enumerate(rows) if r["max"] > 0 and r["y"] >= r["max"] - 2), None)
        before_bottom = rows[: bottom_i + 1] if bottom_i is not None else rows
        ys = [r["y"] for r in before_bottom]
        results += [
            check("단추가 생기고 재생 중에는 ❚❚ 표시", all(r["btn"] == "❚❚" for r in rows if r["on"]) and any(r["on"] for r in rows)),
            check("손대지 않아도 맨 아래까지 내려감", bottom_i is not None, f"{rows[bottom_i]['t']}초에 도착" if bottom_i is not None else f"끝 위치 {rows[-1]['y']}/{rows[-1]['max']}"),
            check("내려가는 동안 뒤로 가지 않음", all(b >= a - 2 for a, b in zip(ys, ys[1:]))),
            check(f"장면 {parts['scenes']}개를 모두 거침", len(seen) == parts["scenes"], " ".join(seen)),
            check("맨 아래에서 넘김 막을 치고 맨 위로 돌아와 다시 시작", looped(rows), f"전체 {rows[-1]['t']}초"),
        ]
        if parts["reel"]:
            results.append(check("쇼릴을 끝까지 재생", any(r["reel"] >= "00:14.0" for r in rows), "본 가장 늦은 시각 " + max(r["reel"] for r in rows)))
        if parts["story"]:
            results.append(check("스크롤 장면을 100%까지 훑음", any("100%" in r["story"] for r in rows)))
        if parts["type"]:
            results.append(check("TYPE 글자 폭이 움직임", len({r["wdth"] for r in rows}) > 3, f"{len({r['wdth'] for r in rows})}가지 값"))
        cdp.shot(out / "A_돌아온뒤.png")

        print("== B. 휠을 굴리면 멈춤")
        cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=120)
        time.sleep(1.2)
        still = watch(cdp, 4.0)
        results.append(check("휠 한 번에 멈추고 ▶ 로 바뀜", not still[0]["on"] and still[0]["btn"].startswith("▶")))
        results.append(check("멈춘 뒤에는 스스로 움직이지 않음", len({r["y"] for r in still}) == 1, f"y={still[-1]['y']}"))

        print("== C. 단추를 누르면 지금 장면부터 다시 재생")
        at = cdp.state()["y"]
        cdp.click_button()
        again = watch(cdp, 9.0, until=lambda rs: rs[-1]["y"] != at)
        results.append(check("단추로 다시 재생(지금 장면의 처음부터)", again[0]["on"] and again[0]["btn"] == "❚❚" and again[-1]["y"] != at, f"y {at} → {again[-1]['y']} · {again[-1]['sc']}"))

        print("== D. 방향키·화면 누르기로도 멈춤")
        cdp.call("Input.dispatchKeyEvent", type="keyDown", key="ArrowDown", code="ArrowDown", windowsVirtualKeyCode=40)
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key="ArrowDown", code="ArrowDown", windowsVirtualKeyCode=40)
        time.sleep(0.5)
        results.append(check("방향키에 멈춤", not cdp.state()["on"]))
        cdp.click_button()
        time.sleep(0.6)
        on_again = cdp.state()["on"]
        cdp.click(700, 420)
        time.sleep(0.5)
        results.append(check("화면을 누르면 멈춤", on_again and not cdp.state()["on"]))
        cdp.click_button()
        time.sleep(0.4)
        cdp.click_button()
        time.sleep(0.4)
        results.append(check("단추를 다시 누르면 멈춤(단추 자신은 '손으로 움직임'으로 치지 않음)", not cdp.state()["on"]))

        cdp.js("document.querySelector('.auto-btn').focus()")
        cdp.call("Input.dispatchKeyEvent", type="keyDown", key=" ", code="Space", windowsVirtualKeyCode=32, text=" ")
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key=" ", code="Space", windowsVirtualKeyCode=32)
        time.sleep(0.5)
        space_on = cdp.state()["on"]
        cdp.call("Input.dispatchKeyEvent", type="keyDown", key=" ", code="Space", windowsVirtualKeyCode=32, text=" ")
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key=" ", code="Space", windowsVirtualKeyCode=32)
        time.sleep(0.5)
        results.append(check("단추에 초점을 두고 스페이스: 한 번에 재생, 또 한 번에 멈춤", space_on and not cdp.state()["on"]))

        print("== D2. 그 밖의 움직임에도 멈춤: Tab 이동 · 스크립트/찾기 등으로 화면이 옮겨짐 · 재생 직후의 남은 휠")
        cdp.click_button()
        time.sleep(0.7)
        tab_on = cdp.state()["on"]
        cdp.call("Input.dispatchKeyEvent", type="keyDown", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        cdp.call("Input.dispatchKeyEvent", type="keyUp", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        time.sleep(0.4)
        results.append(check("Tab 글쇠에 멈춤", tab_on and not cdp.state()["on"]))
        cdp.js("document.activeElement && document.activeElement.blur()")
        cdp.click_button()
        time.sleep(0.9)
        moved_on = cdp.state()["on"]
        cdp.js("scrollBy({ top: 260, behavior: 'instant' })")   # 페이지 내 찾기·초점 이동·스크롤 막대처럼, 입력 이벤트 없이 화면만 옮겨진 경우
        time.sleep(0.5)
        after_move = watch(cdp, 2.5)
        results.append(check("입력 이벤트 없이 화면이 옮겨져도 멈추고, 옮겨진 자리를 그대로 둠", moved_on and not after_move[0]["on"] and len({r["y"] for r in after_move}) == 1,
                             f"y={after_move[-1]['y']}"))
        cdp.click_button()
        cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=40)   # 단추를 누른 직후에 남아 있던 관성 휠
        time.sleep(0.25)
        early = cdp.state()["on"]
        time.sleep(0.6)
        cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=40)
        time.sleep(0.5)
        results.append(check("재생 직후 0.4초 안의 남은 휠은 봐주고, 그 뒤의 휠에는 멈춤", early and not cdp.state()["on"]))
        results.append(check("단추 이름은 '자동 넘김'으로 고정, 켜짐·꺼짐은 따로 알림", cdp.state()["name"] == "자동 넘김"))

        print("== E. 되풀이를 끈 경우: 맨 아래에서 다시 재생 → 첫 화면으로 돌아와 멈춤")
        cdp.js("window.SITE.autoScrollLoop = false; scrollTo({ top: 1e9, behavior: 'instant' })")
        time.sleep(0.5)
        cdp.click_button()
        end = watch(cdp, 12.0, until=lambda rs: rs[-1]["y"] == 0 and not rs[-1]["on"])
        final = end[-1]
        results.append(check("맨 위로 돌아와 멈춤", final["y"] == 0 and not final["on"] and (final["heroIn"] or not parts["hero"]) and "gone" in final["wipe"],
                             f"y={final['y']} 단추 {final['btn']} 막 {final['wipe']}"))
        results.append(check("넘김 막이 실제로 덮였다가 걷힘", any("cover" in r["wipe"] for r in end)))
        cdp.js("window.SITE.autoScrollLoop = true")

        print("== F. 넘김 막이 덮이는 도중에 휠을 굴리면 막을 걷고 멈춤")
        cdp.js("scrollTo({ top: 1e9, behavior: 'instant' })")
        time.sleep(0.4)
        cdp.click_button()
        mid = watch(cdp, 8.0, until=lambda rs: "cover" in rs[-1]["wipe"], every=0.1)
        cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=-60)
        time.sleep(1.3)
        after = cdp.state()
        results.append(check("막이 걷히고 그 자리에 멈춤", "cover" in mid[-1]["wipe"] and "gone" in after["wipe"] and not after["on"] and after["y"] > after["max"] * .5,
                             f"y={after['y']} 막 {after['wipe']}"))

        print("== G. 위 막대에서 단추가 다른 것과 겹치지 않는지")
        for width, height, mobile in ((1440, 780, False), (1024, 700, False), (900, 700, False), (800, 700, False), (768, 1024, True), (761, 700, False), (760, 700, False),
                                      (480, 760, True), (390, 760, True), (360, 740, True), (320, 640, True)):
            cdp.viewport(width, height, mobile)
            time.sleep(0.35)
            r = cdp.js(RECTS)
            left_edge = (r["small"] or r["brand"])[1]
            gap_left, gap_right = r["btn"][0] - left_edge, r["right"][0] - r["btn"][1]
            centered = abs((r["btn"][0] + r["btn"][1]) / 2 - r["vw"] / 2) <= 1.5
            results.append(check(f"폭 {width}: 가운데에 있고 양옆과 떨어져 있음", centered and gap_left >= 6 and gap_right >= 6, f"왼쪽 틈 {gap_left}px · 오른쪽 틈 {gap_right}px"))
            if width in (1440, 390):
                cdp.js("scrollTo({ top: 0, behavior: 'instant' })")
                time.sleep(0.3)
                cdp.shot(out / f"G_위막대_{width}.png")

        print("== H. '움직임 줄이기'를 켠 사용자: 단추도 자동 넘김도 없음")
        cdp.viewport(1440, 780)
        cdp.call("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "reduce"}])
        cdp.call("Page.navigate", url=url)
        calm = watch(cdp, 6.0)
        results.append(check("단추 없음 · 움직이지 않음", all(r["btn"] is None and r["y"] == 0 for r in calm[2:])))
        cdp.call("Emulation.setEmulatedMedia", features=[])

        print("== I. 중간까지 내린 채 새로 고침: 스스로 시작하지 않음")
        cdp.call("Page.navigate", url=url)
        time.sleep(2.5)
        cdp.call("Input.dispatchMouseEvent", type="mouseWheel", x=700, y=400, deltaX=0, deltaY=900)
        time.sleep(1.5)
        cdp.call("Page.reload")
        time.sleep(1.0)
        held = watch(cdp, 7.0)
        results.append(check("내려 둔 자리에서 가만히 있고 ▶ 표시", held[-1]["y"] > 300 and len({r["y"] for r in held[4:]}) == 1 and not held[-1]["on"] and (held[-1]["btn"] or "").startswith("▶"),
                             f"y={held[-1]['y']} 단추 {held[-1]['btn']}"))

        results.append(check("콘솔 오류 없음", not cdp.errors, "; ".join(cdp.errors[:3])))
    finally:
        chrome.terminate()
        server.shutdown()
    failed = results.count(False)
    print(f"\n결과: {len(results) - failed}/{len(results)} 통과")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
