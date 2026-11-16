// yv-hub '카드뉴스' 탭
// public/weekly-card.html 을 그대로 띄우는 탭입니다.
// 카드 디자인·본문·색 테마 수정은 public/weekly-card.html 한 파일에서만 하면 돼요.
export default function WeeklyCardTab() {
  return (
    <iframe
      src="/weekly-card.html"
      title="주간 카드뉴스"
      style={{ display: "block", width: "100%", height: "calc(100vh - 52px)", border: "none", background: "#f1f2f4" }}
      allow="clipboard-write"
    />
  );
}
