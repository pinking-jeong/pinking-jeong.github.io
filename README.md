# PINKING ARCHIVE

개인 아카이브 사이트 — 수집 · 블로그 · 성과물 · 상점. GitHub Pages 로 공개합니다.

## 고치는 법

| 바꿀 것 | 파일 |
|---|---|
| 사이트 이름·첫 화면 문구·색·글꼴·메뉴 순서·움직임·첫 쪽 자동 넘김 켜고 끄기 | `config.js` (설정 칸) |
| 수집함에 링크 추가 | `data/collect.json` 에 한 줄 |
| 매일 자동으로 받을 출처 | `data/feeds.json` (RSS·Atom 주소) |
| 블로그 글 | `posts/<번호>-<이름>.md` 를 만들고 `posts/index.json` 에 한 줄 |
| 성과물 | `data/works.json` |
| 상점 상품 | `data/products.json` — `buy_url` 에 판매처 주소를 넣으면 '구매하러 가기' 단추가 켜짐 |

- 자동 수집: `.github/workflows/collect.yml` 이 매일 06:10 KST 쯤 `scripts/fetch_feeds.py` 를 돌려 `data/feed.json` 을 갱신합니다(제목·링크만).
- 영상 작업의 결과 화면 올리기: `python scripts/add_result_page.py <결과보기.html> <주소 이름>` 이 그림·영상을 웹용으로 줄여 `animation/<주소 이름>/` 에 사본을 만듭니다(Pillow·imageio-ffmpeg 필요, 쓰는 법은 파일 맨 위). 그다음 `data/works.json` 에 한 줄을 넣습니다. 사본은 직접 고치지 않고 원본을 고친 뒤 다시 만듭니다.
- 첫 쪽 자동 넘김(`assets/tour.js`)을 고친 뒤 확인: `uv run --no-project --with websocket-client python scripts/check_tour.py` — 크롬을 실제 시간으로 돌려 한 바퀴·멈춤·다시 재생·단추 자리를 봅니다(3분쯤). 머무는 시간은 `tour.js` 맨 위의 숫자로 바꿉니다.
- 비밀번호로 잠근 자료 올리기: `scripts/lock-page.mjs` (쓰는 법과 꼭 알아 둘 것은 파일 맨 위). 저장소가 공개라서 올라가는 것은 암호문뿐이고, 비밀번호는 이 컴퓨터의 `~/.config/pinking-archive/` 에만 둡니다. 안전은 비밀번호가 얼마나 무작위인가에 달려 있고, 한 번 올린 암호문은 기록에 남습니다. 확인: `node --test scripts/lock-page.test.mjs`, `uv run --no-project --with websocket-client python scripts/check_lock.py`.
- 이 컴퓨터에서 미리 보기: 이 폴더에서 `python3 -m http.server 8000` → http://localhost:8000
- 디자인 기준: 인스타그램 컬렉션 '클로디'의 ai_anharu 'Claude Motion Reel'(크림 #EEEBE4 · 먹 #111111 · 주황 #FF5A36), 상점 진열대 구조는 zun_it_ 3D Carousel.
