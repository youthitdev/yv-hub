import { useState } from "react";
import WeeklyTab from "./tabs/WeeklyTab.jsx";
import GanttTab from "./tabs/GanttTab.jsx";
import TrackerTab from "./tabs/TrackerTab.jsx";

const NAV_HEIGHT = 52;

const TABS = [
  { key: "weekly", label: "🍀 이번주", Component: WeeklyTab },
  { key: "gantt", label: "📊 사업일정", Component: GanttTab },
  { key: "tracker", label: "📋 지원서트래커", Component: TrackerTab },
];

export default function App() {
  const [activeKey, setActiveKey] = useState("weekly");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>
      {/* 상단 탭 네비게이션 */}
      <div
        style={{
          height: NAV_HEIGHT,
          minHeight: NAV_HEIGHT,
          display: "flex",
          alignItems: "stretch",
          background: "#1e272e",
          borderBottom: "1px solid #111",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", color: "white", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
          YouthVoice Hub
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveKey(tab.key)}
            style={{
              border: "none",
              background: activeKey === tab.key ? "#2d3436" : "transparent",
              color: activeKey === tab.key ? "#ffffff" : "#b2bec3",
              fontWeight: activeKey === tab.key ? 700 : 500,
              fontSize: 14,
              padding: "0 18px",
              cursor: "pointer",
              borderBottom: activeKey === tab.key ? "2px solid #00b894" : "2px solid transparent",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠: 자체 스크롤 영역 (내부 sticky 요소가 이 영역 기준으로 동작하도록) */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {TABS.map((tab) => (
          <div key={tab.key} style={{ display: activeKey === tab.key ? "block" : "none", minHeight: "100%" }}>
            <tab.Component />
          </div>
        ))}
      </div>
    </div>
  );
}
