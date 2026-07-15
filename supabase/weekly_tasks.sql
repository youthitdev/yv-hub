-- 주간업무(이번주 탭) 담당자별 체크리스트를 위한 테이블
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하면 됩니다.

create table if not exists weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,        -- 해당 주 월요일 날짜 (KST 기준, 예: 2026-07-13)
  assignee text not null,          -- 담당자 이름
  program_tag text,                -- 관련 프로그램 태그 (선택, 예: 'SMF')
  content text not null,           -- 할 일 내용
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists weekly_tasks_week_start_idx on weekly_tasks (week_start);

-- 기존 yv_data / application_tracker_programs 테이블과 동일하게,
-- 앱이 anon key로 직접 읽고 쓸 수 있도록 RLS를 끄거나(내부 도구용, 가장 간단한 방법),
-- 혹은 아래처럼 anon 역할에 전체 권한을 여는 정책을 추가하세요.

alter table weekly_tasks enable row level security;

create policy "anon full access" on weekly_tasks
  for all
  using (true)
  with check (true);
