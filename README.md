# PINKING ARCHIVE

개인 아카이브 사이트 — 수집 · 블로그 · 성과물 · 상점. GitHub Pages 로 공개합니다.

## 고치는 법

| 바꿀 것 | 파일 |
|---|---|
| 사이트 이름·첫 화면 문구·색·글꼴·메뉴 순서·움직임 켜고 끄기 | `config.js` (설정 칸) |
| 수집함에 링크 추가 | `data/collect.json` 에 한 줄 |
| 매일 자동으로 받을 출처 | `data/feeds.json` (RSS·Atom 주소) |
| 블로그 글 | `posts/<번호>-<이름>.md` 를 만들고 `posts/index.json` 에 한 줄 |
| 성과물 | `data/works.json` |
| 상점 상품 | `data/products.json` — `buy_url` 에 판매처 주소를 넣으면 '구매하러 가기' 단추가 켜짐 |

- 자동 수집: `.github/workflows/collect.yml` 이 매일 06:10 KST 쯤 `scripts/fetch_feeds.py` 를 돌려 `data/feed.json` 을 갱신합니다(제목·링크만).
- 이 컴퓨터에서 미리 보기: 이 폴더에서 `python3 -m http.server 8000` → http://localhost:8000
- 디자인 기준: 인스타그램 컬렉션 '클로디'의 ai_anharu 'Claude Motion Reel'(크림 #EEEBE4 · 먹 #111111 · 주황 #FF5A36), 상점 진열대 구조는 zun_it_ 3D Carousel.
