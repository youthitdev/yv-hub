# YouthVoice Hub — 설정 가이드

기존 두 앱(`youthvoice-data`, `apply-tracker` → `apply-tracker-eta`)과 새로운 "이번주" 탭을
하나의 앱으로 통합한 버전입니다. 탭 3개: **이번주 / 사업일정 / 지원서트래커**.

## 1. GitHub에 올리기

1. `youthitdev` 조직에 새 레포 생성 (예: `youthvoice-hub`)
2. 이 폴더 안의 파일들을 그대로 업로드
   - GitHub 레포 페이지 > "Add file" > "Upload files" > 이 폴더의 파일/폴더를 통째로 드래그
   - `node_modules`, `dist` 폴더는 올리지 않아도 됩니다 (Vercel이 빌드 시 자동 생성)

## 2. Vercel에 새 프로젝트로 연결

1. Vercel에서 방금 만든 `youthvoice-hub` 레포를 Import
2. Framework Preset: **Vite** (자동 감지됨)
3. 아래 환경변수(Environment Variables)를 추가:

   | 이름 | 값 |
   |---|---|
   | `VITE_SUPABASE_URL` | 기존 `youthvoice-data` / `apply-tracker-eta` 프로젝트에서 쓰던 것과 동일한 값 |
   | `VITE_SUPABASE_KEY` | 위와 동일 (같은 Supabase 프로젝트를 쓰고 있으므로 그대로 재사용) |
   | `CALENDAR_ICS_URL` | 아래 3번 참고 — 팀 공용 구글 캘린더의 iCal 비밀 주소 |

4. Deploy

## 3. 팀 공용 캘린더의 iCal 비밀 주소 받아오기 ("이번주 일정" 자동연동용)

1. 구글 캘린더 웹에서 팀 공용 캘린더 좌측 목록에 마우스를 올리고 점 3개(⋮) > **설정 및 공유**
2. "캘린더 통합" 섹션까지 스크롤
3. **비공개 주소(iCal 형식)** 항목의 URL을 복사
   - 형태: `https://calendar.google.com/calendar/ical/xxxx%40group.calendar.google.com/private-xxxx/basic.ics`
4. 이 값을 Vercel 환경변수 `CALENDAR_ICS_URL`에 붙여넣기

⚠️ 이 주소는 비밀번호와 비슷한 성격이에요 (URL을 아는 사람은 누구나 그 캘린더를 읽을 수 있음).
그래서 `VITE_` 접두사를 붙이지 않았습니다 — `VITE_`가 붙으면 브라우저로 그대로 노출되지만,
이 값은 `/api/calendar.js` 서버리스 함수 안에서만 서버 쪽에서 사용되고 브라우저에는 절대 전달되지 않아요.

캘린더 연동을 아직 설정하지 않아도 앱 자체는 정상 작동합니다 — "이번주 일정" 섹션에
안내 메시지만 뜨고 나머지 기능(체크리스트, 사업일정, 지원서트래커)은 그대로 써요.

## 4. Supabase에 새 테이블 추가

Supabase 대시보드 > SQL Editor 에서 `supabase/weekly_tasks.sql` 파일 내용을 그대로 붙여넣고 실행하세요.
"담당자별 체크리스트" 기능이 이 테이블(`weekly_tasks`)을 사용합니다.

## 5. 기존 앱은 어떻게 하나요?

`youthvoice-data.vercel.app`, `apply-tracker-eta.vercel.app`는 그대로 둬도, 지워도 상관없어요.
이 통합 앱은 완전히 새 프로젝트라 서로 영향을 주지 않습니다.
다들 새 주소(`youthvoice-hub` 도메인)에 익숙해지면 그때 기존 두 앱 링크를 정리하시면 돼요.

## 폴더 구조

```
youthvoice-hub/
├── index.html
├── package.json
├── vite.config.js
├── favicon.svg
├── api/
│   └── calendar.js       # 캘린더 iCal 서버리스 프록시 (신규)
├── supabase/
│   └── weekly_tasks.sql  # 신규 테이블 생성 SQL
└── src/
    ├── main.jsx
    ├── App.jsx           # 탭 네비게이션 쉘 (신규)
    ├── supabaseClient.js # 공용 Supabase 클라이언트 (신규)
    └── tabs/
        ├── WeeklyTab.jsx   # 이번주 (신규 — 캘린더 자동연동 + 체크리스트)
        ├── GanttTab.jsx    # 사업일정 (기존 youthvoice-data 그대로 포팅)
        └── TrackerTab.jsx  # 지원서트래커 (기존 apply-tracker 그대로 포팅)
```
