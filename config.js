/* ─────────────────────────────────────────────────────────────
   설정 칸 — 홍님이 직접 바꾸는 곳은 이 파일 하나입니다.
   · 글자는 따옴표 안만 고치면 됩니다.
   · 색은 #RRGGBB 로 적습니다(레퍼런스 ai_anharu: 크림 종이·먹·주황 하나).
   · 메뉴 순서는 menu 줄의 순서를 바꾸면 화면 순서도 바뀝니다.
   · motion: false 로 두면 움직임을 모두 끕니다.
   · autoScroll: false 로 두면 첫 쪽이 스스로 아래로 넘어가지 않습니다(위 가운데 ▶ 단추도 사라짐).
   ───────────────────────────────────────────────────────────── */
window.SITE = {
  name: "PINKING",                         // 왼쪽 위 이름(영문)
  nameKo: "핑킹 아카이브",                    // 한글 이름
  meta: "PINKING — ARCHIVE '26",           // 화면 위 모노 메타 줄 왼쪽
  metaRight: "VOL. 01",                    // 위 메타 줄 오른쪽
  tagline: "모으고, 쓰고, 만들고, 나눕니다.",    // 첫 화면 아래 한 줄
  heroLines: ["모으고", "기록하고", "나누는 곳"], // 첫 화면 큰 글자(세 줄)

  colors: {
    paper: "#EEEBE4",   // 크림 종이
    ink: "#111111",     // 먹색
    point: "#FF5A36",   // 포인트 주황(한 화면에 하나가 원칙)
  },
  fonts: {
    displayKo: "'Black Han Sans', 'Pretendard Variable', sans-serif",   // 아주 굵은 한글
    displayEn: "'Archivo', 'Pretendard Variable', sans-serif",          // 굵은 영문(폭 조절 글꼴)
    serif: "'Instrument Serif', Georgia, serif",                        // 가끔 한 줄 세리프 이탤릭
    mono: "'JetBrains Mono', ui-monospace, monospace",                  // 숫자·라벨
    body: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
  },
  space: 1,             // 여백 배율(1 = 기본, 1.2 = 20% 넓게)

  menu: [
    { id: "collect", ko: "수집", en: "COLLECT", href: "collect.html", fig: "SPACING", note: "관심 정보를 모으는 곳" },
    { id: "blog",    ko: "블로그", en: "WRITE",   href: "blog.html",    fig: "EASE",    note: "생각을 천천히 적는 곳" },
    { id: "works",   ko: "성과물", en: "WORKS",   href: "works.html",   fig: "SYSTEM",  note: "만든 것을 정리해 두는 곳" },
    { id: "shop",    ko: "상점",  en: "SHOP",    href: "shop.html",    fig: "TYPE",    note: "템플릿과 책을 나누는 곳" },
  ],

  links: {
    github: "https://github.com/pinking-jeong",
    email: "",          // 공개해도 되는 메일만 적습니다(비워 두면 안 보임)
  },
  motion: true,
  autoScroll: true,       // 첫 쪽: 첫 화면 애니메이션이 끝나면 장면을 하나씩 내려가며 보여 줌. 휠을 굴리면 멈추고 위 가운데 ▶ 단추로 다시 재생
  autoScrollLoop: true,   // 맨 아래에서 첫 화면으로 돌아온 뒤 다시 시작(false 면 돌아와서 멈춤)
};
