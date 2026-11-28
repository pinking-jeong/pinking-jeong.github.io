#!/usr/bin/env python3
"""add_result_page.py 의 시험. 사용: python scripts/test_add_result_page.py"""
import subprocess
import sys
import tempfile
import unicodedata
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import add_result_page as arp  # noqa: E402

PAGE = """<!doctype html>
<html><head><title>시험</title><style>body{background:url(data:image/png;base64,AA)}</style></head><body>
<video poster="미리보기/그림1.jpg" src="완성본.mp4"></video>
<div class="pills"><a class="pill" href="완성본.mp4"><i>mp4</i>완성본 열기</a>
<a class="pill" href="마스터_HEVC10bit.mp4"><i>HEVC</i>마스터</a>
<a class="pill" href="제작기록.md"><i>md</i>제작 기록</a></div>
<a href="02_그림/그림1.png"><img src="미리보기/그림1.jpg" alt="그림 1"></a>
<a href="https://example.org/사진">출처</a><a href="#top">위로</a>
<p>홍님 확인 필요</p>
</body></html>
"""
DROPS = ["*HEVC*", "*.md"]
OK_PAGE = '<a href="../../works.html">뒤로</a><img src="media/01.jpg"><video src="media/02.mp4"></video>'


def plan(page: str = PAGE, drops: list = DROPS) -> list:
    return arp.plan_assets(arp.find_local_refs(page), drops)


class PureFunctions(unittest.TestCase):
    def test_local_refs_are_unique_ordered_and_skip_remote(self):
        self.assertEqual(
            arp.find_local_refs(PAGE),
            ["미리보기/그림1.jpg", "완성본.mp4", "마스터_HEVC10bit.mp4", "제작기록.md", "02_그림/그림1.png"],
        )

    def test_remote_and_anchor_are_not_local(self):
        for ref in ("https://a.b/c", "//a.b/c", "#top", "mailto:x", "data:image/png;base64,AA", ""):
            self.assertFalse(arp.is_local(ref), ref)
        self.assertTrue(arp.is_local("미리보기/그림1.jpg"))

    def test_ref_to_path_decodes(self):
        self.assertEqual(arp.ref_to_path("a%20b/c&amp;d.png?v=1#x"), "a b/c&d.png")

    def test_plan_kinds_and_numbered_names(self):
        by_ref = {a.ref: a for a in plan()}
        self.assertEqual(by_ref["미리보기/그림1.jpg"], arp.Asset("미리보기/그림1.jpg", "image", "media/01.jpg"))
        self.assertEqual(by_ref["완성본.mp4"], arp.Asset("완성본.mp4", "video", "media/02.mp4"))
        self.assertEqual(by_ref["마스터_HEVC10bit.mp4"].kind, "drop")
        self.assertEqual(by_ref["제작기록.md"].kind, "drop")
        self.assertEqual(by_ref["02_그림/그림1.png"], arp.Asset("02_그림/그림1.png", "image", "media/05.jpg"))
        for asset in by_ref.values():
            self.assertTrue(asset.kind == "drop" or arp.MEDIA_RE.fullmatch(asset.out), asset)

    def test_plan_stops_on_unknown_kind(self):
        with self.assertRaises(ValueError):
            plan(drops=["*HEVC*"])   # .md 를 빼지 않음

    def test_drop_ignores_case_and_hangul_composition(self):
        self.assertTrue(arp.matches_any("master_hevc.mp4", ["*HEVC*"]))
        self.assertTrue(arp.matches_any(unicodedata.normalize("NFD", "제작기록.md"), ["제작기록.*"]))
        self.assertTrue(arp.matches_any("제작기록.md", [unicodedata.normalize("NFD", "제작기록.*")]))
        self.assertFalse(arp.matches_any("완성본.mp4", ["*HEVC*", "*.md"]))

    def test_rewrite_drops_whole_buttons_and_swaps_refs(self):
        out = arp.rewrite_page(PAGE, plan())
        self.assertNotIn("마스터", out)
        self.assertNotIn("제작 기록", out)
        self.assertIn('poster="media/01.jpg" src="media/02.mp4"', out)
        self.assertIn('<a class="pill" href="media/02.mp4"><i>mp4</i>완성본 열기</a>', out)
        self.assertIn('<a href="media/05.jpg"><img src="media/01.jpg" alt="그림 1"></a>', out)
        self.assertIn('href="https://example.org/사진"', out)
        self.assertEqual(arp.find_local_refs(out), ["media/01.jpg", "media/02.mp4", "media/05.jpg"])

    def test_rewrite_stops_when_dropped_ref_is_not_a_whole_link(self):
        for page in ('<img src="비밀.png">', '<a href="비밀.png">닫는 태그 없음 <a href="https://a.b/">다른 링크</a>'):
            with self.assertRaises(ValueError):
                arp.rewrite_page(page, arp.plan_assets(["비밀.png"], ["비밀*"]))

    def test_rewrite_stops_when_old_ref_survives_elsewhere(self):
        for extra in ('<script>var u="02_그림/그림1.png"</script>', "<p>제작기록.md 를 참고</p>", "<img src='완성본.mp4'>"):
            with self.assertRaises(ValueError, msg=extra):
                arp.rewrite_page(PAGE + extra, plan())

    def test_replacements_and_forbidden(self):
        out = arp.apply_replacements(PAGE, [("홍님 확인", "확인")])
        self.assertIn("<p>확인 필요</p>", out)
        arp.check_forbidden(out, ["홍님"])
        with self.assertRaises(ValueError):
            arp.apply_replacements(PAGE, [("없는 글자", "x")])
        with self.assertRaises(ValueError):
            arp.check_forbidden(PAGE, ["홍님"])

    def test_forbidden_ignores_case_composition_and_entities(self):
        for page in (unicodedata.normalize("NFD", "<p>홍님</p>"), "<p>&#54861;님</p>", "<p>HONGNIM</p>"):
            with self.assertRaises(ValueError, msg=page):
                arp.check_forbidden(page, ["홍님", "hongnim"])

    def test_parse_pair(self):
        self.assertEqual(arp.parse_pair("옛=새=것"), ("옛", "새=것"))
        self.assertEqual(arp.parse_pair("지움="), ("지움", ""))
        for bad in ("등호없음", "=새"):
            with self.assertRaises(ValueError):
                arp.parse_pair(bad)

    def test_back_link_goes_first_in_button_row(self):
        out = arp.add_back_link(PAGE)
        self.assertIn(arp.PILLS_OPEN + arp.BACK_PILL, out)
        self.assertEqual(out.count(arp.BACK_HREF), 1)
        with self.assertRaises(ValueError):
            arp.add_back_link("<p>단추 줄 없음</p>")

    def test_marker_follows_doctype(self):
        self.assertTrue(arp.add_marker(PAGE).startswith("<!doctype html>\n" + arp.MARKER))

    def test_scan_accepts_only_media_and_back_link(self):
        self.assertEqual(arp.scan_page(OK_PAGE), ["media/01.jpg", "media/02.mp4"])
        self.assertEqual(arp.scan_page(OK_PAGE + "<style>a{background:url(data:image/png;base64,AA)}</style>"),
                         ["media/01.jpg", "media/02.mp4"])

    def test_scan_stops_on_refs_this_script_cannot_carry(self):
        bad_bits = (
            '<img src="비밀.png">', "<img src='비밀.png'>", "<IMG SRC=비밀.png>", '<img srcset="비밀.png 1x">',
            '<div style="background:url(비밀.png)"></div>', '<style>a{background:url("비밀.png")}</style>',
            "<style>@import 'x.css';</style>", '<img src="file:///Users/someone/x.png">',
            '<img src="media/../../비밀.jpg">', '<a href="media/01.md">x</a>', '<object data="x.pdf"></object>',
        )
        for bit in bad_bits:
            with self.assertRaises(ValueError, msg=bit):
                arp.scan_page(OK_PAGE + bit)


class Swap(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.final, self.temp, self.old = self.root / "x", self.root / ".x.part", self.root / ".x.old"

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, folder: Path, text: str) -> None:
        folder.mkdir()
        (folder / "f").write_text(text, encoding="utf-8")

    def test_swap_replaces_and_cleans_up(self):
        self.make(self.final, "옛것")
        self.make(self.temp, "새것")
        arp.swap_in(self.temp, self.final)
        self.assertEqual((self.final / "f").read_text(encoding="utf-8"), "새것")
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["x"])

    def test_failed_swap_puts_old_copy_back(self):
        self.make(self.final, "옛것")
        with self.assertRaises(OSError):
            arp.swap_in(self.temp, self.final)   # 새 사본이 없어 놓기에 실패한다
        self.assertEqual((self.final / "f").read_text(encoding="utf-8"), "옛것")
        self.assertFalse(self.old.exists())

    def test_interrupted_swap_is_recovered_next_time(self):
        self.make(self.old, "옛것")              # 지난번에 옛 사본을 치워 둔 채로 멈춘 상태
        with self.assertRaises(OSError):
            arp.swap_in(self.temp, self.final)
        self.assertEqual((self.final / "f").read_text(encoding="utf-8"), "옛것")


class Build(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.work, self.site = root / "작업", root / "site"
        (self.work / "미리보기").mkdir(parents=True)
        (self.work / "02_그림").mkdir()
        self.site.mkdir()
        (self.site / "works.html").write_text("<p>성과물</p>", encoding="utf-8")
        exif = Image.Exif()
        exif[0x010F] = "PLANTED_MAKER"
        Image.new("RGB", (64, 36), (200, 120, 40)).save(self.work / "미리보기" / "그림1.jpg", exif=exif)
        Image.new("RGBA", (5120, 2880), (10, 20, 30, 255)).save(self.work / "02_그림" / "그림1.png")
        # 영상은 인코더 없이 시험하도록 영상 주소를 뺀 화면을 쓴다
        self.page = PAGE.replace('src="완성본.mp4"', "").replace(
            '<a class="pill" href="완성본.mp4"><i>mp4</i>완성본 열기</a>\n', "")
        self.write_page(self.page)
        self.final = self.site / "animation" / "sample-20s"

    def tearDown(self):
        self.tmp.cleanup()

    def write_page(self, page: str) -> None:
        (self.work / "결과보기.html").write_text(page, encoding="utf-8")

    def build(self, **changes):
        options = dict(drops=DROPS, pairs=[("홍님 확인", "확인")], forbidden=["홍님"])
        options.update(changes)
        return arp.build(self.work / "결과보기.html", "sample-20s", self.site, **options)

    def names(self) -> list:
        return sorted(p.relative_to(self.final).as_posix() for p in self.final.rglob("*") if p.is_file())

    def leftovers(self) -> list:
        return sorted(p.name for p in (self.site / "animation").iterdir() if p.name.startswith("."))

    def test_build_writes_light_copy_without_metadata(self):
        self.assertEqual(self.build(), self.final)
        self.assertEqual(self.names(), ["index.html", "media/01.jpg", "media/04.jpg"])
        with Image.open(self.final / "media" / "04.jpg") as big:
            self.assertEqual((big.format, big.size), ("JPEG", (2560, 1440)))
        with Image.open(self.final / "media" / "01.jpg") as small:
            self.assertEqual(len(small.getexif()), 0)
        self.assertNotIn(b"PLANTED_MAKER", (self.final / "media" / "01.jpg").read_bytes())
        page = (self.final / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("홍님", page)
        self.assertNotIn("제작기록", page)
        self.assertEqual(self.leftovers(), [])
        self.assertEqual([name for _, name in arp.check_output(self.final)].count("index.html"), 1)

    def test_rebuild_replaces_old_copy(self):
        self.build()
        (self.final / "media" / "낡은파일.jpg").write_bytes(b"x")
        self.build()
        self.assertEqual(self.names(), ["index.html", "media/01.jpg", "media/04.jpg"])

    def test_failure_leaves_no_partial_copy_and_keeps_old_one(self):
        self.build()
        (self.work / "02_그림" / "그림1.png").unlink()
        with self.assertRaises(FileNotFoundError):
            self.build()
        self.assertTrue((self.final / "index.html").is_file())
        self.assertEqual(self.leftovers(), [])

    def test_bad_slug_and_outside_file_are_refused(self):
        for slug in ("", "..", "a", "한글", "a/b", "A-b", "ok\n"):
            with self.assertRaises(ValueError, msg=repr(slug)):
                arp.build(self.work / "결과보기.html", slug, self.site, DROPS, [], [])
        self.write_page(self.page.replace('href="02_그림/그림1.png"', 'href="../밖.png"'))
        with self.assertRaises(ValueError):
            self.build()

    def test_forbidden_word_stops_before_writing(self):
        with self.assertRaises(ValueError):
            self.build(pairs=[])
        self.assertFalse((self.site / "animation").exists())

    def test_folder_not_made_by_this_script_is_left_alone(self):
        self.final.mkdir(parents=True)
        (self.final / "index.html").write_text("<p>손으로 만든 화면</p>", encoding="utf-8")
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(self.names(), ["index.html"])

    def test_wrong_site_root_and_symlinked_section_are_refused(self):
        with self.assertRaises(ValueError):
            arp.build(self.work / "결과보기.html", "sample-20s", self.site / "없는폴더", DROPS, [], [])
        self.assertFalse((self.site / "없는폴더").exists())
        elsewhere = self.site.parent / "다른곳"
        elsewhere.mkdir()
        (self.site / "animation").symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(list(elsewhere.iterdir()), [])

    def test_symlink_and_non_image_sources_are_refused(self):
        notes = self.work / "메모.txt"
        notes.write_text("올리면 안 되는 글", encoding="utf-8")
        thumb = self.work / "미리보기" / "그림1.jpg"
        thumb.unlink()
        thumb.symlink_to(notes)
        with self.assertRaises(ValueError):
            self.build()
        thumb.unlink()
        thumb.write_text("<html>그림인 척하는 글</html>", encoding="utf-8")
        with self.assertRaises(OSError):
            self.build()
        self.assertFalse(self.final.exists())

    def test_media_used_only_by_dropped_button_is_not_exported(self):
        Image.new("RGB", (8, 8)).save(self.work / "표지.jpg")
        self.write_page(self.page.replace('<i>md</i>제작 기록', '<img src="표지.jpg">제작 기록'))
        self.build()
        # 표지.jpg 는 네 번째 주소라 04 번이 될 차례였지만, 뺀 단추 안에만 있어 옮겨지지 않는다
        self.assertEqual(self.names(), ["index.html", "media/01.jpg", "media/05.jpg"])


class Video(unittest.TestCase):
    def test_encode_keeps_picture_and_drops_metadata(self):
        try:
            import imageio_ffmpeg
        except ImportError:
            self.skipTest("imageio-ffmpeg 없음")
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / "원본.mp4", Path(folder) / "웹용.mp4"
            made = subprocess.run(
                [imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i",
                 "testsrc=size=64x36:rate=24:duration=1", "-metadata", "title=PLANTED_TITLE", "-metadata",
                 "comment=/Users/someone/PLANTED_PATH", "-metadata:s:v", "handler_name=PLANTED_HANDLER",
                 "-pix_fmt", "yuv420p", str(source)],
                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
            self.assertEqual(made.returncode, 0, made.stderr)
            self.assertIn(b"PLANTED_TITLE", source.read_bytes())
            arp.encode_video(source, target)
            frames, seconds = imageio_ffmpeg.count_frames_and_secs(str(target))
            self.assertEqual((frames, round(seconds, 2)), (24, 1.0))
            data = target.read_bytes()
            for planted in (b"PLANTED_TITLE", b"PLANTED_PATH", b"PLANTED_HANDLER"):
                self.assertNotIn(planted, data)
            self.assertLess(data.find(b"moov"), data.find(b"mdat"))   # 바로 재생되도록 색인이 앞에 있다


if __name__ == "__main__":
    unittest.main(verbosity=1)
