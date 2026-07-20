import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import EmojiPicker from "emoji-picker-react";
import { supabase } from "../supabaseClient";

const WEEKLY_TABLE = "weekly_tasks";
const ASSIGNEE_EMOJI_TABLE = "assignee_emojis";
const DEFAULT_ASSIGNEE_EMOJI = "🙋";

// ---------- 날짜 헬퍼 (KST 기준) ----------

function getKstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0=일 ... 6=토
  const diff = day === 0 ? -6 : 1 - day; // 월요일까지 이동
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function formatRangeLabel(monday) {
  const friday = addDays(monday, 4);
  return `${monday.getMonth() + 1}/${monday.getDate()}~${friday.getMonth() + 1}/${friday.getDate()}`;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
}

const VACATION_COLOR = "#ffc107";
function isVacationEvent(ev) {
  return /\[휴가\]/.test(ev.title || "");
}

// ---------- 컴포넌트 ----------

export default function WeeklyTab() {
  const [weekMonday, setWeekMonday] = useState(() => getMonday(getKstNow()));

  const weekEnd = useMemo(() => addDays(weekMonday, 7), [weekMonday]);
  const weekKey = useMemo(() => toDateKey(weekMonday), [weekMonday]);
  const isCurrentWeek = useMemo(() => toDateKey(getMonday(getKstNow())) === weekKey, [weekKey]);

  // ----- 캘린더 일정 -----
  const [events, setEvents] = useState([]);
  const [calendarsConfigured, setCalendarsConfigured] = useState([]); // [{label, color}] — 이번주 이벤트 유무와 무관하게 "연결된 캘린더 개수" 자체
  const [calLoading, setCalLoading] = useState(true);
  const [calError, setCalError] = useState("");
  const [calWarning, setCalWarning] = useState("");

  const loadEvents = useCallback(async () => {
    setCalLoading(true);
    setCalError("");
    setCalWarning("");
    try {
      const params = new URLSearchParams({ start: weekKey, end: toDateKey(weekEnd) });
      const r = await fetch(`/api/calendar?${params.toString()}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "캘린더를 불러오지 못했어요.");
      setEvents(data.events || []);
      setCalendarsConfigured(data.calendars || []);
      if (data.warning) setCalWarning(data.warning);
    } catch (e) {
      setCalError(e.message || "캘린더를 불러오지 못했어요.");
    } finally {
      setCalLoading(false);
    }
  }, [weekKey, weekEnd]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const d = new Date(ev.start);
      const key = toDateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  // 캘린더가 2개 이상 "연결"돼 있으면 항상 색점 표시 (이번주에 실제로 여러 곳 일정이 섞였는지와 무관하게 일관되게)
  const hasMultipleCalendars = calendarsConfigured.length > 1;

  // ----- 담당자별 체크리스트 -----
  const [tasks, setTasks] = useState([]);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");

  // ----- 담당자 이모지 + 순서 (직접 고르고, 드래그로 재배열) -----
  const [assigneeEmojis, setAssigneeEmojis] = useState({}); // { [assignee]: "🐱" }
  const [assigneeOrder, setAssigneeOrder] = useState({}); // { [assignee]: 0, 1, 2, ... }
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // 팝오버가 열려있는 담당자 이름

  const loadAssigneeEmojis = useCallback(async () => {
    const { data, error } = await supabase.from(ASSIGNEE_EMOJI_TABLE).select("*");
    if (!error && data) {
      const emojiMap = {};
      const orderMap = {};
      for (const row of data) {
        emojiMap[row.assignee] = row.emoji;
        if (row.sort_order != null) orderMap[row.assignee] = row.sort_order;
      }
      setAssigneeEmojis(emojiMap);
      setAssigneeOrder(orderMap);
    }
  }, []);

  useEffect(() => {
    loadAssigneeEmojis();
  }, [loadAssigneeEmojis]);

  const getAssigneeEmoji = useCallback(
    (assignee) => assigneeEmojis[assignee] || DEFAULT_ASSIGNEE_EMOJI,
    [assigneeEmojis]
  );

  const saveAssigneeEmoji = async (assignee, emoji) => {
    setAssigneeEmojis((prev) => ({ ...prev, [assignee]: emoji }));
    setEmojiPickerFor(null);
    const { error } = await supabase
      .from(ASSIGNEE_EMOJI_TABLE)
      .upsert({ assignee, emoji }, { onConflict: "assignee" });
    if (error) loadAssigneeEmojis(); // 실패하면 원래 상태로 다시 동기화
  };

  // 팝오버 바깥을 클릭하면 닫기
  const emojiPopoverRef = useRef(null);
  useEffect(() => {
    if (!emojiPickerFor) return;
    function handleOutside(e) {
      if (emojiPopoverRef.current && !emojiPopoverRef.current.contains(e.target)) {
        setEmojiPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [emojiPickerFor]);

  // ----- 담당자 섹션 드래그 순서 변경 -----
  const [dragAssignee, setDragAssignee] = useState(null);
  const [dragOverAssignee, setDragOverAssignee] = useState(null);
  const canReorderAssignees = assigneeFilter === "전체"; // 필터링 중엔 순서가 섞여 보여서 드래그 비활성화

  const persistAssigneeOrder = useCallback(async (orderedNames) => {
    setAssigneeOrder((prev) => {
      const next = { ...prev };
      orderedNames.forEach((name, idx) => { next[name] = idx; });
      return next;
    });
    await Promise.all(
      orderedNames.map((name, idx) =>
        supabase.from(ASSIGNEE_EMOJI_TABLE).upsert({ assignee: name, sort_order: idx }, { onConflict: "assignee" })
      )
    );
  }, []);

  const handleAssigneeDragStart = (name) => () => {
    if (!canReorderAssignees) return;
    setDragAssignee(name);
  };
  const handleAssigneeDragOver = (name) => (e) => {
    if (!canReorderAssignees || !dragAssignee || dragAssignee === name) return;
    e.preventDefault();
    setDragOverAssignee(name);
  };
  const handleAssigneeDrop = (orderedNames) => (name) => (e) => {
    if (!canReorderAssignees || !dragAssignee || dragAssignee === name) return;
    e.preventDefault();
    const current = [...orderedNames];
    const fromIdx = current.indexOf(dragAssignee);
    const toIdx = current.indexOf(name);
    if (fromIdx === -1 || toIdx === -1) return;
    current.splice(fromIdx, 1);
    current.splice(toIdx, 0, dragAssignee);
    persistAssigneeOrder(current);
    setDragAssignee(null);
    setDragOverAssignee(null);
  };
  const handleAssigneeDragEnd = () => {
    setDragAssignee(null);
    setDragOverAssignee(null);
  };


  const loadTasks = useCallback(async () => {
    setTaskLoading(true);
    setTaskError("");
    const { data, error } = await supabase
      .from(WEEKLY_TABLE)
      .select("*")
      .eq("week_start", weekKey)
      .order("assignee", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      setTaskError("체크리스트를 불러오지 못했어요. weekly_tasks 테이블이 생성되어 있는지 확인해주세요.");
      setTasks([]);
    } else {
      setTasks(data || []);
    }
    setTaskLoading(false);
  }, [weekKey]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const assignees = useMemo(() => {
    const set = new Set(tasks.map((t) => t.assignee).filter(Boolean));
    return Array.from(set);
  }, [tasks]);

  const tasksByAssignee = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (assigneeFilter !== "전체" && t.assignee !== assigneeFilter) continue;
      if (!map[t.assignee]) map[t.assignee] = [];
      map[t.assignee].push(t);
    }
    return map;
  }, [tasks, assigneeFilter]);

  // 저장된 순서(assigneeOrder)대로 정렬, 아직 순서가 없는 담당자는 이름순으로 뒤에 붙임
  const orderedAssigneeNames = useMemo(() => {
    const names = Object.keys(tasksByAssignee);
    return names.sort((a, b) => {
      const oa = assigneeOrder[a];
      const ob = assigneeOrder[b];
      if (oa == null && ob == null) return a.localeCompare(b, "ko");
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    });
  }, [tasksByAssignee, assigneeOrder]);

  const toggleDone = async (task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    const { error } = await supabase.from(WEEKLY_TABLE).update({ done: !task.done }).eq("id", task.id);
    if (error) loadTasks(); // 실패하면 원래 상태로 다시 동기화
  };

  const deleteTask = async (task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error } = await supabase.from(WEEKLY_TABLE).delete().eq("id", task.id);
    if (error) loadTasks();
  };

  // ----- 할 일 내용 인라인 수정 (노션/슬랙처럼 클릭해서 바로 편집) -----
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState("");

  const startEditingTask = (task) => {
    setEditingTaskId(task.id);
    setEditDraft(task.content);
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditDraft("");
  };

  const commitEditingTask = async (task) => {
    const trimmed = editDraft.trim();
    setEditingTaskId(null);
    if (!trimmed || trimmed === task.content) return; // 빈 값이거나 변경 없으면 그냥 취소 처리 (삭제는 ✕ 버튼으로만)
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, content: trimmed } : t)));
    const { error } = await supabase.from(WEEKLY_TABLE).update({ content: trimmed }).eq("id", task.id);
    if (error) loadTasks(); // 실패하면 원래 상태로 다시 동기화
  };

  // ----- 빠른 입력 (담당자 섹션 안에서 내용만 치고 Enter) -----
  const [drafts, setDrafts] = useState({}); // { [assignee]: "입력중인 텍스트" }
  const [quickAddError, setQuickAddError] = useState("");

  const setDraft = (assignee, value) => {
    setDrafts((prev) => ({ ...prev, [assignee]: value }));
  };

  const quickAdd = async (assignee, content) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const maxOrder = tasks.filter((t) => t.assignee === assignee).length;
    const { data, error } = await supabase
      .from(WEEKLY_TABLE)
      .insert({
        week_start: weekKey,
        assignee,
        program_tag: null,
        content: trimmed,
        done: false,
        sort_order: maxOrder,
      })
      .select()
      .single();
    if (error) {
      setQuickAddError("추가하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setTasks((prev) => [...prev, data]);
    setDraft(assignee, "");
    setQuickAddError("");
  };

  // ----- 새 담당자 추가 (아직 목록에 없는 사람 처음 등록할 때만) -----
  const [showNewAssignee, setShowNewAssignee] = useState(false);
  const [newAssigneeName, setNewAssigneeName] = useState("");
  const [newAssigneeContent, setNewAssigneeContent] = useState("");

  const handleAddNewAssignee = async () => {
    if (!newAssigneeName.trim() || !newAssigneeContent.trim()) return;
    await quickAdd(newAssigneeName.trim(), newAssigneeContent.trim());
    setNewAssigneeName("");
    setNewAssigneeContent("");
    setShowNewAssignee(false);
  };

  // ----- 지난주 데이터 (담당자별 불러오기에 사용) -----
  const prevWeekKey = useMemo(() => toDateKey(addDays(weekMonday, -7)), [weekMonday]);
  const [prevTasks, setPrevTasks] = useState([]);

  const loadPrevTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from(WEEKLY_TABLE)
      .select("*")
      .eq("week_start", prevWeekKey)
      .order("assignee", { ascending: true })
      .order("sort_order", { ascending: true });
    if (!error) setPrevTasks(data || []);
  }, [prevWeekKey]);

  useEffect(() => {
    loadPrevTasks();
  }, [loadPrevTasks]);

  // 지난주엔 있었지만 이번주엔 아직 섹션이 없는 담당자 (한 번도 항목을 안 만든 경우)
  const newPrevAssignees = useMemo(() => {
    const prevSet = new Set(prevTasks.map((t) => t.assignee).filter(Boolean));
    return Array.from(prevSet).filter((a) => !assignees.includes(a));
  }, [prevTasks, assignees]);

  const [importingAssignees, setImportingAssignees] = useState({}); // { [assignee]: true }
  const [importNotes, setImportNotes] = useState({}); // { [assignee]: "안내 문구" }

  const importAssignee = async (assigneeName) => {
    setImportingAssignees((prev) => ({ ...prev, [assigneeName]: true }));
    setImportNotes((prev) => ({ ...prev, [assigneeName]: "" }));

    const relevant = prevTasks.filter((t) => t.assignee === assigneeName);
    const existingContents = new Set(tasks.filter((t) => t.assignee === assigneeName).map((t) => t.content));
    let nextOrder = tasks.filter((t) => t.assignee === assigneeName).length;

    const toInsert = [];
    for (const t of relevant) {
      if (existingContents.has(t.content)) continue;
      existingContents.add(t.content);
      toInsert.push({
        week_start: weekKey,
        assignee: assigneeName,
        program_tag: null,
        content: t.content,
        done: false,
        sort_order: nextOrder++,
      });
    }

    if (toInsert.length === 0) {
      setImportingAssignees((prev) => ({ ...prev, [assigneeName]: false }));
      setImportNotes((prev) => ({ ...prev, [assigneeName]: "가져올 새 항목이 없어요." }));
      setTimeout(() => setImportNotes((prev) => ({ ...prev, [assigneeName]: "" })), 2000);
      return;
    }

    const { data, error } = await supabase.from(WEEKLY_TABLE).insert(toInsert).select();
    setImportingAssignees((prev) => ({ ...prev, [assigneeName]: false }));
    if (error) {
      setImportNotes((prev) => ({ ...prev, [assigneeName]: "불러오지 못했어요." }));
      return;
    }
    setTasks((prev) => [...prev, ...(data || [])]);
    setImportNotes((prev) => ({ ...prev, [assigneeName]: `${data.length}개 불러옴` }));
    setTimeout(() => setImportNotes((prev) => ({ ...prev, [assigneeName]: "" })), 2000);
  };

  return (
    <div style={{ fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background: "#f5f6fa", minHeight: "100%", paddingBottom: 60 }}>
      {/* 주차 네비게이션 */}
      <div style={{ background: "#2d3436", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => setWeekMonday((d) => addDays(d, -7))}
            style={{ background: "#636e72", border: "none", color: "white", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
          >
            ◀ 이전주
          </button>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>🍀 {getISOWeekNumber(weekMonday)}주차</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>📍 {formatRangeLabel(weekMonday)}</div>
          </div>
          <button
            onClick={() => setWeekMonday((d) => addDays(d, 7))}
            style={{ background: "#636e72", border: "none", color: "white", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
          >
            다음주 ▶
          </button>
        </div>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekMonday(getMonday(getKstNow()))}
            style={{ background: "#00b894", border: "none", color: "white", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            이번주로 돌아가기
          </button>
        )}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        {/* 이번주 일정 (자동, 캘린더 연동) */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #eee", marginBottom: 18, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>📅 이번주 일정</span>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>팀 공용 캘린더 자동 연동</span>
          </div>
          <div style={{ padding: 16 }}>
            {calLoading && <div style={{ color: "#999", fontSize: 13 }}>불러오는 중...</div>}
            {calError && <div style={{ color: "#e17055", fontSize: 13 }}>{calError}</div>}
            {calWarning && !calError && (
              <div style={{ color: "#e17055", fontSize: 13, background: "#fff3f0", padding: "8px 10px", borderRadius: 6 }}>{calWarning}</div>
            )}
            {!calLoading && !calError && !calWarning && Object.keys(eventsByDay).length === 0 && (
              <div style={{ color: "#999", fontSize: 13 }}>이번 주 등록된 일정이 없어요.</div>
            )}
            {!calLoading &&
              Array.from({ length: 5 }, (_, i) => addDays(weekMonday, i)).map((day) => {
                const key = toDateKey(day);
                const dayEvents = eventsByDay[key];
                if (!dayEvents || dayEvents.length === 0) return null;
                return (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#636e72", marginBottom: 4 }}>
                      {day.getMonth() + 1}/{day.getDate()} ({WEEKDAY_LABELS[day.getDay() === 0 ? 6 : day.getDay() - 1]})
                    </div>
                    {dayEvents.map((ev, i) => {
                      const vacation = isVacationEvent(ev);
                      const showDot = hasMultipleCalendars || vacation;
                      const dotColor = vacation ? VACATION_COLOR : (ev.color || "#00b894");
                      return (
                      <div key={i} style={{ fontSize: 13, padding: "4px 0", color: "#2d3436", display: "flex", alignItems: "flex-start", gap: 6 }}>
                        {showDot ? (
                          <span
                            title={ev.calendar || ""}
                            style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: dotColor, marginTop: 5, flexShrink: 0 }}
                          />
                        ) : (
                          <span>•</span>
                        )}
                        <span>
                          {ev.title}
                          {!ev.allDay && <span style={{ color: "#888" }}> ({formatTime(ev.start)}~{formatTime(ev.end)})</span>}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        </div>

        {/* 담당자별 체크리스트 (수동) */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #eee" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>✅ 담당자별 체크리스트</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 6, padding: "4px 8px" }}
            >
              <option value="전체">전체 보기</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div style={{ padding: 16, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
            {taskLoading && <div style={{ color: "#999", fontSize: 13 }}>불러오는 중...</div>}
            {taskError && <div style={{ color: "#e17055", fontSize: 13 }}>{taskError}</div>}
            {!taskLoading && !taskError && Object.keys(tasksByAssignee).length === 0 && (
              <div style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>등록된 할 일이 없어요.</div>
            )}

            {orderedAssigneeNames.map((assignee) => {
              const list = tasksByAssignee[assignee];
              return (
              <div
                key={assignee}
                draggable={canReorderAssignees}
                onDragStart={handleAssigneeDragStart(assignee)}
                onDragOver={handleAssigneeDragOver(assignee)}
                onDrop={handleAssigneeDrop(orderedAssigneeNames)(assignee)}
                onDragEnd={handleAssigneeDragEnd}
                style={{
                  marginBottom: 14,
                  border: dragOverAssignee === assignee ? "1px dashed #00b894" : "1px solid #eee",
                  borderRadius: 8,
                  opacity: dragAssignee === assignee ? 0.5 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f8f9fa", borderBottom: "1px solid #eee", borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                    {canReorderAssignees && (
                      <span
                        title="드래그해서 순서 바꾸기"
                        style={{ cursor: "grab", color: "#b2bec3", fontSize: 13, padding: "0 2px", userSelect: "none" }}
                      >
                        ⠿
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEmojiPickerFor((cur) => (cur === assignee ? null : assignee))}
                      title="이모지 바꾸기"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 4px", borderRadius: 6 }}
                    >
                      {getAssigneeEmoji(assignee)}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#2d3436" }}>{assignee}</span>
                    {emojiPickerFor === assignee && (
                      <div
                        ref={emojiPopoverRef}
                        style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderRadius: 10, overflow: "hidden" }}
                      >
                        <EmojiPicker
                          onEmojiClick={(emojiData) => saveAssigneeEmoji(assignee, emojiData.emoji)}
                          width={280}
                          height={320}
                          skinTonesDisabled
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {importNotes[assignee] && (
                      <span style={{ fontSize: 11, color: "#636e72" }}>{importNotes[assignee]}</span>
                    )}
                    <button
                      onClick={() => importAssignee(assignee)}
                      disabled={!!importingAssignees[assignee]}
                      title="지난주에 이 담당자 항목이 있었으면 이번 주로 복사해와요"
                      style={{
                        fontSize: 11,
                        border: "1px solid #ddd",
                        borderRadius: 6,
                        padding: "3px 8px",
                        background: "white",
                        color: "#636e72",
                        cursor: importingAssignees[assignee] ? "default" : "pointer",
                        opacity: importingAssignees[assignee] ? 0.6 : 1,
                      }}
                    >
                      {importingAssignees[assignee] ? "..." : "⬅ 지난주"}
                    </button>
                  </div>
                </div>

                <div style={{ padding: "6px 12px", borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                  {list.map((task) => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                      <input type="checkbox" checked={!!task.done} onChange={() => toggleDone(task)} />
                      {editingTaskId === task.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onBlur={() => commitEditingTask(task)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 등 IME 조합 중 처리 방지
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur(); // blur 핸들러에서 저장
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEditingTask();
                            }
                          }}
                          style={{
                            flex: 1,
                            fontSize: 13,
                            border: "none",
                            outline: "none",
                            background: "#fff",
                            boxShadow: "0 0 0 1px #00b894 inset",
                            borderRadius: 4,
                            padding: "3px 5px",
                            color: "#2d3436",
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => startEditingTask(task)}
                          title="클릭해서 수정"
                          style={{
                            fontSize: 13,
                            flex: 1,
                            color: task.done ? "#b2bec3" : "#2d3436",
                            textDecoration: task.done ? "line-through" : "none",
                            cursor: "text",
                            padding: "3px 5px",
                            borderRadius: 4,
                          }}
                        >
                          {task.content}
                        </span>
                      )}
                      <button
                        onClick={() => deleteTask(task)}
                        style={{ background: "none", border: "none", color: "#b2bec3", cursor: "pointer", fontSize: 13 }}
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {/* 이 담당자 밑에 바로 이어서 입력 → Enter로 즉시 등록 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <span style={{ width: 16, textAlign: "center", color: "#dfe6e9", fontSize: 13 }}>＋</span>
                    <input
                      type="text"
                      placeholder="할 일 입력 후 Enter"
                      value={drafts[assignee] || ""}
                      onChange={(e) => setDraft(assignee, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 등 IME 조합 중 Enter 중복 방지
                        quickAdd(assignee, drafts[assignee] || "");
                      }}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        padding: "4px 0",
                        color: "#2d3436",
                      }}
                    />
                  </div>
                </div>
              </div>
            );})}

            {quickAddError && <div style={{ color: "#e17055", fontSize: 12, marginBottom: 8 }}>{quickAddError}</div>}

            {/* 지난주엔 있었지만 이번주엔 아직 섹션이 없는 담당자 → 칩 클릭 한 번으로 섹션 생성 + 항목 복사 */}
            {assigneeFilter === "전체" && newPrevAssignees.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 12px", border: "1px dashed #dfe6e9", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>지난주에 있었던 담당자 (이번주엔 아직 없음)</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {newPrevAssignees.map((a) => (
                    <button
                      key={a}
                      onClick={() => importAssignee(a)}
                      disabled={!!importingAssignees[a]}
                      style={{
                        fontSize: 12,
                        border: "1px solid #ddd",
                        borderRadius: 14,
                        padding: "4px 12px",
                        background: "white",
                        color: "#2d3436",
                        cursor: importingAssignees[a] ? "default" : "pointer",
                        opacity: importingAssignees[a] ? 0.6 : 1,
                      }}
                    >
                      {importingAssignees[a] ? `${a} 불러오는 중...` : `${getAssigneeEmoji(a)} ${a} 불러오기`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showNewAssignee ? (
              <div style={{ background: "#f8f9fa", borderRadius: 8, border: "1px solid #eee", padding: 10, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="담당자 이름"
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    handleAddNewAssignee();
                  }}
                  style={{ flex: 1, minWidth: 90, fontSize: 13, border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" }}
                  autoFocus
                />
                <input
                  placeholder="첫 할 일 입력 후 Enter"
                  value={newAssigneeContent}
                  onChange={(e) => setNewAssigneeContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    handleAddNewAssignee();
                  }}
                  style={{ flex: 2, minWidth: 140, fontSize: 13, border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" }}
                />
                <button
                  onClick={() => { setShowNewAssignee(false); setNewAssigneeName(""); setNewAssigneeContent(""); }}
                  style={{ background: "none", border: "none", color: "#b2bec3", cursor: "pointer", fontSize: 13 }}
                >
                  취소
                </button>
              </div>
            ) : (
              <div
                onClick={() => setShowNewAssignee(true)}
                style={{ marginTop: 8, textAlign: "center", padding: "8px", border: "1px dashed #dfe6e9", borderRadius: 8, cursor: "pointer", color: "#636e72", fontSize: 13 }}
              >
                ＋ 새 담당자 추가
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
