import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

const WEEKLY_TABLE = "weekly_tasks";

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

// ---------- 컴포넌트 ----------

export default function WeeklyTab() {
  const [weekMonday, setWeekMonday] = useState(() => getMonday(getKstNow()));

  const weekEnd = useMemo(() => addDays(weekMonday, 7), [weekMonday]);
  const weekKey = useMemo(() => toDateKey(weekMonday), [weekMonday]);
  const isCurrentWeek = useMemo(() => toDateKey(getMonday(getKstNow())) === weekKey, [weekKey]);

  // ----- 캘린더 일정 -----
  const [events, setEvents] = useState([]);
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

  // ----- 담당자별 체크리스트 -----
  const [tasks, setTasks] = useState([]);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");

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
                    {dayEvents.map((ev, i) => (
                      <div key={i} style={{ fontSize: 13, padding: "4px 0", color: "#2d3436" }}>
                        • {ev.title}
                        {!ev.allDay && <span style={{ color: "#888" }}> ({formatTime(ev.start)}~{formatTime(ev.end)})</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
          </div>
        </div>

        {/* 담당자별 체크리스트 (수동) */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
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

          <div style={{ padding: 16 }}>
            {taskLoading && <div style={{ color: "#999", fontSize: 13 }}>불러오는 중...</div>}
            {taskError && <div style={{ color: "#e17055", fontSize: 13 }}>{taskError}</div>}
            {!taskLoading && !taskError && Object.keys(tasksByAssignee).length === 0 && (
              <div style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>등록된 할 일이 없어요.</div>
            )}

            {Object.entries(tasksByAssignee).map(([assignee, list]) => (
              <div key={assignee} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#2d3436" }}>🙋 {assignee}</div>
                {list.map((task) => (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <input type="checkbox" checked={!!task.done} onChange={() => toggleDone(task)} />
                    <span
                      style={{
                        fontSize: 13,
                        flex: 1,
                        color: task.done ? "#b2bec3" : "#2d3436",
                        textDecoration: task.done ? "line-through" : "none",
                      }}
                    >
                      {task.content}
                    </span>
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
                      if (e.key === "Enter") quickAdd(assignee, drafts[assignee] || "");
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
            ))}

            {quickAddError && <div style={{ color: "#e17055", fontSize: 12, marginBottom: 8 }}>{quickAddError}</div>}

            {/* 아직 목록에 없는 새 담당자 추가 */}
            {showNewAssignee ? (
              <div style={{ background: "#f8f9fa", borderRadius: 8, border: "1px solid #eee", padding: 10, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="담당자 이름"
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddNewAssignee(); }}
                  style={{ flex: 1, minWidth: 90, fontSize: 13, border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" }}
                  autoFocus
                />
                <input
                  placeholder="첫 할 일 입력 후 Enter"
                  value={newAssigneeContent}
                  onChange={(e) => setNewAssigneeContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddNewAssignee(); }}
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
