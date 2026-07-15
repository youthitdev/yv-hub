import React, { useState, useEffect, useCallback, useRef } from "react";
import Papa from "papaparse";
import { Plus, RefreshCw, ExternalLink, X, AlertCircle, Users, Clock, Building2, Calendar, Pencil, Check, GripVertical } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { supabase } from "../supabaseClient";

const TABLE = "application_tracker_programs";

// ---------- helpers ----------

function parseSheetInfo(url) {
  if (!url) return null;
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

function relativeTime(ts, now) {
  if (!ts) return "아직 확인 전";
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 확인";
  if (min < 60) return `${min}분 전 확인`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전 확인`;
  const day = Math.floor(hr / 24);
  return `${day}일 전 확인`;
}

// "2026.07.01~07.31" 같은 자유 텍스트에서 마감일(마지막 날짜)을 추정
function parseEndDate(periodStr) {
  if (!periodStr) return null;
  const tokens = [
    ...periodStr.matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})|(\d{1,2})[.\-/](\d{1,2})(?!\d)/g),
  ];
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  let year, month, day;
  if (last[1]) {
    year = parseInt(last[1], 10);
    month = parseInt(last[2], 10);
    day = parseInt(last[3], 10);
  } else {
    month = parseInt(last[4], 10);
    day = parseInt(last[5], 10);
    const withYear = tokens.find((t) => t[1]);
    year = withYear ? parseInt(withYear[1], 10) : new Date().getFullYear();
  }
  const d = new Date(year, month - 1, day, 23, 59, 59);
  return isNaN(d.getTime()) ? null : d;
}

function isRecruitmentClosed(periodStr, nowMs) {
  const end = parseEndDate(periodStr);
  if (!end) return false;
  return nowMs > end.getTime();
}

// 구글폼이 자동으로 넣는 타임스탬프 문자열을 Date로 변환 (한국어/영어 표기 모두 대응)
function parseTimestamp(str) {
  if (!str) return null;
  const s = String(str).trim();
  const kr = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s+(오전|오후)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (kr) {
    let [, y, m, d, ap, h, mi, se] = kr;
    y = +y; m = +m; d = +d; h = +h; mi = +mi; se = se ? +se : 0;
    if (ap === "오후" && h !== 12) h += 12;
    if (ap === "오전" && h === 12) h = 0;
    const parsedDate = new Date(y, m - 1, d, h, mi, se);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  }
  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

async function fetchCount(sheetUrl) {
  const info = parseSheetInfo(sheetUrl);
  if (!info) throw new Error("링크에서 시트 정보를 찾지 못했어요. 구글시트 주소를 다시 확인해주세요.");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${info.id}/gviz/tq?tqx=out:csv&gid=${info.gid}`;
  let res;
  try {
    res = await fetch(csvUrl);
  } catch (e) {
    throw new Error("시트에 연결할 수 없어요. 인터넷 연결을 확인해주세요.");
  }
  if (!res.ok) {
    throw new Error("시트를 불러올 수 없어요. 공유 설정을 확인해주세요.");
  }
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    throw new Error("시트 공유 설정이 필요해요. '링크가 있는 모든 사용자 - 뷰어'로 바꿔주세요.");
  }
  const parsed = Papa.parse(trimmed);
  const rows = (parsed.data || []).filter((r) => Array.isArray(r) && r.some((cell) => String(cell).trim() !== ""));
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const total = dataRows.length;

  let recent7 = null;
  const headerFirst = String(header[0] || "");
  if (/타임스탬프|timestamp|시간/i.test(headerFirst)) {
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let cnt = 0;
    let anyParsed = false;
    for (const row of dataRows) {
      const d = parseTimestamp(row[0]);
      if (d) {
        anyParsed = true;
        if (d.getTime() >= threshold) cnt++;
      }
    }
    if (anyParsed) recent7 = cnt;
  }

  return { total: Math.max(total, 0), recent7 };
}

// ---------- component ----------

// 사업명 키워드로 어울리는 이모지 추천 (사용자가 직접 바꿀 수도 있음)
function guessEmoji(name) {
  const n = (name || "").toLowerCase();
  const rules = [
    [["독서", "책", "북클럽", "도서"], "📚"],
    [["서점", "책방"], "📖"],
    [["음악", "뮤직", "밴드", "노래", "페스티벌"], "🎵"],
    [["글쓰기", "문장력", "작가", "에세이", "시나리오"], "✍️"],
    [["미술", "그림", "디자인", "일러스트"], "🎨"],
    [["멘토", "상담", "코칭"], "🤝"],
    [["진로", "커리어", "취업"], "🧭"],
    [["캠프", "여행", "체험"], "🎒"],
    [["요리", "베이킹", "쿠킹"], "🍳"],
    [["운동", "스포츠", "축구", "농구"], "⚽"],
    [["영화", "미디어", "촬영", "영상"], "🎬"],
    [["사진"], "📷"],
    [["루틴", "습관"], "✅"],
    [["소모임", "모임", "커뮤니티", "네트워킹"], "👥"],
    [["봉사", "나눔"], "🤲"],
    [["취업", "면접"], "💼"],
  ];
  for (const [keywords, emoji] of rules) {
    if (keywords.some((k) => n.includes(k.toLowerCase()))) return emoji;
  }
  return "🌱";
}

// 이모지 칸을 누르면 뜨는 선택 팝오버 (노션 이모지 선택 느낌)
function EmojiPickerButton({ value, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="yv-emoji-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className="yv-input yv-emoji-input yv-emoji-btn"
        onClick={() => setOpen((o) => !o)}
        title="이모지 선택"
      >
        {value || placeholder}
      </button>
      {open && (
        <div className="yv-emoji-popover">
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              onChange(emojiData.emoji);
              setOpen(false);
            }}
            width={288}
            height={340}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}

// 프로그램 대상 분류
const TARGET_TYPES = [
  { key: "youth", label: "청소년", color: "#106e5c" },
  { key: "adult", label: "어른", color: "#3b6fa0" },
  { key: "partner", label: "파트너", color: "#b8862c" },
];

export default function TrackerTab() {
  const [programs, setPrograms] = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [refreshMinutes, setRefreshMinutes] = useState(5);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newTargetType, setNewTargetType] = useState("youth");
  const [newPartner, setNewPartner] = useState("");
  const [newPeriod, setNewPeriod] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editTargetType, setEditTargetType] = useState("youth");
  const [editPartner, setEditPartner] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editError, setEditError] = useState("");
  const [sortMode, setSortMode] = useState("custom"); // 'custom' | 'latest' | 'deadline'
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const justUpdatedTimers = useRef({});

  const mergeState = (rows) =>
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji || guessEmoji(r.name),
      targetType: r.target_type || "youth",
      partner: r.partner || "",
      recruitPeriod: r.recruit_period || "",
      sheetUrl: r.sheet_url,
      sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
      createdAt: r.created_at,
      count: null,
      recent7: null,
      status: "loading",
      errorMsg: "",
      lastUpdated: null,
      justUpdated: false,
    }));

  const loadPrograms = useCallback(async () => {
    setLoadingInit(true);
    setLoadError("");
    const { data, error } = await supabase.from(TABLE).select("*").order("sort_order", { ascending: true, nullsFirst: false });
    if (error) {
      setLoadError("목록을 불러오지 못했어요. Supabase 테이블/환경변수 설정을 확인해주세요.");
      setLoadingInit(false);
      return;
    }
    const withState = mergeState(data || []);
    setPrograms(withState);
    setLoadingInit(false);
    withState.forEach((p) => refreshOne(p.id, withState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPrograms();
    // realtime: reload list when another team member adds/removes a program
    const channel = supabase
      .channel("program-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
        loadPrograms();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (refreshMinutes <= 0) return;
    const t = setInterval(() => refreshAll(), refreshMinutes * 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMinutes, programs.length]);

  const refreshOne = useCallback((id, listOverride) => {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, status: "loading" } : p)));

    (async () => {
      const list = listOverride || programs;
      const target = list.find((p) => p.id === id) || programs.find((p) => p.id === id);
      if (!target) return;
      try {
        const { total, recent7 } = await fetchCount(target.sheetUrl);
        setPrograms((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            const changed = p.count !== null && p.count !== total;
            if (changed) {
              clearTimeout(justUpdatedTimers.current[id]);
              justUpdatedTimers.current[id] = setTimeout(() => {
                setPrograms((cur) => cur.map((q) => (q.id === id ? { ...q, justUpdated: false } : q)));
              }, 900);
            }
            return { ...p, count: total, recent7, status: "ok", errorMsg: "", lastUpdated: Date.now(), justUpdated: changed };
          })
        );
      } catch (e) {
        setPrograms((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "error", errorMsg: e.message, lastUpdated: Date.now() } : p))
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs]);

  const refreshAll = useCallback(() => {
    setPrograms((prev) => {
      prev.forEach((p) => refreshOne(p.id, prev));
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOne]);

  // 정렬 모드에 따라 화면에 보여줄 순서 계산 (custom은 sortOrder = 드래그로 정한 순서)
  const displayedPrograms = React.useMemo(() => {
    const list = [...programs];
    if (sortMode === "latest") {
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortMode === "deadline") {
      const sortKey = (p) => {
        const end = parseEndDate(p.recruitPeriod);
        if (!end) return { bucket: 1, time: 0 }; // 날짜 없음(상시 등) - 중간
        const isClosed = now > end.getTime();
        if (isClosed) return { bucket: 2, time: -end.getTime() }; // 마감됨 - 맨 아래, 최근 마감 순
        return { bucket: 0, time: end.getTime() }; // 모집중 - 마감 가까운 순
      };
      list.sort((a, b) => {
        const ka = sortKey(a);
        const kb = sortKey(b);
        return ka.bucket !== kb.bucket ? ka.bucket - kb.bucket : ka.time - kb.time;
      });
    } else {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    // 정렬 모드와 상관없이 마감된 프로그램은 항상 맨 뒤로 (그룹 내 순서는 유지)
    list.sort((a, b) => {
      const ca = isRecruitmentClosed(a.recruitPeriod, now) ? 1 : 0;
      const cb = isRecruitmentClosed(b.recruitPeriod, now) ? 1 : 0;
      return ca - cb;
    });
    return list;
  }, [programs, sortMode, now]);

  const groupedPrograms = React.useMemo(() => {
    return TARGET_TYPES.map((t) => {
      const items = displayedPrograms.filter((p) => (p.targetType || "youth") === t.key);
      const subtotal = items.reduce((sum, p) => sum + (typeof p.count === "number" ? p.count : 0), 0);
      return { ...t, items, subtotal };
    });
  }, [displayedPrograms]);

  const persistOrder = useCallback(async (orderedIds) => {
    setPrograms((prev) => {
      const byId = Object.fromEntries(prev.map((p) => [p.id, p]));
      return orderedIds.map((id, idx) => ({ ...byId[id], sortOrder: idx }));
    });
    await Promise.all(orderedIds.map((id, idx) => supabase.from(TABLE).update({ sort_order: idx }).eq("id", id)));
  }, []);

  const handleDragStart = (id) => {
    if (sortMode !== "custom") return;
    setDragId(id);
  };

  const handleDragOverCard = (id) => (e) => {
    if (sortMode !== "custom" || !dragId || dragId === id) return;
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDropCard = (id) => (e) => {
    if (sortMode !== "custom" || !dragId || dragId === id) return;
    e.preventDefault();
    const currentOrder = displayedPrograms.map((p) => p.id);
    const fromIdx = currentOrder.indexOf(dragId);
    const toIdx = currentOrder.indexOf(id);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...currentOrder];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    persistOrder(next);
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleAdd = async () => {
    const name = newName.trim();
    const partner = newPartner.trim();
    const recruitPeriod = newPeriod.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      setAddError("사업명과 시트 링크를 모두 입력해주세요.");
      return;
    }
    const info = parseSheetInfo(url);
    if (!info) {
      setAddError("구글시트 링크 형식을 확인해주세요.");
      return;
    }
    const nextSortOrder = programs.length > 0 ? Math.max(...programs.map((p) => p.sortOrder ?? 0)) + 1 : 0;
    const emoji = newEmoji.trim() || guessEmoji(name);
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        name,
        emoji,
        target_type: newTargetType,
        partner,
        recruit_period: recruitPeriod,
        sheet_url: url,
        sort_order: nextSortOrder,
      })
      .select()
      .single();
    if (error) {
      setAddError("추가하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const newProgram = {
      id: data.id,
      name: data.name,
      emoji: data.emoji || emoji,
      targetType: data.target_type || newTargetType,
      partner: data.partner || "",
      recruitPeriod: data.recruit_period || "",
      sheetUrl: data.sheet_url,
      sortOrder: data.sort_order ?? nextSortOrder,
      createdAt: data.created_at,
      count: null,
      recent7: null,
      status: "loading",
      errorMsg: "",
      lastUpdated: null,
      justUpdated: false,
    };
    setPrograms((prev) => [...prev, newProgram]);
    setNewName("");
    setNewEmoji("");
    setNewTargetType("youth");
    setNewPartner("");
    setNewPeriod("");
    setNewUrl("");
    setAddError("");
    setShowAddForm(false);
    refreshOne(newProgram.id, [...programs, newProgram]);
  };

  const handleDelete = async (id) => {
    await supabase.from(TABLE).delete().eq("id", id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEmoji(p.emoji || "");
    setEditTargetType(p.targetType || "youth");
    setEditPartner(p.partner || "");
    setEditPeriod(p.recruitPeriod || "");
    setEditUrl(p.sheetUrl);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError("");
  };

  const saveEdit = async (id) => {
    const name = editName.trim();
    const emoji = editEmoji.trim() || guessEmoji(name);
    const partner = editPartner.trim();
    const recruitPeriod = editPeriod.trim();
    const url = editUrl.trim();
    if (!name || !url) {
      setEditError("사업명과 시트 링크는 비워둘 수 없어요.");
      return;
    }
    const info = parseSheetInfo(url);
    if (!info) {
      setEditError("구글시트 링크 형식을 확인해주세요.");
      return;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update({ name, emoji, target_type: editTargetType, partner, recruit_period: recruitPeriod, sheet_url: url })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      setEditError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const urlChanged = programs.find((p) => p.id === id)?.sheetUrl !== url;
    const updatedList = programs.map((p) =>
      p.id === id
        ? {
            ...p,
            name: data.name,
            emoji: data.emoji || emoji,
            targetType: data.target_type || editTargetType,
            partner: data.partner || "",
            recruitPeriod: data.recruit_period || "",
            sheetUrl: data.sheet_url,
          }
        : p
    );
    setPrograms(updatedList);
    setEditingId(null);
    setEditError("");
    if (urlChanged) refreshOne(id, updatedList);
  };

  const total = programs.reduce((sum, p) => sum + (typeof p.count === "number" ? p.count : 0), 0);
  const anyLoading = programs.some((p) => p.status === "loading");

  return (
    <div className="yv-dash">
      <style>{`
        .yv-dash {
          --bg: #f4f6f5;
          --surface: #ffffff;
          --surface-alt: #eef2f0;
          --border: #dde3e0;
          --text: #1c2320;
          --text-muted-solid: #6c756e;
          --accent: #106e5c;
          --accent-soft: #e2f0ec;
          --error: #a4342a;
          --error-soft: #fbeceb;
          font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          padding: 40px 28px;
          box-sizing: border-box;
        }
        .yv-dash * { box-sizing: border-box; }
        .yv-num { font-family: 'Space Grotesk', -apple-system, sans-serif; }
        .yv-wrap { max-width: 1080px; margin: 0 auto; }

        .yv-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
        }
        .yv-eyebrow {
          font-size: 12px;
          letter-spacing: 0.08em;
          font-weight: 600;
          color: var(--accent);
          text-transform: uppercase;
          margin: 0 0 6px 0;
        }
        .yv-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .yv-total-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 220px;
        }
        .yv-total-main { display: flex; align-items: center; gap: 14px; }
        .yv-total-breakdown { display: flex; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 8px; }
        .yv-breakdown-item { font-size: 11.5px; color: var(--text-muted-solid); display: flex; align-items: center; gap: 5px; }
        .yv-breakdown-item strong { color: var(--text); font-weight: 700; }
        .yv-breakdown-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .yv-total-num { font-size: 28px; font-weight: 700; color: var(--accent); line-height: 1; }
        .yv-total-label { font-size: 12px; color: var(--text-muted-solid); }

        .yv-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .yv-select {
          font-size: 13px; border: 1px solid var(--border); background: var(--surface);
          border-radius: 8px; padding: 6px 10px; color: var(--text);
        }
        .yv-btn {
          display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600;
          border: 1px solid var(--border); background: var(--surface); color: var(--text);
          border-radius: 8px; padding: 7px 12px; cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .yv-btn:hover { background: var(--surface-alt); }
        .yv-btn:active { transform: scale(0.97); }
        .yv-btn.yv-btn-accent { background: var(--accent); border-color: var(--accent); color: #fff; }
        .yv-btn.yv-btn-accent:hover { background: #0d5c4d; }
        .yv-spin { animation: yv-spin 0.9s linear infinite; }
        @keyframes yv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .yv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .yv-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
          padding: 18px; position: relative; min-height: 168px;
          display: flex; flex-direction: column; justify-content: space-between; gap: 8px;
          transition: border-color 0.15s ease, transform 0.1s ease;
          border-left: 4px solid transparent;
        }
        .yv-card-cat-youth { background: #eef6f2; border-left-color: #106e5c; }
        .yv-card-cat-adult { background: #eef3f9; border-left-color: #3b6fa0; }
        .yv-card-cat-partner { background: #fbf4e7; border-left-color: #b8862c; }
        .yv-card-closed.yv-card-cat-youth,
        .yv-card-closed.yv-card-cat-adult,
        .yv-card-closed.yv-card-cat-partner { background: var(--surface-alt); }
        .yv-draggable { cursor: grab; }
        .yv-draggable:active { cursor: grabbing; }
        .yv-drag-over { border-color: var(--accent); border-style: dashed; transform: scale(1.01); }
        .yv-grip { color: var(--text-muted-solid); opacity: 0.6; flex-shrink: 0; margin-top: 2px; }
        .yv-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .yv-card-name {
          font-size: 14px; font-weight: 600; margin: 0; word-break: keep-all;
          display: flex; align-items: flex-start; gap: 6px; flex: 1; min-width: 0;
        }
        .yv-card-name-text { display: inline; }
        .yv-title-emoji { flex-shrink: 0; font-size: 15px; line-height: 1.3; }
        .yv-name-row { display: flex; gap: 8px; }
        .yv-name-row .yv-emoji-input.yv-input { width: 44px; flex: none; text-align: center; padding-left: 0; padding-right: 0; }
        .yv-name-row .yv-input:not(.yv-emoji-input) { flex: 1; min-width: 0; }
        .yv-emoji-picker-wrap { position: relative; flex-shrink: 0; }
        .yv-emoji-btn {
          height: 100%; cursor: pointer; font-size: 18px; line-height: 1;
          display: flex; align-items: center; justify-content: center;
          background: var(--surface); appearance: none; -webkit-appearance: none;
        }
        .yv-emoji-btn:hover { background: var(--surface-alt); }
        .yv-emoji-popover {
          position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); border-radius: 10px; overflow: hidden;
        }
        .yv-badge-closed {
          font-size: 10.5px; font-weight: 700; color: #8b9088; background: #e6e9e7;
          border-radius: 999px; padding: 2px 8px; letter-spacing: 0.02em;
        }
        .yv-card-closed { background: var(--surface-alt); filter: grayscale(0.55); opacity: 0.72; }
        .yv-card-closed .yv-count { color: var(--text-muted-solid); }
        .yv-meta { display: flex; flex-direction: column; gap: 3px; }
        .yv-meta-item {
          display: flex; align-items: center; gap: 5px; font-size: 11.5px;
          color: var(--text-muted-solid); word-break: keep-all;
        }
        .yv-icon-btn {
          background: transparent; border: none; color: var(--text-muted-solid); cursor: pointer;
          padding: 2px; border-radius: 6px; display: inline-flex; opacity: 0.55; transition: opacity 0.15s ease;
        }
        .yv-icon-btn:hover { opacity: 1; background: var(--surface-alt); }

        .yv-count-row { display: flex; align-items: baseline; gap: 6px; margin: 10px 0 6px 0; }
        .yv-count { font-size: 34px; font-weight: 700; transition: transform 0.25s ease, color 0.25s ease; }
        .yv-count.yv-pulse { color: var(--accent); transform: scale(1.12); }
        .yv-unit { font-size: 13px; color: var(--text-muted-solid); font-weight: 500; }
        .yv-view-btn {
          margin-left: auto;
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11.5px; font-weight: 700; color: var(--accent);
          background: var(--accent-soft); border-radius: 999px; padding: 5px 10px;
          text-decoration: none; white-space: nowrap;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .yv-view-btn:hover { background: #cfe8e0; }
        .yv-view-btn:active { transform: scale(0.96); }

        .yv-status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted-solid); }
        .yv-dot { width: 7px; height: 7px; border-radius: 50%; background: #b7bdb9; flex-shrink: 0; }
        .yv-dot.ok { background: var(--accent); }
        .yv-dot.error { background: var(--error); }
        .yv-dot.loading { background: #c9a227; }

        .yv-error-note {
          margin-top: 8px; font-size: 12px; color: var(--error); background: var(--error-soft);
          border-radius: 8px; padding: 8px 10px; line-height: 1.4;
        }
        .yv-recent-badge {
          margin-top: 8px; font-size: 11.5px; color: var(--accent);
          background: var(--accent-soft); border-radius: 8px; padding: 6px 10px; line-height: 1.3;
        }
        .yv-recent-badge strong { font-weight: 700; }

        .yv-delete-confirm { display: flex; gap: 6px; align-items: center; }
        .yv-delete-confirm button {
          font-size: 11px; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border);
          background: var(--surface); cursor: pointer;
        }
        .yv-delete-confirm button.yv-danger { background: var(--error); color: #fff; border-color: var(--error); }

        .yv-add-card {
          border: 1.5px dashed var(--border); border-radius: 14px; min-height: 168px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          color: var(--text-muted-solid); font-size: 13px; font-weight: 600; gap: 6px;
          background: transparent; transition: background 0.15s ease, color 0.15s ease;
        }
        .yv-add-card:hover { background: var(--surface-alt); color: var(--accent); }

        .yv-form-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
          padding: 16px; display: flex; flex-direction: column; gap: 8px;
        }
        .yv-segmented { display: flex; gap: 6px; }
        .yv-segmented-btn {
          flex: 1; font-size: 12px; font-weight: 600; padding: 6px 8px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--surface); color: var(--text-muted-solid);
          cursor: pointer; transition: all 0.15s ease;
        }
        .yv-segmented-btn.yv-segmented-active { color: #fff; }
        .yv-segmented-btn:hover:not(.yv-segmented-active) { background: var(--surface-alt); }
        .yv-edit-form { display: flex; flex-direction: column; gap: 8px; }
        .yv-input { font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; width: 100%; font-family: inherit; }
        .yv-input:focus, .yv-select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
        .yv-hint { font-size: 11px; color: var(--text-muted-solid); line-height: 1.4; }
        .yv-form-actions { display: flex; gap: 8px; margin-top: 4px; }
        .yv-add-error { font-size: 12px; color: var(--error); }

        .yv-group { margin-bottom: 22px; }
        .yv-group-header {
          display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700;
          color: var(--text); margin-bottom: 10px;
        }
        .yv-group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .yv-group-count { font-size: 11.5px; font-weight: 500; color: var(--text-muted-solid); }
        .yv-empty-mini {
          grid-column: 1 / -1; font-size: 12px; color: var(--text-muted-solid);
          padding: 14px 4px;
        }
        .yv-empty { grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: var(--text-muted-solid); font-size: 13px; }
        .yv-load-error {
          grid-column: 1 / -1; text-align: center; padding: 24px 16px; color: var(--error);
          background: var(--error-soft); border-radius: 12px; font-size: 13px;
        }
      `}</style>

      <div className="yv-wrap">
        <div className="yv-head">
          <div>
            <p className="yv-eyebrow">YOUTHVOICE · 지원서 접수 현황</p>
            <h1 className="yv-title">프로그램별 신청자 수</h1>
          </div>
          <div className="yv-total-card">
            <div className="yv-total-main">
              <Users size={22} color="#106e5c" />
              <div>
                <div className="yv-total-num yv-num">{total.toLocaleString()}</div>
                <div className="yv-total-label">전체 지원자</div>
              </div>
            </div>
            <div className="yv-total-breakdown">
              {groupedPrograms.map((g) => (
                <div key={g.key} className="yv-breakdown-item">
                  <span className="yv-breakdown-dot" style={{ background: g.color }} />
                  {g.label} <strong>{g.subtotal.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="yv-toolbar">
          <button className="yv-btn yv-btn-accent" onClick={refreshAll} disabled={anyLoading}>
            <RefreshCw size={14} className={anyLoading ? "yv-spin" : ""} />
            전체 새로고침
          </button>
          <select className="yv-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="custom">직접 정렬 (드래그)</option>
            <option value="latest">최신순</option>
            <option value="deadline">마감순</option>
          </select>
          <select className="yv-select" value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value))}>
            <option value={1}>1분마다 자동 새로고침</option>
            <option value={5}>5분마다 자동 새로고침</option>
            <option value={10}>10분마다 자동 새로고침</option>
            <option value={30}>30분마다 자동 새로고침</option>
            <option value={0}>자동 새로고침 끄기</option>
          </select>
        </div>

        {loadingInit ? (
          <div className="yv-grid">
            <div className="yv-empty">불러오는 중이에요…</div>
          </div>
        ) : loadError ? (
          <div className="yv-grid">
            <div className="yv-load-error">
              <AlertCircle size={14} style={{ marginRight: 4, verticalAlign: "-2px" }} />
              {loadError}
            </div>
          </div>
        ) : (
          <>
            <div className="yv-grid">
              {displayedPrograms.length === 0 && !showAddForm ? (
                <div className="yv-empty">아직 등록된 프로그램이 없어요. 아래에서 구글시트 링크를 추가해보세요.</div>
              ) : (
                displayedPrograms.map((p) => {
                const closed = isRecruitmentClosed(p.recruitPeriod, now);
                const catKey = p.targetType || "youth";
                return (
                <div
                  className={`yv-card yv-card-cat-${catKey} ${closed ? "yv-card-closed" : ""} ${sortMode === "custom" ? "yv-draggable" : ""} ${dragOverId === p.id ? "yv-drag-over" : ""}`}
                  key={p.id}
                  draggable={sortMode === "custom"}
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={handleDragOverCard(p.id)}
                  onDrop={handleDropCard(p.id)}
                  onDragEnd={handleDragEnd}
                >
                  {editingId === p.id ? (
                    <div className="yv-edit-form">
                      <div className="yv-name-row">
                        <EmojiPickerButton
                          value={editEmoji}
                          placeholder={guessEmoji(editName)}
                          onChange={setEditEmoji}
                        />
                        <input
                          className="yv-input"
                          placeholder="사업명"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ flex: 1 }}
                        />
                      </div>
                      <div className="yv-segmented">
                        {TARGET_TYPES.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            className={`yv-segmented-btn ${editTargetType === t.key ? "yv-segmented-active" : ""}`}
                            style={editTargetType === t.key ? { background: t.color, borderColor: t.color } : {}}
                            onClick={() => setEditTargetType(t.key)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <input
                        className="yv-input"
                        placeholder="파트너사 (선택)"
                        value={editPartner}
                        onChange={(e) => setEditPartner(e.target.value)}
                      />
                      <input
                        className="yv-input"
                        placeholder="모집기간 (선택)"
                        value={editPeriod}
                        onChange={(e) => setEditPeriod(e.target.value)}
                      />
                      <input
                        className="yv-input"
                        placeholder="구글시트 링크"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                      />
                      {editError && <p className="yv-add-error">{editError}</p>}
                      <div className="yv-form-actions">
                        <button className="yv-btn yv-btn-accent" onClick={() => saveEdit(p.id)}>
                          <Check size={13} /> 저장
                        </button>
                        <button className="yv-btn" onClick={cancelEdit}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="yv-card-head">
                    <p className="yv-card-name">
                      {sortMode === "custom" && <GripVertical size={14} className="yv-grip" />}
                      <span className="yv-title-emoji">{p.emoji || guessEmoji(p.name)}</span>
                      <span className="yv-card-name-text">
                        {p.name}
                        {closed && <span className="yv-badge-closed">마감</span>}
                      </span>
                    </p>
                    {confirmDeleteId === p.id ? (
                      <div className="yv-delete-confirm">
                        <button className="yv-danger" onClick={() => handleDelete(p.id)}>삭제</button>
                        <button onClick={() => setConfirmDeleteId(null)}>취소</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button className="yv-icon-btn" title="새로고침" onClick={() => refreshOne(p.id)}>
                          <RefreshCw size={14} className={p.status === "loading" ? "yv-spin" : ""} />
                        </button>
                        <button className="yv-icon-btn" title="수정" onClick={() => startEdit(p)}>
                          <Pencil size={14} />
                        </button>
                        <button className="yv-icon-btn" title="삭제" onClick={() => setConfirmDeleteId(p.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {(p.partner || p.recruitPeriod) && (
                    <div className="yv-meta">
                      {p.partner && (
                        <span className="yv-meta-item">
                          <Building2 size={11} /> {p.partner}
                        </span>
                      )}
                      {p.recruitPeriod && (
                        <span className="yv-meta-item">
                          <Calendar size={11} /> {p.recruitPeriod}
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="yv-count-row">
                      <span className={`yv-count yv-num ${p.justUpdated ? "yv-pulse" : ""}`}>
                        {typeof p.count === "number" ? p.count.toLocaleString() : "–"}
                      </span>
                      <span className="yv-unit">{catKey === "partner" ? "기관" : "명"}</span>
                      <a href={p.sheetUrl} target="_blank" rel="noreferrer" className="yv-view-btn">
                        <ExternalLink size={12} /> 지원서 보기
                      </a>
                    </div>
                    <div className="yv-status-row">
                      <span className={`yv-dot ${p.status}`} />
                      {p.status === "loading" ? (
                        <span>확인하는 중…</span>
                      ) : (
                        <>
                          <Clock size={11} />
                          <span>{relativeTime(p.lastUpdated, now)}</span>
                        </>
                      )}
                    </div>
                    {p.status === "error" && (
                      <div className="yv-error-note">
                        <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                        {p.errorMsg}
                      </div>
                    )}
                    {typeof p.recent7 === "number" && (
                      <div className="yv-recent-badge">
                        최근 7일 신규 <strong>{p.recent7.toLocaleString()}</strong>건
                      </div>
                    )}
                  </div>
                    </>
                  )}
                </div>
                );
                })
              )}

              {showAddForm ? (
                <div className="yv-form-card">
                  <div className="yv-name-row">
                    <EmojiPickerButton
                      value={newEmoji}
                      placeholder={guessEmoji(newName)}
                      onChange={setNewEmoji}
                    />
                    <input
                      className="yv-input"
                      placeholder="사업명 (예: TMI 프로젝트)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="yv-segmented">
                    {TARGET_TYPES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`yv-segmented-btn ${newTargetType === t.key ? "yv-segmented-active" : ""}`}
                        style={newTargetType === t.key ? { background: t.color, borderColor: t.color } : {}}
                        onClick={() => setNewTargetType(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="yv-input"
                    placeholder="파트너사 (선택, 예: OO재단)"
                    value={newPartner}
                    onChange={(e) => setNewPartner(e.target.value)}
                  />
                  <input
                    className="yv-input"
                    placeholder="모집기간 (선택, 예: 2026.07.01~07.31)"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                  />
                  <input
                    className="yv-input"
                    placeholder="구글시트 응답 시트 링크를 붙여넣어주세요"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                  <p className="yv-hint">
                    구글폼의 '응답' 탭에서 연결된 스프레드시트를 열고, 공유 설정을 '링크가 있는 모든 사용자 - 뷰어'로 바꾼 뒤 그 시트의 주소를 붙여넣어주세요. 이모지는 비워두면 사업명에 맞게 자동으로 골라드려요.
                  </p>
                  {addError && <p className="yv-add-error">{addError}</p>}
                  <div className="yv-form-actions">
                    <button className="yv-btn yv-btn-accent" onClick={handleAdd}>추가하기</button>
                    <button
                      className="yv-btn"
                      onClick={() => {
                        setShowAddForm(false);
                        setAddError("");
                        setNewName("");
                        setNewEmoji("");
                        setNewTargetType("youth");
                        setNewPartner("");
                        setNewPeriod("");
                        setNewUrl("");
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="yv-add-card" onClick={() => setShowAddForm(true)}>
                  <Plus size={16} /> 프로그램 추가
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
