import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const TABLE = "yv_data";
const STORAGE_KEY = "gantt_v3";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
// 한국 시간(KST = UTC+9) 기준
const KST = new Date(new Date().toLocaleString("en-US", {timeZone:"Asia/Seoul"}));
const THIS_YEAR = KST.getFullYear();
const TODAY_MONTH = KST.getMonth() + 1;
const TODAY_DAY = KST.getDate();
const YEARS = Array.from({length:10},(_,i)=>THIS_YEAR+i);
const PRESET_COLORS = [
  "#27ae60","#e67e22","#2980b9","#16a085","#8e44ad","#c0392b",
  "#f39c12","#e84393","#636e72","#00b894","#0984e3","#6c5ce7",
  "#fd79a8","#00cec9","#fdcb6e","#e17055","#2d3436","#74b9ff",
];
const DEFAULT_CATS = [
  {id:"plan",   name:"기획/준비",    color:"#27ae60"},
  {id:"recruit",name:"모집/선발",    color:"#e67e22"},
  {id:"run",    name:"진행/운영",    color:"#2980b9"},
  {id:"edu",    name:"교육",         color:"#16a085"},
  {id:"event",  name:"행사/무대",    color:"#8e44ad"},
  {id:"result", name:"결과/모니터링",color:"#c0392b"},
];
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

function dateToFloat(m,d){ return m+(d-1)/DAYS[m-1]; }
function parseDate(s){
  const r=s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if(!r) return null;
  const m=+r[1],d=+r[2];
  if(m<1||m>12||d<1||d>31) return null;
  return dateToFloat(m,d);
}
function floatToLabel(f){
  const m=Math.floor(f);
  return `${m}/${Math.round((f-m)*DAYS[Math.min(m,12)-1])+1}`;
}
function catColor(cats,id){ return cats.find(c=>c.id===id)?.color??"#b2bec3"; }
function catName(cats,id){  return cats.find(c=>c.id===id)?.name??id??""; }

// Supabase
const sbH = {"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`};
async function dbGet(){
  try{ const r=await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${STORAGE_KEY}&select=value`,{headers:sbH});
    const rows=await r.json(); return rows?.length>0?JSON.parse(rows[0].value):null; }catch{ return null; }
}
async function dbSet(p){
  try{ const r=await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`,{method:"POST",headers:{...sbH,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key:STORAGE_KEY,value:JSON.stringify(p)})});
    return r.ok; }catch{ return false; }
}

function makeDefault(y){
  if(y!==2026) return [];
  return [
    {proj:"TMI 프로젝트\n(바보의나눔)",color:"#16a085",partner:"바보의나눔",manager1:"오민지",manager2:"이지원",rows:[
      {prog:"진로 멘토 교육자(기관) 모집",bars:[{s:3.5,e:4.5,cat:"recruit",l:"모집"}]},
      {prog:"참여자 모집, 선발",bars:[{s:4.0,e:5.5,cat:"recruit",l:"5/1~5/30"}]},
      {prog:"OT 및 진로탐방캠프",bars:[{s:5.75,e:6.2,cat:"run",l:"12~3"}]},
      {prog:"발견미션",bars:[{s:6.25,e:7.5,cat:"plan",l:"6/14~7/15"}]},
      {prog:"중간워크숍",bars:[{s:7.5,e:7.75,cat:"plan",l:"16"}]},
      {prog:"창작워크숍",bars:[{s:7.75,e:8.2,cat:"plan",l:"25"}]},
      {prog:"개별 창작 활동 (지원금)",bars:[{s:8.0,e:9.5,cat:"plan",l:"25~4"}]},
      {prog:"쇼케이스",bars:[{s:8.25,e:10.0,cat:"event",l:"8~21"}]},
      {prog:"결과보고",bars:[{s:10.5,e:12.5,cat:"result",l:"결과보고"}]},
    ]},
    {proj:"SMile Music Festival\n(SM엔티)",color:"#e67e22",partner:"SM엔티",manager1:"",manager2:"",rows:[
      {prog:"참여자 모집 및 선발",bars:[{s:3.5,e:6.0,cat:"recruit",l:"5/2~6/1"}]},
      {prog:"서포터즈 모집 및 선발",bars:[{s:5.0,e:7.5,cat:"recruit",l:"6/24~7/14"}]},
      {prog:"오리엔테이션",bars:[{s:7.0,e:7.5,cat:"run",l:"7~3"}]},
      {prog:"최종무대",bars:[{s:10.5,e:11.0,cat:"event",l:"15"}]},
      {prog:"모니터링",bars:[{s:8.0,e:12.5,cat:"result",l:"모니터링"}]},
    ]},
  ];
}
function makeAllDefault(){
  const o={};
  YEARS.forEach(y=>{ o[y]=makeDefault(y); });
  return o;
}

// ── 공통 컴포넌트 ──
function Modal({open,onClose,title,children}){
  if(!open) return null;
  return <div onClick={e=>e.target===e.currentTarget&&onClose()}
    style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"white",borderRadius:14,padding:28,width:480,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:18,color:"#2d3436"}}>{title}</h2>
      {children}
    </div>
  </div>;
}
function FG({label,children}){
  return <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:12,fontWeight:600,color:"#636e72",marginBottom:5}}>{label}</label>
    {children}
  </div>;
}
function Inp(props){
  return <input {...props} style={{width:"100%",padding:"8px 12px",border:"1.5px solid #dfe6e9",borderRadius:7,fontSize:13,outline:"none",...props.style}}
    onFocus={e=>e.target.style.borderColor="#00b894"} onBlur={e=>e.target.style.borderColor="#dfe6e9"}/>;
}
function Btn({children,onClick,color="#00b894",textColor="white",sm,style}){
  return <button onClick={onClick} style={{padding:sm?"4px 10px":"8px 18px",borderRadius:7,border:"none",cursor:"pointer",
    fontSize:sm?11:13,fontWeight:600,background:color,color:textColor,transition:"opacity 0.15s",...style}}
    onMouseEnter={e=>e.target.style.opacity="0.85"} onMouseLeave={e=>e.target.style.opacity="1"}>
    {children}
  </button>;
}
function ColorPicker({value,onChange}){
  const [hex,setHex]=useState(value||PRESET_COLORS[0]);
  useEffect(()=>setHex(value||PRESET_COLORS[0]),[value]);
  const apply=c=>{setHex(c);onChange(c);};
  return <div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
      {PRESET_COLORS.map(c=><div key={c} onClick={()=>apply(c)} style={{width:24,height:24,borderRadius:5,background:c,cursor:"pointer",
        border:c===hex?"2.5px solid #2d3436":"2.5px solid transparent",transform:c===hex?"scale(1.2)":"scale(1)",transition:"all 0.12s"}}/>)}
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <input type="color" value={hex} onChange={e=>apply(e.target.value)} style={{width:32,height:28,border:"none",padding:0,cursor:"pointer",borderRadius:5}}/>
      <input type="text" value={hex} maxLength={7} onChange={e=>{setHex(e.target.value);if(/^#[0-9a-fA-F]{6}$/.test(e.target.value))onChange(e.target.value);}}
        style={{flex:1,padding:"5px 8px",border:"1.5px solid #dfe6e9",borderRadius:6,fontSize:12,fontFamily:"monospace",outline:"none"}}/>
      <div style={{width:28,height:28,borderRadius:6,background:hex,border:"1.5px solid #dfe6e9"}}/>
    </div>
  </div>;
}

// ── 메인 ──
export default function GanttTab(){
  const [allData,setAllData] = useState(makeAllDefault());
  const [cats,setCats]       = useState(DEFAULT_CATS);
  const [loading,setLoading] = useState(true);
  const [saveStatus,setSave] = useState("idle");
  const [activeYear,setActiveYear] = useState(THIS_YEAR);
  const [zoom,setZoom] = useState(1.0);
  const [tooltip,setTooltip] = useState(null);
  const [catModal,setCatModal] = useState(false);
  const [tempCats,setTempCats] = useState([]);

  // 모달
  const [projModal,setProjModal] = useState(null);
  const [progModal,setProgModal] = useState(null);
  const [barModal,setBarModal]   = useState(null);
  const [tempProj,setTempProj]   = useState({name:"",color:PRESET_COLORS[0],partner:"",manager1:"",manager2:""});
  const [tempProg,setTempProg]   = useState({name:"",bars:[],newBar:{s:"",e:"",l:"",cat:"plan"}});
  const [tempBar,setTempBar]     = useState(null);

  const saveTimer = useRef(null);
  const [selected, setSelected] = useState(new Set()); // 빈 Set = 전체 보기
  const data = allData[activeYear]||[];
  const visData = selected.size===0 ? data.map((p,i)=>({...p,_i:i})) : data.map((p,i)=>({...p,_i:i})).filter(p=>selected.has(p._i));
  const dragProj = useRef(null);
  const dragProg = useRef(null);
  const [dragOverProj, setDragOverProj] = useState(null);
  const [dragOverProg, setDragOverProg] = useState(null);

  // 로드
  useEffect(()=>{
    (async()=>{
      const stored=await dbGet();
      if(stored?.allData) setAllData({...makeAllDefault(),...stored.allData});
      else if(stored?.data){ const m=makeAllDefault(); m[2026]=stored.data; setAllData(m); }
      if(stored?.cats) setCats(stored.cats);
      setLoading(false);
    })();
  },[]);

  // 저장
  const save=useCallback((ad)=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSave("saving");
    saveTimer.current=setTimeout(async()=>{
      const ok=await dbSet({allData:ad,cats});
      setSave(ok?"saved":"error");
      setTimeout(()=>setSave("idle"),2000);
    },700);
  },[]);

  function upData(newYearData){
    const next={...allData,[activeYear]:newYearData};
    setAllData(next); save(next);
  }
  function saveCatsAndClose(newCats){
    setCats(newCats);
    setSave("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      const ok=await dbSet({allData,cats:newCats});
      setSave(ok?"saved":"error");
      setTimeout(()=>setSave("idle"),2000);
    },500);
    setCatModal(false);
  }

  // 드래그 — 프로젝트
  function onProjDragStart(pi){ dragProj.current=pi; }
  function onProjDragOver(e,pi){ e.preventDefault(); setDragOverProj(pi); }
  function onProjDrop(pi){
    const from=dragProj.current;
    if(from==null||from===pi){ setDragOverProj(null); dragProj.current=null; return; }
    const next=[...data];
    const [moved]=next.splice(from,1);
    next.splice(pi,0,moved);
    upData(next); setDragOverProj(null); dragProj.current=null;
  }
  function onProjDragEnd(){ setDragOverProj(null); dragProj.current=null; }

  // 드래그 — 프로그램
  function onProgDragStart(pi,ri){ dragProg.current={pi,ri}; }
  function onProgDragOver(e,pi,ri){ e.preventDefault(); setDragOverProg({pi,ri}); }
  function onProgDrop(pi,ri){
    const from=dragProg.current;
    if(!from||from.pi!==pi||from.ri===ri){ setDragOverProg(null); dragProg.current=null; return; }
    const next=data.map(p=>({...p,rows:[...p.rows]}));
    const [moved]=next[pi].rows.splice(from.ri,1);
    next[pi].rows.splice(ri,0,moved);
    upData(next); setDragOverProg(null); dragProg.current=null;
  }
  function onProgDragEnd(){ setDragOverProg(null); dragProg.current=null; }

  // 프로젝트
  function saveProject(){
    if(!tempProj.name.trim()) return alert("프로젝트명을 입력하세요.");
    const next=[...data];
    const proj={proj:tempProj.name.trim(),color:tempProj.color,partner:tempProj.partner||"",manager1:tempProj.manager1||"",manager2:tempProj.manager2||"",
      rows:[{prog:"프로그램 1",bars:[]},{prog:"프로그램 2",bars:[]},{prog:"프로그램 3",bars:[]},{prog:"프로그램 4",bars:[]},{prog:"프로그램 5",bars:[]}]};
    if(projModal.idx==null) next.push(proj);
    else next[projModal.idx]={...next[projModal.idx],proj:proj.proj,color:proj.color,partner:proj.partner,manager1:proj.manager1,manager2:proj.manager2};
    upData(next); setProjModal(null);
  }
  function delProject(pi){ if(!confirm("프로젝트를 삭제할까요?")) return; upData(data.filter((_,i)=>i!==pi)); }

  // 사업
  function addTempBar(){
    const sRaw=tempProg.newBar.s.trim(), eRaw=tempProg.newBar.e.trim();
    let s=parseDate(sRaw), e=parseDate(eRaw);
    if(s===null||e===null) return alert("날짜를 올바르게 입력하세요.\n예: 3/11");
    if(s>e) return alert("시작일이 종료일보다 늦습니다.");
    // 같은 날이면 하루짜리로 처리 (표시용으로 조금 늘림)
    if(s===e){ const em=Math.floor(e); e=e+1/DAYS[Math.min(em,12)-1]; }
    const l=tempProg.newBar.l.trim()||`${sRaw}~${eRaw}`;
    setTempProg(p=>({...p,bars:[...p.bars,{s,e,cat:p.newBar.cat,l}],newBar:{s:"",e:"",l:"",cat:p.newBar.cat}}));
  }
  function saveProgram(){
    if(!tempProg.name.trim()) return alert("사업명을 입력하세요.");
    const next=data.map(p=>({...p,rows:[...p.rows]}));
    const row={prog:tempProg.name.trim(),bars:tempProg.bars};
    if(progModal.ri==null) next[progModal.pi].rows.push(row);
    else next[progModal.pi].rows[progModal.ri]=row;
    upData(next); setProgModal(null);
  }
  function delProgram(pi,ri){ if(!confirm("삭제할까요?")) return; upData(data.map((p,i)=>i!==pi?p:{...p,rows:p.rows.filter((_,j)=>j!==ri)})); }

  // 바 수정
  function openBarModal(pi,ri,bi){
    const bar=data[pi]?.rows[ri]?.bars[bi];
    if(!bar) return;
    setTempBar({...bar,pi,ri,bi,sStr:floatToLabel(bar.s),eStr:floatToLabel(bar.e)});
    setBarModal({pi,ri,bi});
  }
  function saveBar(){
    const s=parseDate(tempBar.sStr), eRaw=parseDate(tempBar.eStr);
    if(s===null||eRaw===null) return alert("날짜를 올바르게 입력하세요.");
    const e=eRaw;
    if(s>e) return alert("시작일이 종료일보다 늦습니다.");
    const next=data.map(p=>({...p,rows:p.rows.map(r=>({...r,bars:[...r.bars]}))}));
    next[barModal.pi].rows[barModal.ri].bars[barModal.bi]={s,e,cat:tempBar.cat,l:tempBar.l};
    upData(next); setBarModal(null); setTempBar(null);
  }
  function delBar(){
    if(!confirm("이 일정을 삭제할까요?")) return;
    const next=data.map(p=>({...p,rows:p.rows.map(r=>({...r,bars:[...r.bars]}))}));
    next[barModal.pi].rows[barModal.ri].bars.splice(barModal.bi,1);
    upData(next); setBarModal(null); setTempBar(null);
  }

  const cellW = Math.round(64*zoom);
  // 오늘 선: 월 + 일 기준으로 정확한 위치
  const todayPct = (TODAY_MONTH-1)/12*100 + (TODAY_DAY-1)/(DAYS[TODAY_MONTH-1]*12)*100;

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif"}}>
    <div style={{fontSize:40}}>📋</div><div style={{fontSize:14,color:"#636e72"}}>데이터를 불러오는 중...</div>
  </div>;

  return <div style={{fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif",fontSize:13,color:"#2d3436",background:"#f5f6fa",minHeight:"100vh"}}>

    {/* 헤더 */}
    <div style={{background:"#2d3436",color:"white",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:18,fontWeight:700}}>📋 사업 일정 대시보드</div>
        <div style={{fontSize:11,opacity:0.5,marginTop:3,display:"flex",alignItems:"center",gap:8}}>
          YouthVoice · {activeYear}년 사업 계획
          <span style={{background:"#00b894",color:"white",padding:"1px 7px",borderRadius:10,fontSize:10,fontWeight:600,opacity:1}}>🔗 실시간 공유</span>
          <span style={{fontSize:11,color:saveStatus==="saved"?"#00b894":saveStatus==="saving"?"#74b9ff":saveStatus==="error"?"#e17055":"transparent"}}>
            {saveStatus==="saved"?"✓ 저장됨":saveStatus==="saving"?"저장 중...":saveStatus==="error"?"⚠ 저장 실패":""}
          </span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        {/* 확대/축소 */}
        <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"4px 8px"}}>
          <button onClick={()=>setZoom(z=>Math.max(0.4,+(z-0.2).toFixed(1)))} style={{background:"none",border:"none",color:"white",cursor:"pointer",fontSize:16,padding:"0 2px"}}>−</button>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.7)",minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(3.0,+(z+0.2).toFixed(1)))} style={{background:"none",border:"none",color:"white",cursor:"pointer",fontSize:16,padding:"0 2px"}}>＋</button>
          <button onClick={()=>setZoom(1.0)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:10,padding:"0 2px"}}>↺</button>
        </div>
        <Btn onClick={()=>{setTempCats(JSON.parse(JSON.stringify(cats)));setCatModal(true);}} color="#fdcb6e" textColor="#2d3436">🎨 구분</Btn>
        <Btn onClick={()=>{setTempProj({name:"",color:PRESET_COLORS[0],partner:"",manager1:"",manager2:""});setProjModal({});}}>+ 프로젝트 추가</Btn>
      </div>
    </div>

    {/* 연도 탭 */}
    <div style={{background:"#1e272e",display:"flex",alignItems:"center",padding:"0 16px"}}>
      {YEARS.map(y=>{
        const cnt=(allData[y]||[]).length;
        return <button key={y} onClick={()=>{setActiveYear(y);setSelected(new Set());}}
          style={{padding:"10px 18px",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
                  whiteSpace:"nowrap",background:"transparent",flexShrink:0,
                  color:activeYear===y?"#00b894":"rgba(255,255,255,0.45)",
                  borderBottom:`3px solid ${activeYear===y?"#00b894":"transparent"}`,
                  transform:activeYear===y?"scale(1.05)":"scale(1)",transition:"all 0.15s"}}>
          {y}
          {cnt>0&&<span style={{marginLeft:5,fontSize:9,background:activeYear===y?"#00b894":"rgba(255,255,255,0.2)",color:"white",borderRadius:8,padding:"1px 5px"}}>{cnt}</span>}
        </button>;
      })}
    </div>

    {/* 프로젝트 필터 — 멀티 선택 */}
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"white",borderBottom:"1px solid #eee",flexWrap:"wrap"}}>
      <button onClick={()=>setSelected(new Set())}
        style={{padding:"4px 14px",borderRadius:20,
                border:`1.5px solid ${selected.size===0?"#2d3436":"#dfe6e9"}`,
                background:selected.size===0?"#2d3436":"white",
                color:selected.size===0?"white":"#636e72",
                cursor:"pointer",fontSize:12,fontWeight:600}}>전체</button>
      {data.map((p,i)=>{
        const on=selected.has(i);
        return <button key={i} onClick={()=>{
            setSelected(prev=>{
              const next=new Set(prev);
              if(next.has(i)) next.delete(i); else next.add(i);
              return next;
            });
          }}
          style={{padding:"4px 14px",borderRadius:20,
                  border:`1.5px solid ${on?p.color:"#dfe6e9"}`,
                  background:on?p.color:"white",color:on?"white":"#636e72",
                  cursor:"pointer",fontSize:12,fontWeight:600,
                  display:"flex",alignItems:"center",gap:5}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:on?"white":p.color,display:"inline-block",flexShrink:0}}/>
          {p.proj.replace("\n"," ")}
        </button>;
      })}
      {selected.size>0&&<button onClick={()=>setSelected(new Set())}
        style={{padding:"4px 10px",borderRadius:20,border:"1px solid #dfe6e9",background:"none",
                cursor:"pointer",fontSize:11,color:"#b2bec3"}}>✕ 초기화</button>}
    </div>

    {/* 차트 */}
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 175px)"}}>
      <table style={{borderCollapse:"collapse",tableLayout:"fixed",minWidth:300}}>
        <thead style={{position:"sticky",top:0,zIndex:20}}>
          <tr>
            <th style={{width:110,minWidth:110,fontSize:11,fontWeight:600,color:"#636e72",padding:"8px",
                        borderBottom:"2px solid #dfe6e9",textAlign:"center",background:"white",
                        position:"sticky",left:0,top:0,zIndex:30,boxShadow:"2px 0 4px rgba(0,0,0,0.06)"}}>Project</th>
            <th style={{width:180,minWidth:180,fontSize:11,fontWeight:600,color:"#636e72",padding:"8px 12px",
                        borderBottom:"2px solid #dfe6e9",textAlign:"left",background:"white",
                        position:"sticky",left:110,top:0,zIndex:30,boxShadow:"4px 0 6px rgba(0,0,0,0.07)"}}>Program</th>
            {MONTHS.map((m,mi)=><th key={mi} style={{
                width:cellW,minWidth:cellW,fontSize:10,fontWeight:600,color:activeYear===THIS_YEAR&&mi+1===TODAY_MONTH?"#e17055":"#636e72",
                padding:"8px 4px",borderBottom:"2px solid #dfe6e9",textAlign:"center",whiteSpace:"nowrap",
                background:activeYear===THIS_YEAR&&mi+1===TODAY_MONTH?"rgba(225,112,85,0.07)":"white",
                position:"sticky",top:0,zIndex:20,boxShadow:"0 2px 4px rgba(0,0,0,0.04)"}}>
              {cellW>=44?m:`${mi+1}`}
            </th>)}
            <th style={{width:80,minWidth:80,fontSize:11,fontWeight:600,color:"#636e72",padding:"8px",
                        borderBottom:"2px solid #dfe6e9",textAlign:"center",background:"white",
                        position:"sticky",right:0,top:0,zIndex:30,boxShadow:"-2px 0 4px rgba(0,0,0,0.06)"}}>관리</th>
          </tr>
        </thead>
        <tbody>
          {data.length===0&&<tr><td colSpan={15}>
            <div style={{textAlign:"center",padding:60,color:"#b2bec3"}}>
              <div style={{fontSize:40}}>📭</div>
              <div style={{marginTop:12,fontSize:14}}>{activeYear}년 프로젝트가 없습니다.</div>
              <div style={{marginTop:6,fontSize:12}}>우측 상단 "+ 프로젝트 추가"로 시작하세요!</div>
            </div>
          </td></tr>}
          {visData.map((proj)=>{ const pi=proj._i; return [
            ...(proj.rows.length===0?[
              <tr key={`${pi}-empty`}>
                <td data-sticky="1" rowSpan={2} style={{width:110,minWidth:110,textAlign:"center",verticalAlign:"middle",
                    background:`${proj.color}15`,border:"none",borderLeft:`4px solid ${proj.color}`,
                    padding:8,position:"sticky",left:0,zIndex:3}}>
                  <div style={{fontSize:11,fontWeight:700,color:proj.color,lineHeight:1.5}}>
                    {proj.proj.split("\n").map((t,i)=><div key={i}>{t}</div>)}
                  </div>
                  {(proj.partner||proj.manager1||proj.manager2)&&<div style={{marginTop:4,fontSize:10,color:"#888",lineHeight:1.7}}>
                    {proj.partner&&<div>🤝 {proj.partner}</div>}
                    {proj.manager1&&<div>정 {proj.manager1}</div>}
                    {proj.manager2&&<div style={{opacity:0.7}}>부 {proj.manager2}</div>}
                  </div>}
                  <div style={{marginTop:6,display:"flex",justifyContent:"center",gap:4}}>
                    <button onClick={()=>{setTempProj({name:proj.proj.replace("\n"," "),color:proj.color,partner:proj.partner||"",manager1:proj.manager1||"",manager2:proj.manager2||""});setProjModal({idx:pi});}}
                      style={{background:"#74b9ff",border:"none",borderRadius:5,cursor:"pointer",padding:"3px 7px",fontSize:12}}>✏️</button>
                    <button onClick={()=>delProject(pi)}
                      style={{background:"#e17055",border:"none",borderRadius:5,cursor:"pointer",padding:"3px 7px",fontSize:12,color:"white"}}>🗑️</button>
                  </div>
                </td>
                <td data-sticky="1" style={{width:180,minWidth:180,background:"white",border:"none",position:"sticky",left:110,zIndex:3,boxShadow:"4px 0 6px rgba(0,0,0,0.07)"}}/>
                <td colSpan={12} style={{color:"#b2bec3",fontSize:12,paddingLeft:16,verticalAlign:"middle"}}>
                  사업이 없습니다.
                  <button onClick={()=>{setTempProg({name:"",bars:[],newBar:{s:"",e:"",l:"",cat:cats[0]?.id||"plan"}});setProgModal({pi,ri:null});}}
                    style={{marginLeft:10,background:"#55efc4",border:"none",borderRadius:4,cursor:"pointer",padding:"3px 8px",fontSize:11}}>＋ 사업 추가</button>
                </td>
                <td data-sticky="1" style={{background:"white",border:"none",position:"sticky",right:0,zIndex:3}}/>
              </tr>
            ]:proj.rows.map((row,ri)=>(
              <tr key={`${pi}-${ri}`}
                draggable
                onDragStart={()=>onProgDragStart(pi,ri)}
                onDragOver={e=>onProgDragOver(e,pi,ri)}
                onDrop={()=>onProgDrop(pi,ri)}
                onDragEnd={onProgDragEnd}
                style={{background:dragOverProg?.pi===pi&&dragOverProg?.ri===ri?"#e8f8f5":"",cursor:"grab"}}
                onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>{if(!td.dataset.sticky&&!dragProg.current)td.style.background="#f5f9ff";})}
                onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>{if(!td.dataset.sticky)td.style.background="transparent";})}>
                {ri===0&&<td data-sticky="1" rowSpan={proj.rows.length+1}
                  draggable
                  onDragStart={e=>{e.stopPropagation();onProjDragStart(pi);}}
                  onDragOver={e=>onProjDragOver(e,pi)}
                  onDrop={()=>onProjDrop(pi)}
                  onDragEnd={onProjDragEnd}
                  style={{
                    width:110,minWidth:110,textAlign:"center",verticalAlign:"middle",
                    background:dragOverProj===pi?`${proj.color}35`:`${proj.color}15`,
                    border:"none",borderLeft:`4px solid ${proj.color}`,
                    padding:8,position:"sticky",left:0,zIndex:3,cursor:"grab",
                    transition:"background 0.15s"}}>
                  <div style={{fontSize:9,color:proj.color,opacity:0.5,marginBottom:2}}>⠿ 드래그</div>
                  <div style={{fontSize:11,fontWeight:700,color:proj.color,lineHeight:1.5}}>
                    {proj.proj.split("\n").map((t,i)=><div key={i}>{t}</div>)}
                  </div>
                  {(proj.partner||proj.manager1||proj.manager2)&&<div style={{marginTop:4,fontSize:10,color:"#888",lineHeight:1.7}}>
                    {proj.partner&&<div>🤝 {proj.partner}</div>}
                    {proj.manager1&&<div>정 {proj.manager1}</div>}
                    {proj.manager2&&<div style={{opacity:0.7}}>부 {proj.manager2}</div>}
                  </div>}
                  <div style={{marginTop:6,display:"flex",justifyContent:"center",gap:4}}>
                    <button onClick={e=>{e.stopPropagation();setTempProj({name:proj.proj.replace("\n"," "),color:proj.color,partner:proj.partner||"",manager1:proj.manager1||"",manager2:proj.manager2||""});setProjModal({idx:pi});}}
                      style={{background:"#74b9ff",border:"none",borderRadius:5,cursor:"pointer",padding:"3px 7px",fontSize:12}}>✏️</button>
                    <button onClick={e=>{e.stopPropagation();delProject(pi);}}
                      style={{background:"#e17055",border:"none",borderRadius:5,cursor:"pointer",padding:"3px 7px",fontSize:12,color:"white"}}>🗑️</button>
                  </div>
                </td>}
                <td data-sticky="1" style={{width:180,minWidth:180,fontSize:12,padding:"2px 12px",whiteSpace:"nowrap",
                    background:"white",border:"none",verticalAlign:"middle",position:"sticky",left:110,zIndex:3,
                    boxShadow:"4px 0 6px rgba(0,0,0,0.07)"}}>
                  {row.prog}
                </td>
                {/* 바 영역 */}
                <td colSpan={12} style={{position:"relative",height:34,padding:0,border:"none",background:"transparent",
                    minWidth:cellW*12,width:cellW*12}}>
                  {/* 오늘 선 */}
                  {activeYear===THIS_YEAR&&ri===0&&<div style={{position:"absolute",top:0,bottom:0,
                      left:`${todayPct}%`,width:2,background:"#e17055",zIndex:5,pointerEvents:"none"}}/>}
                  {/* 오늘 배경 */}
                  {activeYear===THIS_YEAR&&<div style={{position:"absolute",top:0,bottom:0,
                      left:`${(TODAY_MONTH-1)/12*100}%`,width:`${1/12*100}%`,
                      background:"rgba(225,112,85,0.04)",pointerEvents:"none"}}/>}
                  {/* 바 */}
                  <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2}}>
                    {(row.bars||[]).map((bar,bi)=>{
                      const xs=(bar.s-1)/12*100;
                      const xe=(bar.e-1)/12*100;
                      const w=xe-xs;
                      if(w<=0) return null;
                      const minW=1/12*100;
                      const dw=Math.max(w,minW);
                      const dl=Math.min(xs,100-dw);
                      return <div key={bi}
                        style={{position:"absolute",top:"50%",transform:"translateY(-50%)",
                                left:`${dl}%`,width:`${dw}%`,height:20,
                                background:catColor(cats,bar.cat),borderRadius:4,
                                display:"flex",alignItems:"center",justifyContent:"center",
                                cursor:"pointer",pointerEvents:"all",
                                boxShadow:"0 1px 3px rgba(0,0,0,0.18)",overflow:"hidden"}}
                        onClick={()=>openBarModal(pi,ri,bi)}
                        onMouseEnter={e=>setTooltip({x:e.clientX,y:e.clientY,
                          text:`${proj.proj.replace("\n"," ")} · ${row.prog}`+(catName(cats,bar.cat)?` [${catName(cats,bar.cat)}]`:"")+(bar.l?` · ${bar.l}`:"")+" ✏️"})}
                        onMouseMove={e=>setTooltip(t=>t?{...t,x:e.clientX,y:e.clientY}:null)}
                        onMouseLeave={()=>setTooltip(null)}>
                        {bar.l&&<span style={{fontSize:10,color:"white",fontWeight:700,padding:"0 6px",whiteSpace:"nowrap",textShadow:"0 1px 2px rgba(0,0,0,0.25)"}}>{bar.l}</span>}
                      </div>;
                    })}
                  </div>
                </td>
                <td data-sticky="1" style={{textAlign:"center",background:"white",border:"none",
                    whiteSpace:"nowrap",verticalAlign:"middle",padding:"2px 4px",
                    position:"sticky",right:0,zIndex:3,boxShadow:"-2px 0 4px rgba(0,0,0,0.04)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                    <button title="사업 추가" onClick={()=>{setTempProg({name:"",bars:[],newBar:{s:"",e:"",l:"",cat:cats[0]?.id||"plan"}});setProgModal({pi,ri:null});}}
                      style={{background:"#55efc4",border:"none",borderRadius:4,cursor:"pointer",padding:"3px 6px",fontSize:11}}>＋</button>
                    <button title="수정" onClick={()=>{
                      const safeBars=JSON.parse(JSON.stringify(Array.isArray(row.bars)?row.bars:[]));
                      setTempProg({name:row.prog,bars:safeBars,newBar:{s:"",e:"",l:"",cat:cats[0]?.id||"plan"}});
                      setProgModal({pi,ri});}}
                      style={{background:"#74b9ff",border:"none",borderRadius:4,cursor:"pointer",padding:"3px 6px",fontSize:11}}>✏️</button>
                    <button title="삭제" onClick={()=>delProgram(pi,ri)}
                      style={{background:"#fab1a0",border:"none",borderRadius:4,cursor:"pointer",padding:"3px 6px",fontSize:11}}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))),
            <tr key={`${pi}-sep`}>
              <td colSpan={15} style={{height:6,background:"#e8ecf0",borderTop:"3px solid #cdd2d8",borderBottom:"3px solid #cdd2d8",padding:0}}/>
            </tr>
          ];})}
        </tbody>
      </table>
    </div>

    {/* 툴팁 */}
    {tooltip&&<div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-40,background:"#2d3436",color:"white",
        padding:"8px 12px",borderRadius:7,fontSize:11,pointerEvents:"none",zIndex:9999,
        boxShadow:"0 4px 12px rgba(0,0,0,0.2)",lineHeight:1.7,maxWidth:280}}>{tooltip.text}</div>}

    {/* 프로젝트 모달 */}
    <Modal open={!!projModal} onClose={()=>setProjModal(null)} title={projModal?.idx==null?`${activeYear}년 프로젝트 추가`:"프로젝트 수정"}>
      <FG label="프로젝트명"><Inp value={tempProj.name} placeholder="예: TMI 프로젝트 (바보의나눔)" onChange={e=>setTempProj(p=>({...p,name:e.target.value}))}/></FG>
      <FG label="파트너 기관 (선택)"><Inp value={tempProj.partner} placeholder="예: KT&G장학재단" onChange={e=>setTempProj(p=>({...p,partner:e.target.value}))}/></FG>
      <FG label="담당자">
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <label style={{fontSize:11,color:"#888",display:"block",marginBottom:4}}>정 담당자</label>
            <Inp value={tempProj.manager1} placeholder="예: 홍길동" onChange={e=>setTempProj(p=>({...p,manager1:e.target.value}))}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:11,color:"#888",display:"block",marginBottom:4}}>부 담당자</label>
            <Inp value={tempProj.manager2} placeholder="예: 김철수" onChange={e=>setTempProj(p=>({...p,manager2:e.target.value}))}/>
          </div>
        </div>
      </FG>
      <FG label="대표 색상"><ColorPicker value={tempProj.color} onChange={c=>setTempProj(p=>({...p,color:c}))}/></FG>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
        <Btn onClick={()=>setProjModal(null)} color="#f5f6fa" textColor="#636e72">취소</Btn>
        <Btn onClick={saveProject}>저장</Btn>
      </div>
    </Modal>

    {/* 사업 모달 */}
    <Modal open={!!progModal} onClose={()=>setProgModal(null)} title={progModal?.ri==null?`사업 추가`:"사업 수정"}>
      <FG label="사업명"><Inp value={tempProg.name} placeholder="예: 참여자 모집, 선발" onChange={e=>setTempProg(p=>({...p,name:e.target.value}))}/></FG>
      <FG label="등록된 일정">
        <div style={{border:"1.5px solid #dfe6e9",borderRadius:8,overflow:"hidden",minHeight:40}}>
          {tempProg.bars.length===0
            ?<div style={{padding:12,color:"#b2bec3",fontSize:12,textAlign:"center"}}>아래에서 일정을 추가하세요.</div>
            :tempProg.bars.map((b,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid #f0f0f0"}}>
              <div style={{width:24,height:14,borderRadius:3,background:catColor(cats,b.cat),flexShrink:0}}/>
              <div style={{flex:1,fontSize:12}}>{floatToLabel(b.s)}~{floatToLabel(b.e)}{b.l?` · ${b.l}`:""} <span style={{fontSize:10,color:"#888"}}>[{catName(cats,b.cat)}]</span></div>
              <button onClick={()=>setTempProg(p=>({...p,bars:p.bars.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",cursor:"pointer",color:"#b2bec3",fontSize:14}}>✕</button>
            </div>)
          }
        </div>
      </FG>
      <div style={{background:"#f8f9fa",borderRadius:8,border:"1px solid #eee",padding:14,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:"#636e72",marginBottom:10}}>＋ 일정 추가</div>
        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <div style={{flex:1}}><label style={{fontSize:11,color:"#888",display:"block",marginBottom:4}}>시작일</label>
            <Inp value={tempProg.newBar.s} placeholder="3/11" onChange={e=>setTempProg(p=>({...p,newBar:{...p.newBar,s:e.target.value}}))}/></div>
          <div style={{flex:1}}><label style={{fontSize:11,color:"#888",display:"block",marginBottom:4}}>종료일</label>
            <Inp value={tempProg.newBar.e} placeholder="4/18" onChange={e=>setTempProg(p=>({...p,newBar:{...p.newBar,e:e.target.value}}))}/></div>
        </div>
        <div style={{marginBottom:10}}><label style={{fontSize:11,color:"#888",display:"block",marginBottom:4}}>표시 텍스트 (선택)</label>
          <Inp value={tempProg.newBar.l} placeholder="비우면 날짜 자동 표시" onChange={e=>setTempProg(p=>({...p,newBar:{...p.newBar,l:e.target.value}}))}/></div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <label style={{fontSize:11,color:"#888"}}>구분</label>
            <button onClick={()=>{setTempCats(JSON.parse(JSON.stringify(cats)));setCatModal(true);}}
              style={{fontSize:10,color:"#00b894",background:"none",border:"1px solid #00b894",borderRadius:10,
                      cursor:"pointer",padding:"2px 8px",fontWeight:600}}>+ 구분 편집</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {cats.map(c=><div key={c.id} onClick={()=>setTempProg(p=>({...p,newBar:{...p.newBar,cat:c.id}}))}
              style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:600,
                      border:`2px solid ${tempProg.newBar.cat===c.id?"#2d3436":"#eee"}`,background:"white",
                      boxShadow:tempProg.newBar.cat===c.id?"0 2px 6px rgba(0,0,0,0.1)":"none"}}>
              <div style={{width:10,height:10,borderRadius:3,background:c.color,flexShrink:0}}/>{c.name}
            </div>)}
          </div>
        </div>
        <Btn onClick={addTempBar} style={{width:"100%",padding:8}}>+ 이 일정 추가</Btn>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={()=>setProgModal(null)} color="#f5f6fa" textColor="#636e72">취소</Btn>
        <Btn onClick={saveProgram}>저장</Btn>
      </div>
    </Modal>

    {/* 구분 관리 모달 */}
    <Modal open={catModal} onClose={()=>setCatModal(false)} title="🎨 구분 관리">
      <p style={{fontSize:12,color:"#888",marginBottom:14,lineHeight:1.6}}>색상 점을 클릭해서 색상을 바꾸거나, 이름을 수정하세요.</p>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
        {tempCats.map((cat,ci)=>(
          <div key={cat.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f8f9fa",borderRadius:8,border:"1px solid #eee"}}>
            {/* 색상 점 — 클릭하면 color input 열림 */}
            <label style={{cursor:"pointer",flexShrink:0,position:"relative"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:cat.color,border:"2px solid rgba(0,0,0,0.1)",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}/>
              <input type="color" value={cat.color}
                onChange={e=>setTempCats(l=>l.map((x,i)=>i===ci?{...x,color:e.target.value}:x))}
                style={{position:"absolute",opacity:0,width:0,height:0,top:0,left:0,cursor:"pointer"}}/>
            </label>
            <input value={cat.name} placeholder="항목명"
              onChange={e=>setTempCats(l=>l.map((x,i)=>i===ci?{...x,name:e.target.value}:x))}
              style={{flex:1,padding:"6px 10px",border:"1.5px solid #dfe6e9",borderRadius:6,fontSize:13,outline:"none",background:"white"}}
              onFocus={e=>e.target.style.borderColor="#00b894"} onBlur={e=>e.target.style.borderColor="#dfe6e9"}/>
            <button onClick={()=>setTempCats(l=>l.filter((_,i)=>i!==ci))}
              style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:16,padding:"0 4px",flexShrink:0}}
              onMouseEnter={e=>e.target.style.color="#e17055"} onMouseLeave={e=>e.target.style.color="#ccc"}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={()=>setTempCats(l=>[...l,{id:"cat_"+Date.now(),name:"새 항목",color:PRESET_COLORS[Math.floor(Math.random()*PRESET_COLORS.length)]}])}
        style={{width:"100%",padding:"8px",border:"1.5px dashed #b2bec3",borderRadius:8,background:"transparent",cursor:"pointer",fontSize:12,color:"#636e72",marginBottom:4}}
        onMouseEnter={e=>{e.target.style.borderColor="#00b894";e.target.style.color="#00b894";}}
        onMouseLeave={e=>{e.target.style.borderColor="#b2bec3";e.target.style.color="#636e72";}}>
        + 항목 추가
      </button>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
        <Btn onClick={()=>setCatModal(false)} color="#f5f6fa" textColor="#636e72">취소</Btn>
        <Btn onClick={()=>saveCatsAndClose(tempCats)}>저장</Btn>
      </div>
    </Modal>

    {/* 바 수정 모달 */}
    <Modal open={!!barModal} onClose={()=>{setBarModal(null);setTempBar(null);}} title="일정 수정">
      {tempBar&&<>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1}}><FG label="시작일"><Inp value={tempBar.sStr} placeholder="3/11" onChange={e=>setTempBar(b=>({...b,sStr:e.target.value}))}/></FG></div>
          <div style={{flex:1}}><FG label="종료일"><Inp value={tempBar.eStr} placeholder="4/18" onChange={e=>setTempBar(b=>({...b,eStr:e.target.value}))}/></FG></div>
        </div>
        <FG label="표시 텍스트"><Inp value={tempBar.l||""} placeholder="예: 모집 중" onChange={e=>setTempBar(b=>({...b,l:e.target.value}))}/></FG>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:600,color:"#636e72",display:"block",marginBottom:6}}>구분</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
            {cats.map(c=><div key={c.id} onClick={()=>setTempBar(b=>({...b,cat:c.id}))}
              style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:600,
                      border:`2px solid ${tempBar.cat===c.id?"#2d3436":"#eee"}`,background:"white",
                      boxShadow:tempBar.cat===c.id?"0 2px 6px rgba(0,0,0,0.1)":"none"}}>
              <div style={{width:10,height:10,borderRadius:3,background:c.color,flexShrink:0}}/>{c.name}
            </div>)}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>
          <Btn onClick={delBar} color="#e17055">🗑️ 삭제</Btn>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={()=>{setBarModal(null);setTempBar(null);}} color="#f5f6fa" textColor="#636e72">취소</Btn>
            <Btn onClick={saveBar}>저장</Btn>
          </div>
        </div>
      </>}
    </Modal>

  </div>;
}
