#!/usr/bin/env python3
"""data/feeds.json 의 RSS·Atom 출처에서 새 글 제목·링크·날짜만 모아 data/feed.json 을 만든다(본문은 가져오지 않음).
GitHub Actions(.github/workflows/collect.yml)가 매일 아침 돌린다. 표준 라이브러리만 쓴다."""
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
PER_SOURCE, TOTAL = 8, 60
UA = "Mozilla/5.0 (compatible; pinking-archive-feed/1.0; +https://pinking-jeong.github.io/)"


def local(el):
    return el.tag.rsplit("}", 1)[-1] if isinstance(el.tag, str) else ""


def text(el, *names):
    """이름공간을 무시하고 자식 요소를 찾아 글자(또는 href)를 돌려준다."""
    for n in names:
        for ch in el:
            if local(ch) == n:
                v = (ch.text or "").strip() or ch.get("href", "")
                if v:
                    return v
    return ""


def when(s):
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(KST)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(KST)
    except ValueError:
        return None


def fetch(src):
    req = urllib.request.Request(src["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    raw = raw.lstrip(b"\xef\xbb\xbf \t\r\n")
    raw = re.sub(rb"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)\w+;", b" ", raw)   # HTML 전용 이름(&nbsp; 등)은 빈칸으로
    root = ET.fromstring(raw)
    out = []
    for it in (e for e in root.iter() if local(e) in ("item", "entry")):
        title = re.sub(r"\s+", " ", text(it, "title"))
        link = text(it, "link")
        if not link.startswith("http"):   # Atom: <link rel="alternate" href=...>
            link = next((ch.get("href", "") for ch in it if local(ch) == "link" and ch.get("rel", "alternate") == "alternate"), link)
        d = when(text(it, "pubDate", "published", "updated", "date"))
        if title and link.startswith("http"):
            out.append({"title": title[:200], "link": link, "source": src["name"],
                        "date": d.strftime("%Y.%m.%d") if d else "", "_ts": d.timestamp() if d else 0})
    return out[:PER_SOURCE]


def main():
    srcs = json.loads((ROOT / "data" / "feeds.json").read_text(encoding="utf-8"))
    items, errors = [], []
    for s in srcs:
        try:
            items += fetch(s)
        except Exception as e:   # 한 출처가 막혀도 나머지는 모은다
            errors.append(f"{s['name']}: {type(e).__name__}")
    items.sort(key=lambda x: x["_ts"], reverse=True)
    for x in items:
        x.pop("_ts", None)
    out = {"updated": datetime.now(KST).strftime("%Y.%m.%d %H:%M"), "items": items[:TOTAL], "errors": errors}
    (ROOT / "data" / "feed.json").write_bytes(json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8"))
    print(f"{len(items)} items, errors: {errors}")


if __name__ == "__main__":
    main()
