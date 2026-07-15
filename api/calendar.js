// /api/calendar
// 팀 공용 구글 캘린더(들)의 iCal 비밀 주소를 서버에서 읽어와 파싱한 뒤,
// 요청받은 기간(start~end)에 해당하는 일정만 추려서 돌려주는 서버리스 함수.
//
// 클라이언트에는 절대 iCal 비밀 주소를 노출하지 않는다 (서버 환경변수로만 보관).
//
// 필요한 환경변수 (Vercel 프로젝트 설정 > Environment Variables):
//   CALENDAR_ICS_URL     = 첫 번째 캘린더의 "비공개 주소(iCal 형식)" (기존과 동일, 하위호환)
//   CALENDAR_LABEL       = (선택) 첫 번째 캘린더 이름, 기본값 "팀 공용"
//   CALENDAR_COLOR       = (선택) 첫 번째 캘린더 표시 색상(hex), 기본값 아래 DEFAULT_COLORS 순서대로
//
//   캘린더를 더 추가하려면 숫자를 이어서 붙이면 됩니다 (최대 8개):
//   CALENDAR_ICS_URL_2, CALENDAR_LABEL_2, CALENDAR_COLOR_2
//   CALENDAR_ICS_URL_3, CALENDAR_LABEL_3, CALENDAR_COLOR_3
//   ...
//
// 사용법: GET /api/calendar?start=2026-07-13&end=2026-07-20
//   - start: 조회 시작일 (포함, YYYY-MM-DD, KST 기준)
//   - end:   조회 종료일 (제외, YYYY-MM-DD, KST 기준) — 보통 start + 7일

import ical from "node-ical";

const KST_OFFSET = "+09:00";
const MAX_CALENDARS = 8;
const DEFAULT_COLORS = ["#00b894", "#0984e3", "#e17055", "#6c5ce7", "#fdcb6e", "#e84393", "#00cec9", "#d63031"];

function toKstDate(dateStr, endOfDay = false) {
  // "YYYY-MM-DD" -> KST 자정(혹은 다음날 자정 직전) 기준 Date
  return new Date(`${dateStr}T${endOfDay ? "23:59:59" : "00:00:00"}${KST_OFFSET}`);
}

function getCalendarConfigs() {
  const configs = [];
  for (let i = 1; i <= MAX_CALENDARS; i++) {
    const suffix = i === 1 ? "" : `_${i}`;
    const url = process.env[`CALENDAR_ICS_URL${suffix}`];
    if (!url) continue;
    const label = process.env[`CALENDAR_LABEL${suffix}`] || (i === 1 ? "팀 공용" : `캘린더 ${i}`);
    const color = process.env[`CALENDAR_COLOR${suffix}`] || DEFAULT_COLORS[(i - 1) % DEFAULT_COLORS.length];
    configs.push({ url, label, color });
  }
  return configs;
}

function extractEvents(parsed, rangeStart, rangeEnd, cfg) {
  const events = [];
  for (const key in parsed) {
    const ev = parsed[key];
    if (!ev || ev.type !== "VEVENT") continue;

    const isAllDay = ev.datetype === "date";
    const duration = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0;

    if (ev.rrule) {
      // 반복 일정: 기간 내 발생하는 occurrence들만 뽑아낸다.
      let occurrences = [];
      try {
        occurrences = ev.rrule.between(rangeStart, rangeEnd, true);
      } catch (e) {
        occurrences = [];
      }
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + duration);
        events.push({
          title: ev.summary || "(제목 없음)",
          start: occStart.toISOString(),
          end: occEnd.toISOString(),
          allDay: isAllDay,
          location: ev.location || "",
          calendar: cfg.label,
          color: cfg.color,
        });
      }
    } else {
      if (!ev.start || !ev.end) continue;
      const overlaps = ev.start < rangeEnd && ev.end > rangeStart;
      if (!overlaps) continue;
      events.push({
        title: ev.summary || "(제목 없음)",
        start: ev.start.toISOString(),
        end: ev.end.toISOString(),
        allDay: isAllDay,
        location: ev.location || "",
        calendar: cfg.label,
        color: cfg.color,
      });
    }
  }
  return events;
}

export default async function handler(req, res) {
  const configs = getCalendarConfigs();

  if (configs.length === 0) {
    res.status(200).json({
      events: [],
      calendars: [],
      warning:
        "CALENDAR_ICS_URL 환경변수가 설정되지 않았어요. Vercel 프로젝트 설정에서 팀 캘린더의 iCal 비밀 주소를 등록해주세요.",
    });
    return;
  }

  const { start, end } = req.query;
  if (!start || !end) {
    res.status(400).json({ error: "start, end 쿼리 파라미터가 필요해요 (예: ?start=2026-07-13&end=2026-07-20)" });
    return;
  }

  const rangeStart = toKstDate(start, false);
  const rangeEnd = toKstDate(end, false); // end는 제외(exclusive) 기준으로 다룸

  const results = await Promise.all(
    configs.map(async (cfg) => {
      try {
        const r = await fetch(cfg.url);
        if (!r.ok) throw new Error(`응답 오류 (status ${r.status})`);
        const icsText = await r.text();
        const parsed = ical.sync.parseICS(icsText);
        return { ok: true, events: extractEvents(parsed, rangeStart, rangeEnd, cfg) };
      } catch (e) {
        return { ok: false, label: cfg.label, message: e.message };
      }
    })
  );

  const events = results.filter((r) => r.ok).flatMap((r) => r.events);
  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  const failed = results.filter((r) => !r.ok);
  const warning = failed.length > 0 ? `${failed.map((f) => f.label).join(", ")} 캘린더를 불러오지 못했어요.` : undefined;

  res.status(200).json({
    events,
    calendars: configs.map((c) => ({ label: c.label, color: c.color })),
    ...(warning ? { warning } : {}),
  });
}
