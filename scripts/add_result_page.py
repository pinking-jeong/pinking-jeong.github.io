#!/usr/bin/env python3
"""영상 작업 폴더의 「결과보기.html」을 이 사이트에 올릴 가벼운 사본으로 만든다.

사용: python scripts/add_result_page.py <결과보기.html> <slug> [선택 사항]
  --drop 패턴        이 패턴에 맞는 로컬 링크는 단추째 뺀다(여러 번 쓸 수 있음). 예: --drop "*.md"
  --replace 옛=새    글자를 바꾼다(여러 번 쓸 수 있음). 옛 글자가 화면에 없으면 멈춘다.
  --forbid 글자      사본에 이 글자가 남아 있으면 멈춘다(여러 번 쓸 수 있음).
  --site-root 폴더   사이트 폴더(기본: 이 저장소). 올리기 전에 다른 곳에서 미리 볼 때 쓴다.

하는 일
- 화면이 끌어다 쓰는 로컬 파일만 animation/<slug>/media/ 로 옮긴다. 파일 이름은 숫자로 바꾼다
  (한글 파일 이름은 맥과 서버의 글자 조합 방식이 달라 링크가 끊길 수 있다).
- 그림은 모두 JPEG 로 다시 저장하고(긴 변 2560 이하), 영상은 웹용 H.264 로 다시 인코딩한다.
  다시 저장하면서 촬영 정보 같은 메타데이터는 옮기지 않는다.
- 그 밖의 파일(문서·다른 화면 등)이 걸려 있으면 멈춘다. 올리지 않을 것은 --drop 으로 뺀다.
- 단추 줄 맨 앞에 성과물 목록으로 돌아가는 단추를 넣는다(화면에 이미 있는 단추 모양 그대로).
- 사본을 다 만든 뒤 다시 읽어, 로컬 주소가 media/ 의 파일만 가리키는지 확인한다. 이 스크립트가
  읽지 못하는 표기(srcset, CSS url(), 작은따옴표 등)로 걸린 주소가 남아 있으면 멈춘다.
- 같은 이름의 사본이 있으면 새것으로 바꾼다. 이 스크립트가 만든 사본이 아니면 건드리지 않는다.

필요한 것: Python 3.9 이상, Pillow, imageio-ffmpeg.
"""
import argparse
import fnmatch
import html
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple, Optional
from urllib.parse import unquote

try:
    from PIL import Image
except ImportError:
    sys.exit("실패: Pillow 가 필요하다(이 맥에서는 ~/.venvs/research/bin/python 으로 돌린다)")

SITE_ROOT = Path(__file__).resolve().parent.parent
SITE_SIGN = "works.html"   # 사이트 폴더가 맞는지 확인하는 표시이자 돌아가기 단추의 목적지
SECTION_DIR = "animation"
MEDIA_DIR = "media"
BACK_HREF = f"../../{SITE_SIGN}"
BACK_PILL = f'<a class="pill" href="{BACK_HREF}"><i>←</i>성과물 목록</a>'
PILLS_OPEN = '<div class="pills">'
MARKER = "<!-- scripts/add_result_page.py 가 만든 웹용 사본. 직접 고치지 말고 원본 화면을 고친 뒤 다시 만든다. -->\n"

SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,40}")
ATTR_RE = re.compile(r'\b(src|href|poster)="([^"]*)"')
REMOTE_RE = re.compile(r"(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//|#)")
MEDIA_RE = re.compile(rf"{MEDIA_DIR}/\d+\.(?:jpg|mp4)")
CSS_FETCH_RE = re.compile(r"url\(\s*['\"]?(?!data:|#)|@import", re.I)
REF_ATTRS = ("src", "href", "poster")
UNREAD_ATTRS = ("srcset", "data", "background", "action", "formaction", "xlink:href", "data-src")

MAX_IMAGE_SIDE = 2560
JPEG_QUALITY = 90
IMAGE_FORMATS = {"PNG", "JPEG", "WEBP"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".mkv"}
VIDEO_CRF = "20"
VIDEO_PRESET = "slow"
AUDIO_BITRATE = "160k"
ENCODE_TIMEOUT_SEC = 1800
WARN_FILE_BYTES = 50 * 1000 * 1000    # GitHub 가 경고하는 크기
MAX_FILE_BYTES = 100 * 1000 * 1000    # GitHub 가 받지 않는 크기


class Asset(NamedTuple):
    ref: str    # 화면에 적힌 그대로의 주소
    kind: str   # "drop" | "image" | "video"
    out: str    # 사본에서 쓸 상대 주소(drop 이면 빈 글자)


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def is_local(ref: str) -> bool:
    return bool(ref) and not REMOTE_RE.match(ref)


def find_local_refs(page: str) -> list[str]:
    """화면이 끌어다 쓰는 로컬 주소를 처음 나온 순서대로, 겹치지 않게 돌려준다."""
    seen: list[str] = []
    for _, ref in ATTR_RE.findall(page):
        if is_local(ref) and ref not in seen:
            seen.append(ref)
    return seen


def ref_to_path(ref: str) -> str:
    """화면에 적힌 주소를 파일 경로로 바꾼다(&amp; 와 %EC… 풀기, ?·# 뒤는 버림)."""
    return unquote(html.unescape(ref).split("#", 1)[0].split("?", 1)[0])


def matches_any(path: str, patterns: list[str]) -> bool:
    """대소문자와 한글 조합 방식(NFC·NFD)을 가리지 않고 패턴에 맞는지 본다."""
    plain = nfc(path).lower()
    return any(fnmatch.fnmatchcase(plain, nfc(pattern).lower()) for pattern in patterns)


def plan_assets(refs: list[str], drops: list[str]) -> list[Asset]:
    """주소마다 무엇을 할지 정한다. 어떻게 할지 모르는 종류가 있으면 멈춘다."""
    assets, unknown = [], []
    for number, ref in enumerate(refs, start=1):
        path = ref_to_path(ref)
        ext = os.path.splitext(path)[1].lower()
        if matches_any(path, drops):
            assets.append(Asset(ref, "drop", ""))
        elif ext in IMAGE_EXTS:
            assets.append(Asset(ref, "image", f"{MEDIA_DIR}/{number:02d}.jpg"))
        elif ext in VIDEO_EXTS:
            assets.append(Asset(ref, "video", f"{MEDIA_DIR}/{number:02d}.mp4"))
        else:
            unknown.append(ref)
    if unknown:
        raise ValueError("어떻게 올릴지 정해지지 않은 파일이 걸려 있다(올리지 않으려면 --drop): " + ", ".join(unknown))
    return assets


def rewrite_page(page: str, assets: list[Asset]) -> str:
    """뺄 링크는 단추째 지우고, 나머지 로컬 주소는 사본의 주소로 바꾼다. 옛 주소가 어디든 남으면 멈춘다."""
    mapping = {a.ref: a.out for a in assets if a.kind != "drop"}
    for asset in assets:
        if asset.kind != "drop":
            continue
        anchor = re.compile(  # 닫는 </a> 를 못 찾아 다른 링크까지 삼키지 않도록 안쪽에 <a 가 없어야 한다
            r'<a\b[^>]*\bhref="' + re.escape(asset.ref) + r'"[^>]*>(?:(?!<a\b).)*?</a>\s*', re.S)
        page, removed = anchor.subn("", page)
        if removed == 0:
            raise ValueError(f"빼려는 주소가 온전한 링크(<a href>…</a>)가 아니라서 지울 수 없다: {asset.ref}")

    def swap(match: re.Match) -> str:
        name, ref = match.group(1), match.group(2)
        return f'{name}="{mapping[ref]}"' if ref in mapping else match.group(0)

    page = ATTR_RE.sub(swap, page)
    left = [a.ref for a in assets if a.ref in page]
    if left:
        raise ValueError("옛 주소가 화면의 다른 곳(본문·스크립트·다른 속성)에 남아 있다: " + ", ".join(left))
    return page


def apply_replacements(page: str, pairs: list[tuple[str, str]]) -> str:
    """글자를 차례로 바꾼다. 바꿀 글자가 없으면 멈춘다(오타로 아무것도 안 바뀌는 일을 막는다)."""
    for old, new in pairs:
        if old not in page:
            raise ValueError(f"바꾸려는 글자가 화면에 없다: {old!r}")
        page = page.replace(old, new)
    return page


def check_forbidden(page: str, words: list[str]) -> None:
    """남으면 안 되는 글자를 찾는다. 대소문자·한글 조합 방식·&#…; 표기를 가리지 않는다."""
    haystacks = [nfc(page).casefold(), nfc(html.unescape(page)).casefold()]
    left = [word for word in words if any(nfc(word).casefold() in hay for hay in haystacks)]
    if left:
        raise ValueError("사본에 남으면 안 되는 글자가 남아 있다: " + ", ".join(left))


def add_back_link(page: str) -> str:
    """단추 줄 맨 앞에 성과물 목록으로 가는 단추를 넣는다."""
    if PILLS_OPEN not in page:
        raise ValueError(f"돌아가기 단추를 넣을 자리({PILLS_OPEN})가 화면에 없다")
    return page.replace(PILLS_OPEN, PILLS_OPEN + BACK_PILL + "\n", 1)


def add_marker(page: str) -> str:
    head, sep, rest = page.partition("\n")
    return head + sep + MARKER + rest if head.lower().startswith("<!doctype") else MARKER + page


def parse_pair(text: str) -> tuple[str, str]:
    old, sep, new = text.partition("=")
    if not sep or not old:
        raise ValueError(f"--replace 는 옛=새 모양으로 적는다: {text!r}")
    return old, new


class PageScan(HTMLParser):
    """모든 태그의 모든 속성을 훑어, 로컬 주소와 이 스크립트가 다루지 못하는 표기를 모은다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []
        self.problems: list[str] = []
        self._in_style = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        self._in_style = tag == "style"
        for name, raw in attrs:
            value = (raw or "").strip()
            if value.lower().startswith("file:"):
                self.problems.append(f"<{tag} {name}> 에 file: 주소")
            elif name in REF_ATTRS and is_local(value):
                self.refs.append(value)
            elif name in UNREAD_ATTRS and value:
                self.problems.append(f"<{tag} {name}> 는 이 스크립트가 옮기지 못한다")
            if name == "style" and CSS_FETCH_RE.search(value):
                self.problems.append(f"<{tag} style> 안의 url()·@import")

    def handle_endtag(self, tag: str) -> None:
        if tag == "style":
            self._in_style = False

    def handle_data(self, data: str) -> None:
        if self._in_style and CSS_FETCH_RE.search(data):
            self.problems.append("<style> 안의 url()·@import")


def scan_page(page: str) -> list[str]:
    """사본이 쓰는 로컬 주소를 돌려준다. 허용된 주소(media/숫자.jpg·mp4, 돌아가기)가 아니면 멈춘다."""
    scan = PageScan()
    scan.feed(page)
    scan.close()
    bad = [ref for ref in scan.refs if ref != BACK_HREF and not MEDIA_RE.fullmatch(ref)]
    problems = scan.problems + [f"허용되지 않은 로컬 주소 {ref}" for ref in bad]
    if problems:
        raise ValueError("사본에 올리면 안 되거나 끊길 주소가 있다: " + "; ".join(sorted(set(problems))))
    return [ref for ref in dict.fromkeys(scan.refs) if ref != BACK_HREF]


def save_jpeg(source: Path, target: Path) -> None:
    """그림을 열어 JPEG 로 다시 저장한다. 색 프로파일만 옮기고 촬영 정보 등은 옮기지 않는다."""
    with Image.open(source) as opened:
        if opened.format not in IMAGE_FORMATS:
            raise ValueError(f"그림 파일이 아니거나 다루지 않는 형식이다({opened.format}): {source.name}")
        icc = opened.info.get("icc_profile")
        if opened.mode in ("RGBA", "LA", "PA") or "transparency" in opened.info:
            rgba = opened.convert("RGBA")
            image = Image.new("RGB", rgba.size, "white")   # 투명한 곳은 흰 바탕으로
            image.paste(rgba, mask=rgba.getchannel("A"))
        else:
            image = opened.convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
    extra = {"icc_profile": icc} if icc else {}
    image.save(target, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, **extra)


def encode_video(source: Path, target: Path) -> None:
    """웹용 H.264 로 다시 인코딩한다. 제목·설명 같은 메타데이터와 챕터는 옮기지 않는다."""
    try:
        import imageio_ffmpeg
    except ImportError as error:
        raise RuntimeError("영상을 옮기려면 imageio-ffmpeg 가 필요하다") from error
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", str(source.resolve()), "-map", "0:v:0", "-map", "0:a:0?",
        "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1",
        "-c:v", "libx264", "-preset", VIDEO_PRESET, "-crf", VIDEO_CRF, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", AUDIO_BITRATE, "-movflags", "+faststart", str(target.resolve()),
    ]
    done = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                          timeout=ENCODE_TIMEOUT_SEC)
    if done.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
        raise RuntimeError(f"영상 인코딩 실패({source.name}): {done.stderr.strip()[-600:]}")


def resolve_source(source_dir: Path, ref: str) -> Path:
    """주소가 가리키는 파일을 찾는다. 작업 폴더 밖의 파일과 심볼릭 링크는 올리지 않는다."""
    plain = Path(os.path.abspath(source_dir / ref_to_path(ref)))
    real = plain.resolve()
    if source_dir not in real.parents:
        raise ValueError(f"작업 폴더 밖의 파일은 올리지 않는다: {ref}")
    if plain != real:
        raise ValueError(f"심볼릭 링크는 올리지 않는다: {ref}")
    if not real.is_file():
        raise FileNotFoundError(f"화면이 가리키는 파일이 없다: {ref}")
    return real


def export_assets(assets: list[Asset], used: set[str], source_dir: Path, out_dir: Path) -> None:
    """사본이 실제로 쓰는 파일만 옮긴다(뺀 단추 안에만 있던 그림은 옮기지 않는다)."""
    for asset in assets:
        if asset.kind == "drop" or asset.out not in used:
            continue
        source = resolve_source(source_dir, asset.ref)
        if asset.kind == "image":
            save_jpeg(source, out_dir / asset.out)
        else:
            encode_video(source, out_dir / asset.out)


def check_output(out_dir: Path) -> list[tuple[int, str]]:
    """사본을 다시 읽어 주소·파일이 서로 맞는지 확인하고, (크기, 이름) 목록을 돌려준다."""
    refs = scan_page((out_dir / "index.html").read_text(encoding="utf-8"))
    files = {path.relative_to(out_dir).as_posix() for path in out_dir.rglob("*") if path.is_file()}
    missing, orphan = sorted(set(refs) - files), sorted(files - set(refs) - {"index.html"})
    if missing or orphan:
        raise ValueError(f"사본의 주소와 파일이 맞지 않는다 — 끊긴 주소: {missing}, 쓰이지 않는 파일: {orphan}")
    sizes = sorted(((out_dir / name).stat().st_size, name) for name in files)
    too_big = [name for size, name in sizes if size > MAX_FILE_BYTES]
    if too_big:
        raise ValueError("100MB 를 넘는 파일은 GitHub 에 올릴 수 없다: " + ", ".join(too_big))
    return sizes


def is_made_by_script(folder: Path) -> bool:
    index = folder / "index.html"
    return index.is_file() and MARKER.strip() in index.read_text(encoding="utf-8", errors="replace")


def check_site(site_root: Path, slug: str) -> Path:
    """사본을 둘 자리를 돌려준다. 사이트 폴더가 아니거나 남이 만든 폴더가 그 자리에 있으면 멈춘다."""
    if not SLUG_RE.fullmatch(slug):
        raise ValueError(f"slug 는 영문 소문자·숫자·하이픈으로 2~41자: {slug!r}")
    if not (site_root / SITE_SIGN).is_file():
        raise ValueError(f"사이트 폴더가 아니다({SITE_SIGN} 이 없음): {site_root}")
    section = site_root / SECTION_DIR
    final = section / slug
    if section.is_symlink() or final.is_symlink():
        raise ValueError(f"심볼릭 링크로 된 자리에는 만들지 않는다: {final}")
    if final.exists() and not is_made_by_script(final):
        raise ValueError(f"이 스크립트가 만든 사본이 아니라서 바꾸지 않는다: {final}")
    return final


def swap_in(temp: Path, final: Path) -> None:
    """새 사본을 제자리에 놓는다. 놓지 못하면 옛 사본을 되돌린다."""
    old = final.with_name(f".{final.name}.old")
    if old.exists():
        if final.exists():
            shutil.rmtree(old)    # 지난번 교체 뒤 치우지 못한 옛 사본
        else:
            old.rename(final)     # 지난번 교체가 중간에 멈췄다 → 옛 사본부터 되돌린다
    if final.exists():
        final.rename(old)
    try:
        temp.rename(final)
    except OSError:
        if old.exists():
            old.rename(final)
        raise
    shutil.rmtree(old, ignore_errors=True)


def build(source_html: Path, slug: str, site_root: Path, drops: list[str],
          pairs: list[tuple[str, str]], forbidden: list[str]) -> Path:
    final = check_site(site_root, slug)
    source_dir = source_html.resolve().parent
    page = nfc(source_html.read_text(encoding="utf-8"))
    assets = plan_assets(find_local_refs(page), drops)
    page = add_marker(add_back_link(apply_replacements(rewrite_page(page, assets), pairs)))
    check_forbidden(page, forbidden)
    used = set(scan_page(page))

    temp = final.with_name(f".{slug}.part")
    if temp.exists():
        shutil.rmtree(temp)
    final.parent.mkdir(exist_ok=True)
    (temp / MEDIA_DIR).mkdir(parents=True)
    try:
        export_assets(assets, used, source_dir, temp)
        (temp / "index.html").write_text(page, encoding="utf-8")
        check_output(temp)
        swap_in(temp, final)
    except BaseException:
        shutil.rmtree(temp, ignore_errors=True)
        raise
    return final


def main() -> int:
    parser = argparse.ArgumentParser(description="결과보기.html 을 사이트에 올릴 가벼운 사본으로 만든다.")
    parser.add_argument("source_html", type=Path)
    parser.add_argument("slug")
    parser.add_argument("--drop", action="append", default=[], metavar="패턴")
    parser.add_argument("--replace", action="append", default=[], metavar="옛=새")
    parser.add_argument("--forbid", action="append", default=[], metavar="글자")
    parser.add_argument("--site-root", type=Path, default=SITE_ROOT)
    args = parser.parse_args()
    try:
        pairs = [parse_pair(text) for text in args.replace]
        final = build(args.source_html, args.slug, args.site_root.resolve(), args.drop, pairs, args.forbid)
        sizes = check_output(final)
    except (ValueError, OSError, RuntimeError, subprocess.TimeoutExpired, Image.DecompressionBombError) as error:
        print(f"실패: {error}", file=sys.stderr)
        return 1
    total = sum(size for size, _ in sizes)
    print(f"만듦: {final} · 파일 {len(sizes)}개 · {total / 1e6:.1f}MB")
    for size, name in sizes[-3:]:
        print(f"  큰 파일 {size / 1e6:6.1f}MB  {name}")
    for size, name in sizes:
        if size > WARN_FILE_BYTES:
            print(f"  주의: {name} 이 50MB 를 넘는다(GitHub 가 경고하는 크기)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
