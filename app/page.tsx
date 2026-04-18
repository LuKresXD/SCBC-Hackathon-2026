"use client";
import React, { useState, useEffect, useRef, createContext, useContext } from "react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}
const MobileCtx = createContext(false);
const useMobile = () => useContext(MobileCtx);



const C = {
  bg: "#05080c", surface: "#0a0f18", card: "#0d131c", cardHover: "#121a26",
  border: "rgba(45, 212, 191, 0.08)", borderHover: "rgba(45, 212, 191, 0.18)",
  teal: "#0d9488", tealLight: "#2dd4bf", tealBg: "#042420",
  amber: "#d97706", amberBg: "#1c1000", coral: "#ea580c", coralBg: "#1c0a00",
  green: "#22c55e", greenBg: "#0a1f10", red: "#ef4444", redBg: "#1f0a0a",
  textPrimary: "#eef2f7", textSecondary: "#6b8099", textMuted: "#3a4f62",
};
const FS = "'Inter', system-ui, sans-serif";
const FD = "'Inter', system-ui, sans-serif";
const FM = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

function genHistory(tier: number, days: number, finalNav: number) {
  const base = tier / 100; const pts: number[] = []; let v = base;
  for (let i = 0; i < days; i++) {
    const drift = (finalNav - base) * (i / days) * 0.6;
    const noise = (Math.random() - 0.48) * 0.018;
    const spike = Math.random() < 0.08 ? (Math.random() - 0.5) * 0.03 : 0;
    v = base + drift + noise + spike;
    v = Math.max(tier/100 - 0.08, Math.min(tier/100 + 0.12, v));
    pts.push(parseFloat(v.toFixed(4)));
  }
  pts.push(finalNav); return pts;
}
function genFlatHistory(days: number) {
  const pts: number[] = [];
  for (let i = 0; i <= days; i++) pts.push(parseFloat((1 + (Math.random()-0.5)*0.0004).toFixed(4)));
  return pts;
}
const USDC_HISTORY = genFlatHistory(29);

const BUNDLES = [
  { id:"STHS-90-0430", tier:90, date:"Apr 30, 2025", daysLeft:15, nav:0.913, issue:0.90, change:+1.4, hot:true,  resolved:3, totalLegs:10, history:genHistory(90,29,0.913) },
  { id:"STHS-90-0515", tier:90, date:"May 15, 2025", daysLeft:30, nav:0.908, issue:0.90, change:+0.9, hot:true,  resolved:1, totalLegs:12, history:genHistory(90,29,0.908) },
  { id:"STHS-90-0601", tier:90, date:"Jun 1, 2025",  daysLeft:47, nav:0.895, issue:0.90, change:-0.6, hot:false, resolved:0, totalLegs:10, history:genHistory(90,29,0.895) },
  { id:"STHS-90-0701", tier:90, date:"Jul 1, 2025",  daysLeft:77, nav:0.901, issue:0.90, change:+0.1, hot:false, resolved:0, totalLegs:11, history:genHistory(90,29,0.901) },
  { id:"STHS-90-1001", tier:90, date:"Oct 1, 2025",  daysLeft:169,nav:0.888, issue:0.90, change:-0.3, hot:false, resolved:0, totalLegs:10, history:genHistory(90,29,0.888) },
  { id:"STHS-70-0430", tier:70, date:"Apr 30, 2025", daysLeft:15, nav:0.724, issue:0.70, change:+3.4, hot:true,  resolved:4, totalLegs:10, history:genHistory(70,29,0.724) },
  { id:"STHS-70-0515", tier:70, date:"May 15, 2025", daysLeft:30, nav:0.698, issue:0.70, change:-1.2, hot:false, resolved:2, totalLegs:11, history:genHistory(70,29,0.698) },
  { id:"STHS-70-0601", tier:70, date:"Jun 1, 2025",  daysLeft:47, nav:0.712, issue:0.70, change:+1.7, hot:false, resolved:1, totalLegs:10, history:genHistory(70,29,0.712) },
  { id:"STHS-70-0701", tier:70, date:"Jul 1, 2025",  daysLeft:77, nav:0.685, issue:0.70, change:-2.1, hot:false, resolved:0, totalLegs:12, history:genHistory(70,29,0.685) },
  { id:"STHS-70-1001", tier:70, date:"Oct 1, 2025",  daysLeft:169,nav:0.703, issue:0.70, change:+0.4, hot:false, resolved:0, totalLegs:10, history:genHistory(70,29,0.703) },
  { id:"STHS-50-0430", tier:50, date:"Apr 30, 2025", daysLeft:15, nav:0.531, issue:0.50, change:+6.2, hot:true,  resolved:5, totalLegs:10, history:genHistory(50,29,0.531) },
  { id:"STHS-50-0515", tier:50, date:"May 15, 2025", daysLeft:30, nav:0.488, issue:0.50, change:-2.4, hot:false, resolved:1, totalLegs:10, history:genHistory(50,29,0.488) },
  { id:"STHS-50-0601", tier:50, date:"Jun 1, 2025",  daysLeft:47, nav:0.502, issue:0.50, change:+0.4, hot:false, resolved:0, totalLegs:11, history:genHistory(50,29,0.502) },
  { id:"STHS-50-0701", tier:50, date:"Jul 1, 2025",  daysLeft:77, nav:0.478, issue:0.50, change:-4.4, hot:false, resolved:0, totalLegs:10, history:genHistory(50,29,0.478) },
  { id:"STHS-50-1001", tier:50, date:"Oct 1, 2025",  daysLeft:169,nav:0.515, issue:0.50, change:+3.0, hot:false, resolved:0, totalLegs:10, history:genHistory(50,29,0.515) },
];
type Bundle = typeof BUNDLES[0];

// Non-demo fallback (only used if someone explicitly flips demo OFF)
const STATIC_PORTFOLIO = [
  { id:"STHS-90-0430", qty:1200, avgCost:0.887 },
  { id:"STHS-70-0430", qty:800,  avgCost:0.682 },
  { id:"STHS-50-0430", qty:600,  avgCost:0.501 },
  { id:"STHS-90-0515", qty:500,  avgCost:0.899 },
  { id:"STHS-70-0515", qty:400,  avgCost:0.708 },
  { id:"STHS-70-0601", qty:98,   avgCost:0.714 },
];
const STATIC_VAULT_POSITIONS = [
  { id:"VAULT-0601", label:"Meteora vault", principal:930, yieldEarned:9.64, apy:8.4, daysLeft:47, daysTotal:90, resolveDate:"Jun 1, 2025" },
];
const STATIC_USDC_BALANCE = 680;

type Position = { id:string, qty:number, avgCost:number };
type VaultPos = { id:string, label:string, principal:number, yieldEarned:number, apy:number, daysLeft:number, daysTotal:number, resolveDate:string };

const DEMO_STARTING_USDC = 10000;

const NEWS = [
  { headline:"Federal Reserve signals no rate cuts in near term", source:"Reuters", time:"2m ago", impact:"neutral" },
  { headline:"Bitcoin breaks above $95k as ETF inflows hit monthly high", source:"Bloomberg", time:"8m ago", impact:"positive" },
  { headline:"Senate fails to advance budget resolution ahead of deadline", source:"WSJ", time:"14m ago", impact:"negative" },
  { headline:"Solana DEX volume surpasses Ethereum for third consecutive day", source:"The Block", time:"22m ago", impact:"positive" },
  { headline:"Global PMI data signals manufacturing slowdown in Q2", source:"FT", time:"31m ago", impact:"negative" },
  { headline:"NVIDIA beats Q1 estimates, raises full-year guidance", source:"CNBC", time:"45m ago", impact:"positive" },
];
const HOT_PREDICTIONS = [
  { label:"BTC above $100k by May", prob:67.4, change:+3.2 },
  { label:"Fed holds rates in June", prob:91.2, change:-0.4 },
  { label:"ETH flips BNB market cap", prob:54.8, change:+5.1 },
  { label:"US avoids recession in 2025", prob:73.1, change:-1.7 },
  { label:"SOL top 3 by market cap", prob:44.2, change:+2.8 },
  { label:"Gold above $2,500/oz by Jun", prob:62.3, change:-0.9 },
];

function tc(tier: number) { return tier===90?'#0d9488':tier===70?'#d97706':'#ea580c'; }
function tl(d: number) { return d<=20?"This week":d<=50?"This month":"Long term"; }

// Logo asset paths — swap here if you rename files
const LOGO_SRC = {
  full:  "/senthos_full.png",
  teal:  "/senthos_teal.png",
  amber: "/senthos_amber.png",
  coral: "/senthos_coral.png",
};

// Lighter shade of a color for gradient
function lightenColor(hex: string, amount: number = 0.25): string {
  const h = hex.replace("#","");
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  const nr = Math.min(255, Math.round(r + (255-r)*amount));
  const ng = Math.min(255, Math.round(g + (255-g)*amount));
  const nb = Math.min(255, Math.round(b + (255-b)*amount));
  return `#${nr.toString(16).padStart(2,"0")}${ng.toString(16).padStart(2,"0")}${nb.toString(16).padStart(2,"0")}`;
}
function darkenColor(hex: string, amount: number = 0.2): string {
  const h = hex.replace("#","");
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  const nr = Math.max(0, Math.round(r * (1-amount)));
  const ng = Math.max(0, Math.round(g * (1-amount)));
  const nb = Math.max(0, Math.round(b * (1-amount)));
  return `#${nr.toString(16).padStart(2,"0")}${ng.toString(16).padStart(2,"0")}${nb.toString(16).padStart(2,"0")}`;
}

function Sparkline({ data, color, height=48, width=120 }: { data:number[], color:string, height?:number, width?:number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if(!c) return;
    const ctx = c.getContext("2d")!; const dpr = window.devicePixelRatio||1;
    c.width=width*dpr; c.height=height*dpr; c.style.width=width+"px"; c.style.height=height+"px";
    ctx.scale(dpr,dpr); ctx.clearRect(0,0,width,height);
    const min=Math.min(...data), max=Math.max(...data), range=max-min||0.01; const pad=3;
    const pts=data.map((v,i)=>({x:pad+(i/(data.length-1))*(width-pad*2),y:pad+(1-(v-min)/range)*(height-pad*2)}));
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++){const m={x:(pts[i-1].x+pts[i].x)/2,y:(pts[i-1].y+pts[i].y)/2};ctx.quadraticCurveTo(pts[i-1].x,pts[i-1].y,m.x,m.y);}
    ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke();
    ctx.lineTo(pts[pts.length-1].x,height); ctx.lineTo(pts[0].x,height); ctx.closePath();
    ctx.fillStyle=color+"18"; ctx.fill();
  },[data,color,height,width]);
  return <canvas ref={ref} style={{display:"block",width:"100%",height:height+"px"}} />;
}

function NavChart({ data, color, tier }: { data:number[], color:string, tier:number }) {
  const ref = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c=ref.current; if(!c||!wrap.current) return;
    const W=wrap.current.clientWidth||500, H=180; const dpr=window.devicePixelRatio||1;
    c.width=W*dpr; c.height=H*dpr; c.style.width=W+"px"; c.style.height=H+"px";
    const ctx=c.getContext("2d")!; ctx.scale(dpr,dpr); ctx.clearRect(0,0,W,H);
    const base=tier/100; const allD=[base,...data];
    const min=Math.min(...allD)-0.005, max=Math.max(...allD)+0.005, range=max-min;
    const pL=54,pR=16,pT=14,pB=28;
    const pts=data.map((v,i)=>({x:pL+(i/(data.length-1))*(W-pL-pR),y:pT+(1-(v-min)/range)*(H-pT-pB)}));
    const baseY=pT+(1-(base-min)/range)*(H-pT-pB);
    ctx.beginPath(); ctx.moveTo(pL,baseY); ctx.lineTo(W-pR,baseY);
    ctx.strokeStyle="#1a2a3a"; ctx.lineWidth=1; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    for(let i=0;i<=4;i++){
      const y=pT+(i/4)*(H-pT-pB);
      ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(W-pR,y); ctx.strokeStyle="#0f1a24"; ctx.lineWidth=0.5; ctx.stroke();
      ctx.fillStyle="#3a4f62"; ctx.font=`10px ${FS}`; ctx.textAlign="right";
      ctx.fillText("$"+(max-(i/4)*range).toFixed(3),pL-6,y+3);
    }
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++){const m={x:(pts[i-1].x+pts[i].x)/2,y:(pts[i-1].y+pts[i].y)/2};ctx.quadraticCurveTo(pts[i-1].x,pts[i-1].y,m.x,m.y);}
    ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
    ctx.lineTo(pts[pts.length-1].x,H-pB); ctx.lineTo(pts[0].x,H-pB); ctx.closePath();
    ctx.fillStyle=color+"18"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++){const m={x:(pts[i-1].x+pts[i].x)/2,y:(pts[i-1].y+pts[i].y)/2};ctx.quadraticCurveTo(pts[i-1].x,pts[i-1].y,m.x,m.y);}
    ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
    const last=pts[pts.length-1];
    ctx.beginPath(); ctx.arc(last.x,last.y,3.5,0,2*Math.PI); ctx.fillStyle=color; ctx.fill();
    [["30d ago",0],["15d ago",0.5],["Now",1]].forEach(([l,t])=>{
      const x=pL+(t as number)*(W-pL-pR);
      ctx.fillStyle="#3a4f62"; ctx.font=`10px ${FS}`;
      ctx.textAlign=t===0?"left":t===1?"right":"center";
      ctx.fillText(l as string,x,H-8);
    });
  },[data,color,tier]);
  return <div ref={wrap} style={{width:"100%"}}><canvas ref={ref} /></div>;
}

// =========================================================================
// SVG DONUT — premium with gradients, inner shadows, frosted center
// =========================================================================
function polarToCartesian(cx:number, cy:number, r:number, angleRad:number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}
function arcPath(cx:number, cy:number, rOuter:number, rInner:number, startAngle:number, endAngle:number) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const start = polarToCartesian(cx, cy, rOuter, startAngle);
  const end = polarToCartesian(cx, cy, rOuter, endAngle);
  const startIn = polarToCartesian(cx, cy, rInner, endAngle);
  const endIn = polarToCartesian(cx, cy, rInner, startAngle);
  return `M ${start.x} ${start.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${end.x} ${end.y} L ${startIn.x} ${startIn.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${endIn.x} ${endIn.y} Z`;
}

function SvgDonut({ data, size, activeId, onHover, isEmpty }: {
  data: {id:string, value:number, color:string}[],
  size: number,
  activeId: string | null,
  onHover: (id:string|null) => void,
  isEmpty?: boolean,
}) {
  const PAD = 32;
  const TOTAL = size + PAD*2;
  const cx = TOTAL/2, cy = TOTAL/2;
  const baseR = size * 0.355;
  const thickness = size * 0.11;
  const gap = 0.024;

  // Empty ghost ring
  if (isEmpty || data.length === 0) {
    return (
      <svg width={TOTAL} height={TOTAL} style={{display:"block", margin:`-${PAD}px`}}>
        <defs>
          <linearGradient id="emptyRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a2330" />
            <stop offset="100%" stopColor="#0f1620" />
          </linearGradient>
          <filter id="emptyInset">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="0" dy="1" result="offsetblur"/>
            <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadow"/>
            <feColorMatrix in="shadow" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.3 0"/>
            <feComposite in2="SourceGraphic" operator="in"/>
          </filter>
        </defs>
        <path
          d={arcPath(cx, cy, baseR+thickness, baseR, -Math.PI/2, Math.PI*1.5 - 0.0001)}
          fill="url(#emptyRing)"
          filter="url(#emptyInset)"
        />
      </svg>
    );
  }

  const total = data.reduce((s,d)=>s+d.value, 0);
  let currentAngle = -Math.PI/2;
  const slices = data.map(d => {
    const angle = (d.value/total) * 2 * Math.PI;
    const slice = { ...d, start: currentAngle, end: currentAngle + angle };
    currentAngle += angle;
    return slice;
  });

  return (
    <svg
      width={TOTAL}
      height={TOTAL}
      style={{display:"block", margin:`-${PAD}px`, cursor:"crosshair"}}
      onMouseLeave={()=>onHover(null)}
    >
      <defs>
        {/* Per-slice gradients */}
        {slices.map(s => (
          <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={lightenColor(s.color, 0.22)} />
            <stop offset="50%" stopColor={s.color} />
            <stop offset="100%" stopColor={darkenColor(s.color, 0.18)} />
          </linearGradient>
        ))}
        {/* Inner shadow filter for depth */}
        <filter id="sliceShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
          <feOffset dx="0" dy="0.5" result="offsetblur"/>
          <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadow"/>
          <feColorMatrix in="shadow" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.4 0"/>
          <feComposite in2="SourceGraphic" operator="over"/>
        </filter>
        {/* Active slice glow */}
        <filter id="activeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {/* Frosted inner circle */}
        <radialGradient id="innerFrost" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#1a2536" stopOpacity="1" />
          <stop offset="70%" stopColor={C.card} stopOpacity="1" />
          <stop offset="100%" stopColor="#0c131c" stopOpacity="1" />
        </radialGradient>
      </defs>

      {slices.map(s => {
        const isActive = activeId === s.id;
        const isNone = activeId === null;
        const midAngle = (s.start + s.end) / 2;
        const offsetDist = isActive ? 6 : 0;
        const ox = Math.cos(midAngle) * offsetDist;
        const oy = Math.sin(midAngle) * offsetDist;

        const outerR = baseR + thickness + (isActive ? 8 : 0);
        const innerR = baseR - (isActive ? 1 : 0);
        const adjStart = s.start + gap/2;
        const adjEnd = s.end - gap/2;

        return (
          <g
            key={s.id}
            transform={`translate(${ox} ${oy})`}
            style={{
              opacity: isNone ? 1 : isActive ? 1 : 0.18,
              transition: `opacity 0.35s ${EASE}, transform 0.4s ${EASE}`,
              cursor: "pointer",
            }}
            onMouseEnter={()=>onHover(s.id)}
          >
            {isActive && (
              <path
                d={arcPath(cx, cy, outerR + 4, outerR - 2, adjStart, adjEnd)}
                fill={s.color}
                opacity="0.25"
                filter="url(#activeGlow)"
              />
            )}
            <path
              d={arcPath(cx, cy, outerR, innerR, adjStart, adjEnd)}
              fill={`url(#grad-${s.id})`}
              filter="url(#sliceShadow)"
              style={{ transition: `d 0.4s ${EASE}` }}
            />
            {/* Specular highlight — thin bright arc on the outer edge */}
            <path
              d={arcPath(cx, cy, outerR, outerR - 2, adjStart, adjEnd)}
              fill={lightenColor(s.color, 0.45)}
              opacity="0.5"
            />
          </g>
        );
      })}

      {/* Frosted inner disc */}
      <circle cx={cx} cy={cy} r={baseR - 1} fill="url(#innerFrost)" />
      {/* Subtle inner rim */}
      <circle cx={cx} cy={cy} r={baseR - 1} fill="none" stroke={C.border} strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

function NavItem({ label, active, onClick }: { label:string, active:boolean, onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ display:"flex",alignItems:"center",width:"100%",padding:"9px 14px",borderRadius:8,border:"none",cursor:"pointer", background:active?C.tealBg:"transparent",color:active?C.teal:C.textSecondary,fontSize:13,fontWeight:active?500:400,fontFamily:FS,transition:`all 0.2s ${EASE}`,textAlign:"left",borderLeft:active?`2px solid ${C.teal}`:"2px solid transparent" }}
      onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background=C.surface;}}
      onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLElement).style.background="transparent";}}
    >{label}</button>
  );
}

function BundleCard({ bundle, onClick }: { bundle:Bundle, onClick:()=>void }) {
  const [hov,setHov]=useState(false); const color=tc(bundle.tier);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{ background:hov?C.cardHover:C.card,border:`0.5px solid ${hov?C.borderHover:C.border}`,borderRadius:14,padding:"18px 20px 14px",cursor:"pointer",transition:`all 0.2s ${EASE}`,position:"relative",overflow:"hidden" }}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color,opacity:0.8}} />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD,marginBottom:4}}>{bundle.id}</div>
          <div style={{fontSize:11,color:C.textMuted,fontFamily:FS}}>{bundle.resolved}/{bundle.totalLegs} resolved · {bundle.daysLeft}d left</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:24,fontWeight:700,color,fontFamily:FD,lineHeight:1}}>{(bundle.nav*100).toFixed(1)}%</div>
          <div style={{fontSize:11,color:C.textSecondary,fontFamily:FS,marginTop:2}}>${bundle.nav.toFixed(3)}</div>
        </div>
      </div>
      <div style={{marginBottom:10,height:44}}><Sparkline data={bundle.history} color={color} height={44} width={300} /></div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontFamily:FS}}>
        <span style={{color:bundle.change>=0?C.green:C.red}}>{bundle.change>=0?"+":""}{bundle.change.toFixed(1)}% today</span>
        <span style={{color:C.textMuted}}>Resolves {bundle.date}</span>
      </div>
    </div>
  );
}

function MoverRow({ bundle, rank, onClick, isPositive }: { bundle:Bundle, rank:number, onClick:()=>void, isPositive:boolean }) {
  const color=tc(bundle.tier); const cc=isPositive?C.green:C.red;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,cursor:"pointer",transition:`all 0.2s ${EASE}`,background:C.card,border:`0.5px solid ${C.border}`}}
      onMouseEnter={e=>(e.currentTarget.style.background=C.cardHover)} onMouseLeave={e=>(e.currentTarget.style.background=C.card)}>
      <div style={{fontSize:18,fontWeight:700,color:C.textMuted,fontFamily:FD,width:20}}>{rank}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>{bundle.id}</div>
        <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:2}}>{bundle.daysLeft}d · {bundle.resolved}/{bundle.totalLegs} resolved</div>
      </div>
      <div style={{width:64}}><Sparkline data={bundle.history} color={cc} height={30} width={64} /></div>
      <div style={{textAlign:"right",minWidth:70}}>
        <div style={{fontSize:15,fontWeight:700,color,fontFamily:FD}}>{(bundle.nav*100).toFixed(1)}%</div>
        <div style={{fontSize:11,color:cc,fontFamily:FS}}>{isPositive?"+":""}{bundle.change.toFixed(1)}%</div>
      </div>
    </div>
  );
}

function Ticker() {
  const items = [...BUNDLES, ...BUNDLES];
  return (
    <div style={{overflow:"hidden",position:"relative",borderRadius:12,background:C.card,border:`0.5px solid ${C.border}`,marginBottom:28}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:60,background:`linear-gradient(to right, ${C.card}, transparent)`,zIndex:2,pointerEvents:"none"}} />
      <div style={{position:"absolute",right:0,top:0,bottom:0,width:60,background:`linear-gradient(to left, ${C.card}, transparent)`,zIndex:2,pointerEvents:"none"}} />
      <div style={{display:"flex",gap:0,whiteSpace:"nowrap",animation:"tickerScroll 60s linear infinite"}}>
        {items.map((b,i)=>(
          <div key={`${b.id}-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 22px",borderRight:`0.5px solid ${C.border}`,flexShrink:0}}>
            <div style={{width:4,height:4,borderRadius:"50%",background:tc(b.tier)}} />
            <span style={{fontSize:11,fontWeight:600,color:C.textPrimary,fontFamily:FD,letterSpacing:"0.02em"}}>{b.id}</span>
            <span style={{fontSize:11,color:C.textSecondary,fontFamily:FS}}>${b.nav.toFixed(3)}</span>
            <span style={{fontSize:11,fontWeight:500,color:b.change>=0?C.green:C.red,fontFamily:FS}}>
              {b.change>=0?"▲":"▼"} {Math.abs(b.change).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedHero({ bundle, onClick }: { bundle:Bundle, onClick:()=>void }) {
  const isMobile = useMobile();
  const color = tc(bundle.tier);
  return (
    <div onClick={onClick} style={{
      background:`linear-gradient(135deg, ${C.card} 0%, ${C.surface} 100%)`,
      border:`0.5px solid ${C.border}`,
      borderRadius:18,
      padding: isMobile ? "20px 18px" : "28px 32px",
      cursor:"pointer",
      position:"relative",
      overflow:"hidden",
      transition:`transform 0.3s ${EASE}, border-color 0.3s ${EASE}`,
      marginBottom:28,
    }}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.borderColor=C.borderHover;}}
    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.borderColor=C.border;}}
    >
      <div style={{position:"absolute",top:-100,right:-100,width:400,height:400,background:`radial-gradient(circle, ${color}1a 0%, transparent 65%)`,pointerEvents:"none"}} />
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1.3fr",gap:isMobile?16:36,position:"relative",zIndex:1,alignItems:"center"}}>
        <div>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"4px 10px",borderRadius:20,background:color+"18",border:`0.5px solid ${color}40`,marginBottom:12}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:color}} />
            <span style={{fontSize:10,color,fontFamily:FS,fontWeight:500,letterSpacing:"0.1em"}}>FEATURED · {bundle.tier}% TIER</span>
          </div>
          <div style={{fontSize:isMobile?22:30,fontWeight:700,color:C.textPrimary,fontFamily:FD,marginBottom:6,letterSpacing:"-0.01em"}}>{bundle.id}</div>
          <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS,marginBottom:16}}>
            {bundle.resolved}/{bundle.totalLegs} legs resolved · Resolves {bundle.date}
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:12}}>
            <div style={{fontSize:isMobile?36:48,fontWeight:700,color,fontFamily:FD,lineHeight:1,letterSpacing:"-0.02em"}}>{(bundle.nav*100).toFixed(1)}%</div>
            <div>
              <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>${bundle.nav.toFixed(3)}</div>
              <div style={{fontSize:12,fontWeight:500,color:bundle.change>=0?C.green:C.red,fontFamily:FS,marginTop:2}}>
                {bundle.change>=0?"+":""}{bundle.change.toFixed(2)}% today
              </div>
            </div>
          </div>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color,fontFamily:FS,fontWeight:500}}>
            View constellation →
          </div>
        </div>
        {!isMobile && (
          <div style={{height:160}}>
            <Sparkline data={bundle.history} color={color} height={160} width={500} />
          </div>
        )}
      </div>
    </div>
  );
}

function PulseGauge({ prob, color, size=56 }: { prob:number, color:string, size?:number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if(!c) return;
    const dpr = window.devicePixelRatio||1;
    c.width=size*dpr; c.height=size*dpr; c.style.width=size+"px"; c.style.height=size+"px";
    const ctx = c.getContext("2d")!; ctx.scale(dpr,dpr);
    const cx=size/2, cy=size/2, r=size/2-4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI*0.75, Math.PI*2.25);
    ctx.lineWidth=4; ctx.strokeStyle=C.border; ctx.lineCap="round"; ctx.stroke();
    const endAngle = Math.PI*0.75 + (prob/100)*Math.PI*1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI*0.75, endAngle);
    ctx.lineWidth=4; ctx.strokeStyle=color; ctx.lineCap="round"; ctx.stroke();
  }, [prob, color, size]);
  return <canvas ref={ref} style={{display:"block"}} />;
}

function MarketsPage({ onSelect }: { onSelect:(b:Bundle,from:string)=>void }) {
  const isMobile = useMobile();
  const sorted=[...BUNDLES].sort((a,b)=>b.change-a.change);
  const gainers=sorted.slice(0,3); const losers=[...sorted].reverse().slice(0,3);
  const featured = sorted[0];

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:28,fontWeight:700,color:C.textPrimary,fontFamily:FD,marginBottom:4,letterSpacing:"-0.01em"}}>Markets</div>
        <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>{BUNDLES.length} active constellations · live NAV</div>
      </div>
      <Ticker />
      <FeaturedHero bundle={featured} onClick={()=>onSelect(featured,"markets")} />
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20,marginBottom:36}}>
        <div>
          <div style={{fontSize:11,color:C.green,fontFamily:FS,fontWeight:500,letterSpacing:"0.08em",marginBottom:10}}>TOP GAINERS</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {gainers.map((b,i)=><MoverRow key={b.id} bundle={b} rank={i+1} isPositive={true} onClick={()=>onSelect(b,"markets")} />)}
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:C.red,fontFamily:FS,fontWeight:500,letterSpacing:"0.08em",marginBottom:10,marginTop:isMobile?16:0}}>TOP LOSERS</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {losers.map((b,i)=><MoverRow key={b.id} bundle={b} rank={i+1} isPositive={false} onClick={()=>onSelect(b,"markets")} />)}
          </div>
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,fontWeight:500,letterSpacing:"0.08em"}}>PREDICTION MARKET PULSE</div>
          {!isMobile && <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.06em"}}>UNDERLYING MARKETS · LIVE</div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3, 1fr)",gap:10}}>
          {HOT_PREDICTIONS.map((p,i)=>{
            const color = p.prob>70?C.teal:p.prob>50?C.amber:C.coral;
            return (
              <div key={i} style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,padding:isMobile?"12px 14px":"16px 18px",display:"flex",alignItems:"center",gap:isMobile?10:14,transition:`all 0.2s ${EASE}`}}
                onMouseEnter={e=>{e.currentTarget.style.background=C.cardHover;e.currentTarget.style.borderColor=C.borderHover;}}
                onMouseLeave={e=>{e.currentTarget.style.background=C.card;e.currentTarget.style.borderColor=C.border;}}
              >
                <PulseGauge prob={p.prob} color={color} size={isMobile?44:56} />
                <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                  <div style={{fontSize:isMobile?11:12,color:C.textPrimary,fontFamily:FS,marginBottom:4,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{p.label}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                    <span style={{fontSize:isMobile?15:18,fontWeight:700,color:C.textPrimary,fontFamily:FD,letterSpacing:"-0.01em"}}>{p.prob}%</span>
                    <span style={{fontSize:11,color:p.change>=0?C.green:C.red,fontFamily:FS,fontWeight:500}}>
                      {p.change>=0?"+":""}{p.change.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,fontWeight:500,letterSpacing:"0.08em",marginBottom:12}}>LATEST NEWS</div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3, 1fr)",gap:10}}>
          {NEWS.slice(0,isMobile?4:6).map((n,i)=>(
            <div key={i} style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:10,padding:"12px 14px",borderLeft:`2px solid ${n.impact==="positive"?C.green:n.impact==="negative"?C.red:C.textMuted}`,transition:`all 0.2s ${EASE}`}}
              onMouseEnter={e=>e.currentTarget.style.background=C.cardHover}
              onMouseLeave={e=>e.currentTarget.style.background=C.card}
            >
              <div style={{fontSize:12,color:C.textPrimary,fontFamily:FS,lineHeight:1.4,marginBottom:8,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{n.headline}</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted,fontFamily:FS}}>
                <span>{n.source}</span><span>{n.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type TimeFilter="week"|"month"|"long";
type SortOption="change_desc"|"change_asc"|"nav_desc"|"nav_asc"|"days_asc";

function ConstellationsPage({ onSelect }: { onSelect:(b:Bundle,from:string)=>void }) {
  const [tier,setTier]=useState<90|70|50>(90);
  const [time,setTime]=useState<TimeFilter>("week");
  const [sort,setSort]=useState<SortOption>("change_desc");
  const timeMap:Record<TimeFilter,string>={week:"This week",month:"This month",long:"Long term"};
  const sortMap:Record<SortOption,string>={change_desc:"Top gainers",change_asc:"Top losers",nav_desc:"Highest prob",nav_asc:"Lowest prob",days_asc:"Expiring soon"};
  const filtered=BUNDLES.filter(b=>b.tier===tier&&tl(b.daysLeft)===timeMap[time]).sort((a,b)=>{
    if(sort==="change_desc") return b.change-a.change;
    if(sort==="change_asc") return a.change-b.change;
    if(sort==="nav_desc") return b.nav-a.nav;
    if(sort==="nav_asc") return a.nav-b.nav;
    return a.daysLeft-b.daysLeft;
  });
  const Pill=({children,active,onClick,color}:{children:React.ReactNode,active:boolean,onClick:()=>void,color?:string})=>(
    <button onClick={onClick} style={{padding:"7px 16px",borderRadius:8,border:`0.5px solid ${active?(color||C.teal):C.border}`,background:active?(color||C.teal)+"18":"transparent",color:active?(color||C.teal):C.textSecondary,fontSize:12,fontFamily:FS,cursor:"pointer",transition:`all 0.2s ${EASE}`,fontWeight:active?500:400}}>{children}</button>
  );
  return (
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:28,fontWeight:700,color:C.textPrimary,fontFamily:FD,marginBottom:4,letterSpacing:"-0.01em"}}>Constellations</div>
        <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>Browse and filter all available structured constellations</div>
      </div>
      <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:14,padding:"18px 20px",marginBottom:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.08em",marginBottom:8}}>PROBABILITY TIER</div>
            <div style={{display:"flex",gap:8}}>
              {([90,70,50] as const).map(t=><Pill key={t} active={tier===t} onClick={()=>setTier(t)} color={tc(t)}>{t}%</Pill>)}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.08em",marginBottom:8}}>RESOLUTION WINDOW</div>
            <div style={{display:"flex",gap:8}}>
              {(["week","month","long"] as TimeFilter[]).map(t=><Pill key={t} active={time===t} onClick={()=>setTime(t)}>{timeMap[t]}</Pill>)}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.08em",marginBottom:8}}>SORT BY</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {(Object.keys(sortMap) as SortOption[]).map(s=><Pill key={s} active={sort===s} onClick={()=>setSort(s)}>{sortMap[s]}</Pill>)}
            </div>
          </div>
        </div>
      </div>
      {filtered.length===0?(
        <div style={{textAlign:"center",color:C.textMuted,padding:"60px 0",fontSize:14,fontFamily:FS}}>No constellations match these filters</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))",gap:14}}>
          {filtered.map(b=><BundleCard key={b.id} bundle={b} onClick={()=>onSelect(b,"constellations")} />)}
        </div>
      )}
    </div>
  );
}

function DetailPage({ bundle, fromTab, onBack, demoMode, demoUsdc, onDemoDeposit, onDemoPpnDeposit }: {
  bundle:Bundle, fromTab:string, onBack:()=>void,
  demoMode:boolean, demoUsdc:number,
  onDemoDeposit:(bundleId:string, usdcAmount:number) => void,
  onDemoPpnDeposit:(bundleId:string, usdcAmount:number) => void,
}) {
  const isMobile = useMobile();
  const [usdcAmt,setUsdcAmt]=useState("");
  const [ppnMode,setPpnMode]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [flash,setFlash]=useState(false);
  const color=tc(bundle.tier);
  const dep=parseFloat(usdcAmt)||0;
  const tokensOut=dep>0?((dep*0.995)/bundle.nav).toFixed(2):"—";
  const apy=8.4;
  const vaultSplit=0.93; const basketSplit=0.07;
  const vaultAmt=dep*vaultSplit; const basketAmt=dep*basketSplit;
  const tokensFromBasket=dep>0?(basketAmt*0.995/bundle.nav):0;
  const worstCase=vaultAmt; const bestCase=vaultAmt+tokensFromBasket;

  const insufficient = demoMode && dep > demoUsdc;

  const handleConfirm = () => {
    if (!demoMode) { setConfirmed(true); return; }
    if (dep <= 0 || insufficient) return;
    if (ppnMode) onDemoPpnDeposit(bundle.id, dep);
    else onDemoDeposit(bundle.id, dep);
    setConfirmed(true);
    setFlash(true);
    setTimeout(()=>setFlash(false), 900);
    setTimeout(()=>{ setUsdcAmt(""); setConfirmed(false); }, 1500);
  };

  return (
    <div>
      <button onClick={onBack} style={{background:"none",border:"none",color:C.textSecondary,cursor:"pointer",fontSize:13,marginBottom:20,padding:0,fontFamily:FS,display:"flex",alignItems:"center",gap:8,transition:`color 0.2s ${EASE}`}}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color=C.textPrimary}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color=C.textSecondary}
      >
        <span style={{fontSize:16,lineHeight:1}}>←</span>
        <span>Back to {fromTab==="constellations"?"Constellations":fromTab==="portfolio"?"Portfolio":"Markets"}</span>
      </button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:30,fontWeight:700,color:C.textPrimary,fontFamily:FD,marginBottom:6,letterSpacing:"-0.01em"}}>{bundle.id}</div>
          <div style={{display:"flex",gap:16,fontSize:13,color:C.textSecondary,fontFamily:FS}}>
            <span>{bundle.resolved}/{bundle.totalLegs} legs resolved</span>
            <span>·</span><span>{bundle.daysLeft} days remaining</span>
            <span>·</span><span>Resolves {bundle.date}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:44,fontWeight:700,color,fontFamily:FD,lineHeight:1,letterSpacing:"-0.02em"}}>{(bundle.nav*100).toFixed(1)}%</div>
          <div style={{fontSize:13,fontFamily:FS,marginTop:4}}>
            <span style={{color:C.textSecondary}}>${bundle.nav.toFixed(3)} · </span>
            <span style={{color:bundle.change>=0?C.green:C.red}}>{bundle.change>=0?"+":""}{bundle.change.toFixed(1)}% today</span>
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 300px",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:14,padding:"20px 20px 16px"}}>
            <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,letterSpacing:"0.06em",marginBottom:14}}>NAV HISTORY (30 days)</div>
            <NavChart data={bundle.history} color={color} tier={bundle.tier} />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[["Issue price",`$${bundle.issue.toFixed(2)}`],["Current NAV",`$${bundle.nav.toFixed(3)}`],["Legs resolved",`${bundle.resolved}/${bundle.totalLegs}`],["Days left",`${bundle.daysLeft}d`]].map(([k,v])=>(
              <div key={k} style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginBottom:6}}>{k}</div>
                <div style={{fontSize:18,fontWeight:700,color:C.textPrimary,fontFamily:FD}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,padding:"14px 18px"}}>
            <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,letterSpacing:"0.06em",marginBottom:10}}>RESOLUTION PROGRESS</div>
            <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:6}}>
              <div style={{width:`${Math.max(4,100-(bundle.daysLeft/180)*100)}%`,height:"100%",background:color,borderRadius:3}} />
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.textMuted,fontFamily:FS}}>
              <span>Issued</span><span style={{color:C.textSecondary}}>Resolves {bundle.date}</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:14,padding:20,position:"relative",overflow:"hidden",boxShadow:flash?`0 0 0 1px ${C.green}, 0 0 30px ${C.green}40`:"none",transition:`box-shadow 0.4s ${EASE}`}}>
            <div style={{fontSize:14,fontWeight:600,color:C.textPrimary,fontFamily:FD,marginBottom:demoMode?6:16}}>{ppnMode?"Principal Protection":"Deposit USDC"}</div>
            {demoMode && (
              <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginBottom:12,letterSpacing:"0.04em"}}>
                DEMO BALANCE · <span style={{color:C.teal}}>${demoUsdc.toFixed(0)}</span> USDC
              </div>
            )}
            <input type="number" placeholder="0.00" value={usdcAmt} onChange={e=>{setUsdcAmt(e.target.value);setConfirmed(false);setPpnMode(false);}}
              style={{width:"100%",background:C.surface,border:`0.5px solid ${insufficient?C.red:C.border}`,borderRadius:10,padding:"12px 14px",color:C.textPrimary,fontSize:22,fontWeight:700,fontFamily:FD,boxSizing:"border-box",marginBottom:insufficient?6:14,outline:"none"}} />
            {insufficient && <div style={{fontSize:11,color:C.red,fontFamily:FS,marginBottom:10}}>Insufficient balance</div>}
            {!ppnMode?(
              <>
                <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                  {[["Tokens received",tokensOut,C.textPrimary],["Entry probability",`${(bundle.nav*100).toFixed(1)}%`,color],["Max payout",dep>0?`$${(dep*0.995/bundle.nav).toFixed(0)}`:"—",C.green]].map(([k,v,c])=>(
                    <div key={k as string} style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FS,marginBottom:8}}>
                      <span style={{color:C.textSecondary}}>{k as string}</span>
                      <span style={{color:c as string,fontFamily:FD,fontWeight:600}}>{v as string}</span>
                    </div>
                  ))}
                </div>
                <button onClick={handleConfirm} disabled={insufficient || dep<=0} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:confirmed?C.green:(insufficient||dep<=0)?C.border:color,color:(insufficient||dep<=0)?C.textMuted:"#000",fontSize:14,fontWeight:700,fontFamily:FD,cursor:(insufficient||dep<=0)?"not-allowed":"pointer",marginBottom:8,transition:`all 0.25s ${EASE}`,opacity:(insufficient||dep<=0)?0.7:1}}>
                  {confirmed?"✓ Confirmed":demoMode?"Buy tokens":"Confirm deposit"}
                </button>
                {dep>0&&!insufficient&&(
                  <button onClick={()=>setPpnMode(true)} style={{width:"100%",padding:"10px 0",borderRadius:10,border:`0.5px solid ${C.teal}`,background:C.tealBg,color:C.teal,fontSize:13,fontWeight:600,fontFamily:FD,cursor:"pointer",transition:`all 0.2s ${EASE}`}}>
                    Execute principal protection
                  </button>
                )}
              </>
            ):(
              <>
                {dep>0&&(
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",marginBottom:6}}>
                      <div style={{width:"93%",background:C.teal,borderRadius:"3px 0 0 3px"}} />
                      <div style={{width:"7%",background:color,borderRadius:"0 3px 3px 0"}} />
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted,fontFamily:FS}}>
                      <span style={{color:C.teal}}>93% vault · ${vaultAmt.toFixed(0)}</span>
                      <span style={{color}}>7% basket · ${basketAmt.toFixed(0)}</span>
                    </div>
                  </div>
                )}
                <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FS,marginBottom:10,paddingBottom:10,borderBottom:`0.5px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:2,background:C.teal}} />
                      <span style={{color:C.textSecondary}}>Meteora vault</span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:C.textPrimary,fontWeight:500,fontFamily:FS}}>{dep>0?`$${vaultAmt.toFixed(0)}`:"—"}</div>
                      <div style={{fontSize:10,color:C.teal,marginTop:1}}>{apy}% APY · redeemable anytime</div>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FS}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:2,background:color}} />
                      <span style={{color:C.textSecondary}}>{bundle.id}</span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:C.textPrimary,fontWeight:500,fontFamily:FS}}>{dep>0?`$${basketAmt.toFixed(0)}`:"—"}</div>
                      <div style={{fontSize:10,color,marginTop:1}}>{dep>0?`${tokensFromBasket.toFixed(1)} tokens at $${bundle.nav.toFixed(3)}`:"—"}</div>
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`0.5px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.06em",marginBottom:6}}>WORST CASE</div>
                    <div style={{fontSize:18,fontWeight:600,color:C.textPrimary,fontFamily:FS}}>{dep>0?`$${worstCase.toFixed(0)}`:"—"}</div>
                    <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginTop:4}}>Vault back · basket zero</div>
                  </div>
                  <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`0.5px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.green,fontFamily:FS,letterSpacing:"0.06em",marginBottom:6}}>BEST CASE</div>
                    <div style={{fontSize:18,fontWeight:600,color:C.textPrimary,fontFamily:FS}}>{dep>0?`$${bestCase.toFixed(0)}`:"—"}</div>
                    <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginTop:4}}>Vault + basket at $1.00</div>
                  </div>
                </div>
                <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginBottom:14,textAlign:"center"}}>
                  Split optimized for {apy}% APY · {bundle.daysLeft}d timeline
                </div>
                <button onClick={handleConfirm} disabled={insufficient || dep<=0} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:confirmed?C.green:(insufficient||dep<=0)?C.border:C.teal,color:(insufficient||dep<=0)?C.textMuted:"#000",fontSize:14,fontWeight:700,fontFamily:FD,cursor:(insufficient||dep<=0)?"not-allowed":"pointer",marginBottom:8,transition:`all 0.25s ${EASE}`,opacity:(insufficient||dep<=0)?0.7:1}}>
                  {confirmed?"✓ Protected":demoMode?"Execute protection":"Confirm protection"}
                </button>
                <button onClick={()=>setPpnMode(false)} style={{width:"100%",padding:"8px 0",borderRadius:10,border:`0.5px solid ${C.border}`,background:"transparent",color:C.textSecondary,fontSize:12,fontFamily:FS,cursor:"pointer"}}>
                  Back to standard deposit
                </button>
              </>
            )}
            <div style={{fontSize:10,color:C.textMuted,textAlign:"center",marginTop:10,fontFamily:FS}}>
              {demoMode?"Demo mode · no real transactions":"Auto-redeems at resolution · Solana devnet"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioPage({ onSelect, portfolio, vaultPositions, usdcBalance, demoMode }: {
  onSelect:(b:Bundle,from:string)=>void,
  portfolio:Position[],
  vaultPositions:VaultPos[],
  usdcBalance:number,
  demoMode:boolean,
}) {
  const isMobile = useMobile();
  const [activeId,setActiveId]=useState<string|null>(null);

  const lkrsPositions=portfolio.map(p=>{
    const bundle=BUNDLES.find(b=>b.id===p.id)!;
    const currentVal=p.qty*bundle.nav;
    const pnl=currentVal-p.qty*p.avgCost;
    const pnlPct=((bundle.nav-p.avgCost)/p.avgCost)*100;
    const maxPayout = p.qty * 1.00; // each token pays $1 max if all legs hit
    const unresolved = bundle.totalLegs - bundle.resolved;
    return {id:p.id,bundle,currentVal,pnl,pnlPct,color:tc(bundle.tier),qty:p.qty,avgCost:p.avgCost,maxPayout,unresolved};
  });

  const vaultDerived = vaultPositions.map(v=>({
    ...v, currentVal:v.principal+v.yieldEarned, pnl:v.yieldEarned,
    pnlPct:v.principal>0?(v.yieldEarned/v.principal)*100:0, color:C.teal,
  }));

  const usdcPos={id:"USDC",currentVal:usdcBalance,pnl:0,pnlPct:0,color:"#4a5a6a"};

  const allForDonut=[
    ...lkrsPositions.map(p=>({id:p.id,value:p.currentVal,color:p.color})),
    ...vaultDerived.map(v=>({id:v.id,value:v.currentVal,color:v.color})),
    {id:"USDC",value:usdcPos.currentVal,color:usdcPos.color},
  ].filter(p=>p.value>0).sort((a,b)=>b.value-a.value);

  const totalValue=allForDonut.reduce((s,p)=>s+p.value,0);
  const totalPnl=lkrsPositions.reduce((s,p)=>s+p.pnl,0)+vaultDerived.reduce((s,v)=>s+v.pnl,0);
  const weightedProb= totalValue>0 ? (
    lkrsPositions.reduce((s,p)=>s+((p.bundle.tier/100)*p.currentVal),0)
    + vaultDerived.reduce((s,v)=>s+v.currentVal,0)
    + usdcPos.currentVal
  )/totalValue*100 : 0;

  // Total max payout if everything resolves favorably
  const totalMaxPayout = lkrsPositions.reduce((s,p)=>s+p.maxPayout, 0) +
                        vaultDerived.reduce((s,v)=>s+v.principal, 0) +
                        usdcPos.currentVal;

  const activeLkrs=activeId?lkrsPositions.find(p=>p.id===activeId):null;
  const activeVault=activeId?vaultDerived.find(v=>v.id===activeId):null;
  const activeUsdc=activeId==="USDC";
  const activePos=activeLkrs??activeVault??(activeUsdc?usdcPos:null);
  const activeColor=activeLkrs?.color??activeVault?.color??(activeUsdc?"#4a5a6a":null);
  const activeShare=activePos?(activePos.currentVal/totalValue*100):null;

  const hasNoPositions = lkrsPositions.length === 0 && vaultDerived.length === 0;
  const isFullyEmpty = hasNoPositions && usdcBalance === 0;

  return (
    <div>
      <div style={{marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:28,fontWeight:700,color:C.textPrimary,fontFamily:FD,marginBottom:4,letterSpacing:"-0.01em"}}>Portfolio</div>
          <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>
            {demoMode ? "Demo wallet · $10,000 starting balance" : "Example wallet · Solana devnet"}
          </div>
        </div>
        {demoMode && !hasNoPositions && (
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.08em",marginBottom:3}}>MAX POTENTIAL VALUE</div>
            <div style={{fontSize:18,fontWeight:600,color:C.green,fontFamily:FD,letterSpacing:"-0.01em"}}>${totalMaxPayout.toFixed(0)}</div>
          </div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:isMobile?8:12,marginBottom:24}}>
        {[
          ["TOTAL VALUE",`$${totalValue.toFixed(2)}`,C.green],
          ["UNREALIZED P&L",`${totalPnl>=0?"+":""}$${totalPnl.toFixed(2)}`,totalPnl>=0?C.green:C.red],
          ["WEIGHTED PROB",`${weightedProb.toFixed(1)}%`,C.teal]
        ].map(([label,val,color])=>(
          <div key={label as string} style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,padding:isMobile?"12px 10px":"18px 20px"}}>
            <div style={{fontSize:isMobile?8:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.07em",marginBottom:isMobile?6:10,lineHeight:1.3}}>{label as string}</div>
            <div style={{fontSize:isMobile?16:26,fontWeight:500,color:color as string,fontFamily:FS,letterSpacing:"-0.01em"}}>{val as string}</div>
          </div>
        ))}
      </div>

      {/* PREMIUM DONUT CARD */}
      <div style={{
        background:`linear-gradient(180deg, ${C.card} 0%, ${darkenColor(C.card, 0.15)} 100%)`,
        border:`0.5px solid ${C.border}`,
        borderRadius:24,
        marginBottom:20,
        overflow:"hidden",
        position:"relative",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 60px rgba(0,0,0,0.2)",
      }}>
        {/* Subtle grain texture via radial gradient */}
        <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 0%, rgba(255,255,255,0.02) 0%, transparent 50%)`,pointerEvents:"none"}} />
        {/* Active color wash */}
        <div style={{position:"absolute",inset:0,background:activeId&&activeColor?`radial-gradient(ellipse 60% 50% at 50% 45%, ${activeColor}18 0%, transparent 70%)`:"transparent",transition:`background 0.6s ${EASE}`,pointerEvents:"none"}} />

        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"64px 0 52px",position:"relative"}}>
          <div style={{position:"relative",marginBottom:40}}>
            <SvgDonut data={allForDonut} size={340} activeId={activeId} onHover={setActiveId} isEmpty={allForDonut.length===0} />
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none",width:200}}>
              {isFullyEmpty ? (
                <div>
                  <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,letterSpacing:"0.14em",marginBottom:12}}>NO POSITIONS</div>
                  <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS,lineHeight:1.5}}>
                    Your portfolio is empty
                  </div>
                </div>
              ) : activeId && activePos ? (
                <div key={activeId} style={{animation:`fadeIn 0.35s ${EASE}`}}>
                  <div style={{display:"inline-block",padding:"3px 10px",borderRadius:20,background:(activeColor||C.teal)+"22",border:`0.5px solid ${activeColor||C.teal}55`,marginBottom:12}}>
                    <span style={{fontSize:9,color:activeColor||C.teal,fontFamily:FS,letterSpacing:"0.12em",fontWeight:600}}>{activeId}</span>
                  </div>
                  <div style={{fontSize:38,fontWeight:600,color:C.textPrimary,fontFamily:FS,lineHeight:1,marginBottom:8,letterSpacing:"-0.03em"}}>{activeShare?.toFixed(1)}%</div>
                  <div style={{fontSize:14,color:C.textSecondary,fontFamily:FS,marginBottom:4}}>${activePos.currentVal.toFixed(0)}</div>
                  {activePos.pnl !== 0 && (
                    <div style={{fontSize:12,color:activePos.pnl>=0?C.green:C.red,fontFamily:FS,fontWeight:500}}>
                      {activePos.pnl>=0?"+":""}{activePos.pnlPct.toFixed(1)}%
                    </div>
                  )}
                </div>
              ) : (
                <div key="total" style={{animation:`fadeIn 0.35s ${EASE}`}}>
                  <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.14em",marginBottom:12}}>TOTAL VALUE</div>
                  <div style={{fontSize:38,fontWeight:600,color:C.textPrimary,fontFamily:FS,lineHeight:1,marginBottom:10,letterSpacing:"-0.03em"}}>${totalValue.toFixed(0)}</div>
                  <div style={{fontSize:11,color:C.textMuted,fontFamily:FS}}>{allForDonut.length} position{allForDonut.length!==1?"s":""}</div>
                </div>
              )}
            </div>
          </div>
          {!isFullyEmpty && (
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",maxWidth:500}}>
              {[90,70,50].map(tier=>{
                const tp=lkrsPositions.filter(p=>p.bundle.tier===tier);
                if(!tp.length) return null;
                const tv=tp.reduce((s,p)=>s+p.currentVal,0);
                const isAct=activeId&&activeLkrs?.bundle.tier===tier;
                return (
                  <div key={tier} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:100,background:isAct?tc(tier)+"22":C.surface,border:`0.5px solid ${isAct?tc(tier)+"66":C.border}`,transition:`all 0.3s ${EASE}`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:tc(tier)}} />
                    <span style={{fontSize:11,color:C.textSecondary,fontFamily:FS}}>{tier}%</span>
                    <span style={{fontSize:11,fontWeight:500,color:isAct?tc(tier):C.textPrimary,fontFamily:FS,transition:`color 0.3s ${EASE}`}}>${tv.toFixed(0)}</span>
                  </div>
                );
              })}
              {vaultDerived.map(v=>(
                <div key={v.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:100,background:activeId===v.id?C.tealBg:C.surface,border:`0.5px solid ${activeId===v.id?C.teal+"66":C.border}`,transition:`all 0.3s ${EASE}`}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:C.teal}} />
                  <span style={{fontSize:11,color:C.textSecondary,fontFamily:FS}}>Vault</span>
                  <span style={{fontSize:11,fontWeight:500,color:activeId===v.id?C.teal:C.textPrimary,fontFamily:FS,transition:`color 0.3s ${EASE}`}}>${v.currentVal.toFixed(0)}</span>
                </div>
              ))}
              {usdcBalance>0 && (
                <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:100,background:activeId==="USDC"?"#4a5a6a22":C.surface,border:`0.5px solid ${activeId==="USDC"?"#4a5a6a66":C.border}`,transition:`all 0.3s ${EASE}`}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"#4a5a6a"}} />
                  <span style={{fontSize:11,color:C.textSecondary,fontFamily:FS}}>USDC</span>
                  <span style={{fontSize:11,fontWeight:500,color:activeId==="USDC"?"#8a9aaa":C.textPrimary,fontFamily:FS,transition:`color 0.3s ${EASE}`}}>${usdcBalance.toFixed(0)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasNoPositions && (
        <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:16,padding:"40px 24px",textAlign:"center"}}>
          <div style={{fontSize:14,color:C.textSecondary,fontFamily:FS,marginBottom:6}}>No constellation positions yet</div>
          <div style={{fontSize:12,color:C.textMuted,fontFamily:FS}}>
            {demoMode ? "Head to Constellations or Markets to make your first demo purchase" : "Connect a wallet and deposit to get started"}
          </div>
        </div>
      )}

      {!hasNoPositions && (
        <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
          {isMobile ? (
            // MOBILE: compact card rows, no horizontal scroll
            <div>
              {[90,70,50].map(tier=>{
                const tp=lkrsPositions.filter(p=>p.bundle.tier===tier).sort((a,b)=>b.currentVal-a.currentVal);
                if(!tp.length) return null;
                return (
                  <div key={tier}>
                    <div style={{padding:"7px 16px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:tc(tier)}} />
                      <span style={{fontSize:10,color:tc(tier),fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>{tier}% TIER</span>
                    </div>
                    {tp.map(p=>(
                      <div key={p.id} onClick={()=>onSelect(p.bundle,"portfolio")}
                        style={{padding:"12px 16px",borderBottom:`0.5px solid ${C.border}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                          <div style={{width:3,height:32,borderRadius:2,background:p.color,flexShrink:0}} />
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>{p.id}</div>
                            <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:1}}>{p.bundle.resolved}/{p.bundle.totalLegs} resolved · {p.bundle.daysLeft}d</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${p.currentVal.toFixed(0)}</div>
                          <div style={{fontSize:11,fontWeight:600,color:p.pnl>=0?C.green:C.red,fontFamily:FD}}>{p.pnl>=0?"+":""}{p.pnlPct.toFixed(1)}%</div>
                          <div style={{fontSize:10,color:C.textMuted,fontFamily:FS}}>max ${p.maxPayout.toFixed(0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {vaultDerived.length>0&&(
                <div>
                  <div style={{padding:"7px 16px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:C.teal}} />
                    <span style={{fontSize:10,color:C.teal,fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>METEORA VAULT</span>
                  </div>
                  {vaultDerived.map(v=>(
                    <div key={v.id} style={{padding:"12px 16px",borderBottom:`0.5px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:3,height:32,borderRadius:2,background:C.teal,flexShrink:0}} />
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>{v.label}</span>
                            <span style={{fontSize:9,padding:"2px 5px",borderRadius:8,background:C.tealBg,color:C.teal,border:`0.5px solid ${C.teal}44`,fontFamily:FS}}>PROTECTED</span>
                          </div>
                          <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:1}}>{v.apy}% APY · {v.daysLeft}d left</div>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${v.currentVal.toFixed(0)}</div>
                        <div style={{fontSize:11,color:C.green,fontFamily:FS}}>+${v.yieldEarned.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{padding:"7px 16px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#4a5a6a"}} />
                  <span style={{fontSize:10,color:"#6b8099",fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>CASH</span>
                </div>
                <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:3,height:32,borderRadius:2,background:"#4a5a6a",flexShrink:0}} />
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>USDC</div>
                      <div style={{fontSize:11,color:C.textMuted,fontFamily:FS}}>Available</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${usdcBalance.toFixed(0)}</div>
                    <div style={{fontSize:11,color:C.textMuted,fontFamily:FS}}>0.0%</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // DESKTOP: full table unchanged
            <div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1.2fr 90px 80px",padding:"10px 24px",borderBottom:`0.5px solid ${C.border}`}}>
                {["Position","Qty","NAV","Value","Max payout","30d","P&L"].map(h=>(
                  <div key={h} style={{fontSize:10,color:C.textMuted,fontFamily:FS,letterSpacing:"0.06em"}}>{h.toUpperCase()}</div>
                ))}
              </div>
              {[90,70,50].map(tier=>{
                const tp=lkrsPositions.filter(p=>p.bundle.tier===tier).sort((a,b)=>b.currentVal-a.currentVal);
                if(!tp.length) return null;
                return (
                  <div key={tier}>
                    <div style={{padding:"7px 24px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:tc(tier)}} />
                      <span style={{fontSize:10,color:tc(tier),fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>{tier}% TIER</span>
                    </div>
                    {tp.map(p=>(
                      <div key={p.id}
                        onClick={()=>onSelect(p.bundle,"portfolio")}
                        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.cardHover;setActiveId(p.id);}}
                        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";setActiveId(null);}}
                        style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1.2fr 90px 80px",padding:"13px 24px",borderBottom:`0.5px solid ${C.border}`,cursor:"pointer",transition:`background 0.2s ${EASE}`,alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:3,height:30,borderRadius:2,background:p.color,flexShrink:0}} />
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>{p.id}</div>
                            <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:1}}>{p.bundle.daysLeft}d · {p.bundle.resolved}/{p.bundle.totalLegs} resolved</div>
                          </div>
                        </div>
                        <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>{p.qty.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
                        <div style={{fontSize:13,fontWeight:600,color:p.color,fontFamily:FD}}>${p.bundle.nav.toFixed(3)}</div>
                        <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${p.currentVal.toFixed(0)}</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:500,color:C.green,fontFamily:FD}}>${p.maxPayout.toFixed(0)}</div>
                          <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginTop:1}}>{p.unresolved} leg{p.unresolved!==1?"s":""} to resolve</div>
                        </div>
                        <div><Sparkline data={p.bundle.history} color={p.color} height={26} width={80} /></div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:600,color:p.pnl>=0?C.green:C.red,fontFamily:FD}}>{p.pnl>=0?"+":""}{p.pnlPct.toFixed(1)}%</div>
                          <div style={{fontSize:10,color:C.textMuted,fontFamily:FS}}>{p.pnl>=0?"+":""}${p.pnl.toFixed(0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {vaultDerived.length>0&&(
                <div>
                  <div style={{padding:"7px 24px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:C.teal}} />
                    <span style={{fontSize:10,color:C.teal,fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>METEORA VAULT</span>
                  </div>
                  {vaultDerived.map(v=>(
                    <div key={v.id}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.cardHover;setActiveId(v.id);}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";setActiveId(null);}}
                      style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1.2fr 90px 80px",padding:"13px 24px",borderBottom:`0.5px solid ${C.border}`,cursor:"default",transition:`background 0.2s ${EASE}`,alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:3,height:30,borderRadius:2,background:C.teal,flexShrink:0}} />
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>{v.label}</span>
                            <span style={{fontSize:9,padding:"2px 6px",borderRadius:10,background:C.tealBg,color:C.teal,border:`0.5px solid ${C.teal}44`,fontWeight:500,fontFamily:FS}}>PROTECTED</span>
                          </div>
                          <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:1}}>{v.daysLeft}d remaining · redeemable anytime</div>
                        </div>
                      </div>
                      <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>${v.principal.toFixed(0)}</div>
                      <div style={{fontSize:13,color:C.teal,fontFamily:FS}}>{v.apy}% APY</div>
                      <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${v.currentVal.toFixed(0)}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:500,color:C.teal,fontFamily:FD}}>${v.principal.toFixed(0)}</div>
                        <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginTop:1}}>guaranteed floor</div>
                      </div>
                      <div>
                        <div style={{height:3,background:C.border,borderRadius:2,overflow:"hidden",marginBottom:3,maxWidth:80}}>
                          <div style={{width:`${(1-v.daysLeft/v.daysTotal)*100}%`,height:"100%",background:C.teal,borderRadius:2}} />
                        </div>
                        <div style={{fontSize:10,color:C.textMuted,fontFamily:FS}}>earning</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.green,fontFamily:FD}}>+{v.pnlPct.toFixed(1)}%</div>
                        <div style={{fontSize:10,color:C.textMuted,fontFamily:FS}}>+${v.pnl.toFixed(0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{padding:"7px 24px",background:C.surface,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#4a5a6a"}} />
                  <span style={{fontSize:10,color:"#6b8099",fontFamily:FS,fontWeight:500,letterSpacing:"0.06em"}}>CASH</span>
                </div>
                <div
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.cardHover;setActiveId("USDC");}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";setActiveId(null);}}
                  style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1.2fr 90px 80px",padding:"13px 24px",cursor:"default",transition:`background 0.2s ${EASE}`,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:3,height:30,borderRadius:2,background:"#4a5a6a",flexShrink:0}} />
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>USDC</div>
                      <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,marginTop:1}}>Solana · available</div>
                    </div>
                  </div>
                  <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS}}>${usdcBalance.toFixed(0)}</div>
                  <div style={{fontSize:13,color:C.textMuted,fontFamily:FS}}>$1.000</div>
                  <div style={{fontSize:13,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>${usdcBalance.toFixed(0)}</div>
                  <div>
                    <div style={{fontSize:13,color:C.textSecondary,fontFamily:FD}}>${usdcBalance.toFixed(0)}</div>
                    <div style={{fontSize:10,color:C.textMuted,fontFamily:FS,marginTop:1}}>stable</div>
                  </div>
                  <div><Sparkline data={USDC_HISTORY} color="#4a5a6a" height={26} width={80} /></div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,color:C.textMuted,fontFamily:FD}}>0.0%</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// =========================================================================
// STARFIELD — subtle atmospheric background for all app pages
// =========================================================================
function StarfieldBG() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    let stars: {x:number,y:number,r:number,tw:number,speed:number}[] = [];
    let raf = 0;

    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      stars = [];
      const count = Math.floor((c.width * c.height) / 9000); // sparse
      for (let i=0;i<count;i++) {
        stars.push({
          x: Math.random()*c.width,
          y: Math.random()*c.height,
          r: Math.random()*0.9 + 0.2,
          tw: Math.random()*Math.PI*2,
          speed: Math.random()*0.0025 + 0.001,
        });
      }
    };
    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height);
      for (const s of stars) {
        const alpha = (Math.sin(s.tw)+1)/2 * 0.35 + 0.15;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(180, 210, 235, ${alpha})`;
        ctx.fill();
        s.tw += s.speed;
      }
      raf = requestAnimationFrame(draw);
    };
    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}} />;
}

// =========================================================================
// LANDING PAGE — orbital hero, ported from prototype
// =========================================================================
function LandingPage({ onEnterApp, onNav }: { onEnterApp:()=>void, onNav:(t:string)=>void }) {
  const isMobile = useMobile();
  const systemRef = useRef<HTMLDivElement>(null);
  const orbit1Ref = useRef<HTMLDivElement>(null);
  const orbit2Ref = useRef<HTMLDivElement>(null);
  const orbit3Ref = useRef<HTMLDivElement>(null);
  const pc1Ref = useRef<HTMLDivElement>(null);
  const pc2Ref = useRef<HTMLDivElement>(null);
  const pc3Ref = useRef<HTMLDivElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const chapterRefs = useRef<(HTMLElement|null)[]>([]);

  // Scroll-driven orbit rotation
  useEffect(() => {
    let raf = 0;
    let t = 0;
    const update = () => {
      t += 0.3;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const progress = y / vh;
      if (orbit1Ref.current) orbit1Ref.current.style.transform = `translate(-50%, -50%) rotate(${progress*360*0.8}deg)`;
      if (orbit2Ref.current) orbit2Ref.current.style.transform = `translate(-50%, -50%) rotate(${-progress*360*0.5}deg)`;
      if (orbit3Ref.current) orbit3Ref.current.style.transform = `translate(-50%, -50%) rotate(${progress*360*0.3}deg)`;
      if (pc1Ref.current) pc1Ref.current.style.transform = `rotate(${progress*360*1.2 + 30 + t*0.8}deg)`;
      if (pc2Ref.current) pc2Ref.current.style.transform = `rotate(${progress*360*0.7 + 120 + t*0.5}deg)`;
      if (pc3Ref.current) pc3Ref.current.style.transform = `rotate(${progress*360*0.4 + 210 + t*0.3}deg)`;

      // progress dots — which chapter is most visible
      const scrollMid = y + vh/2;
      let active = 0;
      chapterRefs.current.forEach((el, i) => {
        if (el && scrollMid >= el.offsetTop) active = i;
      });
      setActiveChapter(active);

      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scrollToChapter = (i:number) => {
    const el = chapterRefs.current[i];
    if (el) el.scrollIntoView({ behavior:"smooth" });
  };

  const chapters = [
    {id:"arrival",label:"ARRIVAL"},
    {id:"constellations",label:"CONSTELLATIONS"},
    {id:"tiers",label:"ORBITAL TIERS"},
    {id:"mechanics",label:"MECHANICS"},
    {id:"launch",label:"LAUNCH"},
  ];

  return (
    <div style={{position:"relative",overflow:"hidden",background:"transparent"}}>
      <style>{`
        @keyframes starPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes flarePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        @keyframes landingBob {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
      `}</style>

      {/* Fixed orbital system */}
      <div ref={systemRef} style={{
        position:"fixed",
        top:"50%",
        left: isMobile ? "50%" : "25%",
        transform:"translate(-50%, -50%)",
        width: isMobile ? 360 : 640,
        height: isMobile ? 360 : 640,
        zIndex:1,
        pointerEvents:"none",
        opacity: isMobile ? 0.45 : 1,
      }}>
        {/* Rings */}
        <div ref={orbit3Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(234, 88, 12, 0.22)`,
          width:isMobile?480:620,height:isMobile?480:620,
          marginTop:isMobile?-240:-310,marginLeft:isMobile?-240:-310,
        }} />
        <div ref={orbit2Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(217, 119, 6, 0.3)`,
          boxShadow:"0 0 50px rgba(217, 119, 6, 0.1)",
          width:isMobile?340:440,height:isMobile?340:440,
          marginTop:isMobile?-170:-220,marginLeft:isMobile?-170:-220,
        }} />
        <div ref={orbit1Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(13, 148, 136, 0.4)`,
          boxShadow:"0 0 40px rgba(13, 148, 136, 0.15), inset 0 0 40px rgba(13, 148, 136, 0.05)",
          width:isMobile?220:280,height:isMobile?220:280,
          marginTop:isMobile?-110:-140,marginLeft:isMobile?-110:-140,
        }} />

        {/* Planets */}
        <div ref={pc1Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${isMobile?110:140}px, 0)`,
            background:C.tealLight,boxShadow:`0 0 20px ${C.tealLight}`,
          }} />
        </div>
        <div ref={pc2Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${isMobile?170:220}px, 0)`,
            background:"#fbbf24",boxShadow:"0 0 20px #fbbf24",
          }} />
        </div>
        <div ref={pc3Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${isMobile?240:310}px, 0)`,
            background:"#fb923c",boxShadow:"0 0 20px #fb923c",
          }} />
        </div>

        {/* Central Star */}
        <div style={{position:"absolute",top:"50%",left:"50%",width:isMobile?130:160,height:isMobile?130:160,marginTop:isMobile?-65:-80,marginLeft:isMobile?-65:-80}}>
          <div style={{position:"absolute",inset:-100,borderRadius:"50%",
            background:"radial-gradient(circle, rgba(45, 212, 191, 0.4) 0%, rgba(13, 148, 136, 0.2) 30%, transparent 70%)",
            animation:"starPulse 4s ease-in-out infinite",
          }} />
          <div style={{position:"absolute",inset:-40,borderRadius:"50%",
            background:"radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, rgba(45, 212, 191, 0.4) 20%, rgba(13, 148, 136, 0.2) 50%, transparent 75%)",
            filter:"blur(10px)",
            animation:"starPulse 3s ease-in-out infinite 0.5s",
          }} />
          <div style={{position:"absolute",inset:0,borderRadius:"50%",
            background:"radial-gradient(circle at 40% 40%, #ffffff 0%, #a5f3fc 15%, #2dd4bf 35%, #0d9488 60%, #0a3a3a 100%)",
            boxShadow:"inset -15px -15px 30px rgba(0, 0, 0, 0.4), inset 10px 10px 25px rgba(255, 255, 255, 0.2), 0 0 60px rgba(45, 212, 191, 0.5)",
          }} />
          <div style={{position:"absolute",top:"50%",left:"50%",width:3,height:isMobile?220:280,marginTop:isMobile?-110:-140,marginLeft:-1.5,
            background:"linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)",
            filter:"blur(1px)",animation:"flarePulse 3s ease-in-out infinite",
          }} />
          <div style={{position:"absolute",top:"50%",left:"50%",width:isMobile?220:280,height:3,marginTop:-1.5,marginLeft:isMobile?-110:-140,
            background:"linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)",
            filter:"blur(1px)",animation:"flarePulse 3s ease-in-out infinite 0.8s",
          }} />
        </div>
      </div>

      {/* Progress dots (desktop) */}
      {!isMobile && (
        <div style={{position:"fixed",right:36,top:"50%",transform:"translateY(-50%)",zIndex:50,display:"flex",flexDirection:"column",gap:18}}>
          {chapters.map((ch, i) => (
            <div key={ch.id} onClick={()=>scrollToChapter(i)} style={{
              position:"relative",width:10,height:10,borderRadius:"50%",
              border:`1px solid ${activeChapter===i?C.tealLight:C.textMuted}`,
              background:activeChapter===i?C.tealLight:"transparent",
              boxShadow:activeChapter===i?`0 0 14px ${C.tealLight}`:"none",
              transform:activeChapter===i?"scale(1.15)":"scale(1)",
              transition:`all 0.3s ${EASE}`,cursor:"pointer",
            }}>
              <span style={{
                position:"absolute",right:22,top:"50%",transform:"translateY(-50%)",
                fontFamily:FM,fontSize:10,letterSpacing:"0.1em",
                color:activeChapter===i?C.tealLight:C.textMuted,
                whiteSpace:"nowrap",opacity:activeChapter===i?1:0,
                transition:"opacity 0.3s",pointerEvents:"none",
              }}>{ch.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content sections */}
      <main style={{position:"relative",zIndex:10,pointerEvents:"none"}}>

        {/* SECTION 1 — Arrival */}
        <section ref={el=>{chapterRefs.current[0]=el;}} style={{minHeight:"100vh",padding:isMobile?"120px 24px 80px":"140px 64px 80px",display:"flex",alignItems:"center",position:"relative",pointerEvents:"auto"}}>
          {isMobile && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(5, 8, 12, 0.75) 60%, rgba(5, 8, 12, 0.95) 100%)",pointerEvents:"none",zIndex:2}} />}
          <div style={{marginLeft:isMobile?0:"50%",maxWidth:580,position:"relative",zIndex:5}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:10,fontFamily:FM,fontSize:isMobile?10:11,fontWeight:500,color:C.tealLight,letterSpacing:"0.2em",marginBottom:32,padding:"6px 12px",border:"1px solid rgba(45, 212, 191, 0.3)",borderRadius:100,background:"rgba(45, 212, 191, 0.05)"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:C.tealLight,boxShadow:`0 0 10px ${C.tealLight}`,animation:"starPulse 2s ease-in-out infinite"}} />
              LIVE ON SOLANA
            </div>
            <h1 style={{fontFamily:FD,fontSize:isMobile?"clamp(44px, 10vw, 60px)":"clamp(56px, 7vw, 92px)",fontWeight:200,lineHeight:1.02,letterSpacing:"-0.035em",marginBottom:32,color:C.textPrimary}}>
              Prediction markets, <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>structured</span>.
            </h1>
            <p style={{fontSize:isMobile?16:18,lineHeight:1.65,color:C.textSecondary,fontWeight:300,maxWidth:480,fontFamily:FS}}>
              One deposit. Ten curated positions. A single token that tracks the whole constellation — and pays out when markets settle.
            </p>
          </div>
          {!isMobile && (
            <div style={{position:"absolute",bottom:40,left:"50%",transform:"translateX(-50%)",fontFamily:FM,fontSize:10,letterSpacing:"0.22em",color:C.textMuted,display:"flex",flexDirection:"column",alignItems:"center",gap:10,animation:"landingBob 2s ease-in-out infinite"}}>
              <span>SCROLL</span>
              <div style={{width:1,height:30,background:`linear-gradient(to bottom, ${C.textMuted}, transparent)`}} />
            </div>
          )}
        </section>

        {/* SECTION 2 — Constellations */}
        <section ref={el=>{chapterRefs.current[1]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 64px",display:"flex",alignItems:"center",position:"relative",pointerEvents:"auto"}}>
          {isMobile && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(5, 8, 12, 0.75) 60%, rgba(5, 8, 12, 0.95) 100%)",pointerEvents:"none",zIndex:2}} />}
          <div style={{marginLeft:isMobile?0:"50%",maxWidth:580,position:"relative",zIndex:5}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 01 · Constellations
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 58px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Not a single bet. A <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>constellation</span> of them.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS}}>
              Betting on one prediction market is a coin flip. A Senthos Constellation bundles 10 or more high-liquidity positions into a single basket token — spreading exposure across uncorrelated outcomes.
            </p>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS}}>
              You don't pick the positions. Our structurers do. You pick the risk profile — and buy the whole sky at once.
            </p>
            <div style={{marginTop:40,padding:isMobile?18:24,background:"rgba(15, 21, 32, 0.5)",border:"1px solid rgba(45, 212, 191, 0.1)",borderRadius:14,backdropFilter:"blur(12px)"}}>
              <div style={{fontFamily:FM,fontSize:10,letterSpacing:"0.18em",color:C.textMuted,marginBottom:14}}>EXAMPLE · STHS-90-0515</div>
              <div style={{fontFamily:FM,fontSize:isMobile?13:15,fontWeight:500,color:C.tealLight,marginBottom:14}}>10 positions · Conservative tier · Resolves May 15</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  ["Fed holds rates in June","91%"],
                  ["US avoids recession 2025","88%"],
                  ["BTC above $80k by May","92%"],
                  ["NVIDIA beats Q1 earnings","87%"],
                  ["Gold above $2,400/oz","90%"],
                ].map(([l,p],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:isMobile?12:13,color:C.textSecondary,padding:"6px 0",borderBottom:i<4?"0.5px solid rgba(255, 255, 255, 0.04)":"none",fontFamily:FS}}>
                    <span>{l}</span>
                    <span style={{fontFamily:FM,color:C.tealLight,fontSize:isMobile?11:12,marginLeft:"auto",letterSpacing:"0.04em"}}>{p}</span>
                  </div>
                ))}
                <div style={{fontSize:isMobile?12:13,color:C.textMuted,opacity:0.6,padding:"6px 0",fontFamily:FS}}>+ 5 more positions</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 — Tiers */}
        <section ref={el=>{chapterRefs.current[2]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 64px",display:"flex",alignItems:"center",position:"relative",pointerEvents:"auto"}}>
          {isMobile && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(5, 8, 12, 0.75) 60%, rgba(5, 8, 12, 0.95) 100%)",pointerEvents:"none",zIndex:2}} />}
          <div style={{marginLeft:isMobile?0:"50%",maxWidth:580,position:"relative",zIndex:5}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 02 · Risk tiers
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 58px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Three orbits. Three <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>risk profiles</span>.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS}}>
              Each constellation lives on one of three rings — defined by its weighted probability. Closer to the star means safer; further means bigger payout.
            </p>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:14,marginTop:40}}>
              {[
                {tier:90,label:"Conservative",sub:"STHS-90",desc:"High-probability basket. Issue price around $0.90. Built for capital preservation with small upside.",color:C.tealLight},
                {tier:70,label:"Balanced",sub:"STHS-70",desc:"Medium conviction. Issue price around $0.70. Meaningful payout with manageable downside.",color:"#fbbf24"},
                {tier:50,label:"High conviction",sub:"STHS-50",desc:"Near even-odds. Issue price around $0.50. Maximum payout potential for directional views.",color:"#fb923c"},
              ].map(t=>(
                <div key={t.tier} style={{padding:isMobile?"18px 20px":"22px 24px",background:"rgba(15, 21, 32, 0.55)",border:"1px solid rgba(45, 212, 191, 0.08)",borderRadius:16,backdropFilter:"blur(10px)",position:"relative",overflow:"hidden",transition:`all 0.3s ${EASE}`}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateX(6px)";(e.currentTarget as HTMLElement).style.borderColor="rgba(45, 212, 191, 0.2)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateX(0)";(e.currentTarget as HTMLElement).style.borderColor="rgba(45, 212, 191, 0.08)";}}
                >
                  <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:t.color,opacity:0.7}} />
                  <div style={{display:"flex",alignItems:"baseline",gap:14,marginBottom:8}}>
                    <div style={{fontFamily:FD,fontSize:isMobile?30:38,fontWeight:300,color:t.color,letterSpacing:"-0.035em",lineHeight:1}}>{t.tier}%</div>
                    <div style={{fontSize:isMobile?13:15,color:C.textPrimary,fontWeight:500,letterSpacing:"-0.005em",fontFamily:FD}}>{t.label}</div>
                    <div style={{marginLeft:"auto",fontFamily:FM,fontSize:isMobile?10:11,color:C.textMuted,letterSpacing:"0.08em"}}>{t.sub}</div>
                  </div>
                  <p style={{fontSize:isMobile?12:13,color:C.textSecondary,lineHeight:1.55,fontFamily:FS}}>{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4 — Mechanics */}
        <section ref={el=>{chapterRefs.current[3]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 64px",display:"flex",alignItems:"center",position:"relative",pointerEvents:"auto"}}>
          {isMobile && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(5, 8, 12, 0.75) 60%, rgba(5, 8, 12, 0.95) 100%)",pointerEvents:"none",zIndex:2}} />}
          <div style={{marginLeft:isMobile?0:"50%",maxWidth:580,position:"relative",zIndex:5}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 03 · Mechanics
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 58px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Deposit. Hold. <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Collect</span>.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS}}>
              No claiming, no manual steps, no unwinding trades. The token is the position — and it auto-resolves.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?22:28,marginTop:40}}>
              {[
                ["01","Pick a tier, deposit USDC","Choose your risk level. Your deposit buys the underlying prediction market positions at issuance. A 0.5% structuring fee is taken once."],
                ["02","Receive an STHS token","One token lands in your wallet. It tracks the live net asset value of the constellation. You can sell it on Jupiter at any time — or hold through resolution."],
                ["03","Collect when markets settle","When the last position resolves, USDC is sent directly to every holder's wallet. Tokens burn. Nothing to claim."],
              ].map(([n,t,d],i)=>(
                <div key={n} style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:isMobile?18:28,alignItems:"flex-start"}}>
                  <div style={{width:isMobile?40:48,height:isMobile?40:48,borderRadius:"50%",border:"1px solid rgba(45, 212, 191, 0.3)",background:"rgba(45, 212, 191, 0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FM,fontSize:isMobile?12:13,color:C.tealLight,fontWeight:500,flexShrink:0,position:"relative"}}>
                    {n}
                    {i<2 && <div style={{position:"absolute",top:"100%",left:"50%",width:1,height:isMobile?30:40,background:`linear-gradient(to bottom, rgba(45, 212, 191, 0.3), transparent)`}} />}
                  </div>
                  <div>
                    <h3 style={{fontSize:isMobile?16:19,fontWeight:500,marginBottom:8,letterSpacing:"-0.01em",color:C.textPrimary,fontFamily:FD}}>{t}</h3>
                    <p style={{fontSize:isMobile?13:14,color:C.textSecondary,lineHeight:1.65,maxWidth:440,fontFamily:FS}}>{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 5 — Launch */}
        <section ref={el=>{chapterRefs.current[4]=el;}} style={{minHeight:"100vh",padding:isMobile?"80px 24px":"140px 40px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          {isMobile && <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%, transparent 0%, rgba(5, 8, 12, 0.75) 60%, rgba(5, 8, 12, 0.95) 100%)",pointerEvents:"none",zIndex:2}} />}
          <div style={{margin:"0 auto",maxWidth:720,textAlign:"center",position:"relative",zIndex:5}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Final approach
              <span style={{width:28,height:1,background:"currentColor"}} />
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(36px, 9vw, 52px)":"clamp(48px, 6vw, 80px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary,textAlign:"center"}}>
              Your orbit starts <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>here</span>.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:40,maxWidth:520,margin:"0 auto 40px",textAlign:"center",fontFamily:FS}}>
              Five constellations live today. Three risk tiers. One token per basket.
            </p>
            <button onClick={onEnterApp} style={{
              display:"inline-flex",alignItems:"center",gap:8,
              padding:isMobile?"14px 26px":"16px 32px",borderRadius:100,
              fontSize:isMobile?14:15,fontWeight:600,
              background:`linear-gradient(135deg, ${C.teal} 0%, ${C.tealLight} 100%)`,
              color:"#000",border:"none",cursor:"pointer",
              letterSpacing:"0.01em",fontFamily:FD,
              transition:`all 0.3s ${EASE}`,position:"relative",overflow:"hidden",
              boxShadow:`0 0 0 1px rgba(45, 212, 191, 0.3), 0 8px 30px rgba(45, 212, 191, 0.3)`,
            }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(45, 212, 191, 0.5), 0 14px 40px rgba(45, 212, 191, 0.5)`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(45, 212, 191, 0.3), 0 8px 30px rgba(45, 212, 191, 0.3)`;}}
            >
              Explore Markets →
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer style={{padding:isMobile?"24px 20px":"40px 64px",borderTop:"0.5px solid rgba(45, 212, 191, 0.08)",display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:"center",fontFamily:FM,fontSize:isMobile?10:11,color:C.textMuted,letterSpacing:"0.08em",gap:10,position:"relative",zIndex:10,background:"rgba(5, 8, 12, 0.7)",backdropFilter:"blur(12px)",pointerEvents:"auto"}}>
          <div>SENTHOS © 2025 · STRUCTURED PREDICTIONS</div>
          <div>SOLANA · v0.1.0</div>
        </footer>

      </main>
    </div>
  );
}

type TabId="home"|"markets"|"constellations"|"portfolio"|"detail";

export default function App() {
  const [tab,setTab]=useState<TabId>("home");
  const [selectedBundle,setSelectedBundle]=useState<Bundle|null>(null);
  const [fromTab,setFromTab]=useState("markets");
  const [walletConnected,setWalletConnected]=useState(false);
  const [showWalletModal,setShowWalletModal]=useState(false);

  // DEMO MODE — now DEFAULT ON, clean $10k slate
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [demoMode, setDemoMode] = useState(true);
  const [demoUsdc, setDemoUsdc] = useState(DEMO_STARTING_USDC);
  const [demoPortfolio, setDemoPortfolio] = useState<Position[]>([]);
  const [demoVaults, setDemoVaults] = useState<VaultPos[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const activePortfolio = demoMode ? demoPortfolio : STATIC_PORTFOLIO;
  const activeVaults = demoMode ? demoVaults : STATIC_VAULT_POSITIONS;
  const activeUsdc = demoMode ? demoUsdc : STATIC_USDC_BALANCE;

  const handleSelect=(bundle:Bundle,from:string)=>{setSelectedBundle(bundle);setFromTab(from);setTab("detail");};
  const handleBack=()=>setTab(fromTab as TabId);

  const handleDemoDeposit = (bundleId:string, usdcAmount:number) => {
    const bundle = BUNDLES.find(b=>b.id===bundleId); if (!bundle) return;
    const tokensReceived = (usdcAmount * 0.995) / bundle.nav;
    setDemoUsdc(prev => Math.max(0, prev - usdcAmount));
    setDemoPortfolio(prev => {
      const existing = prev.find(p=>p.id===bundleId);
      if (existing) {
        const newQty = existing.qty + tokensReceived;
        const newAvgCost = ((existing.qty * existing.avgCost) + (tokensReceived * bundle.nav)) / newQty;
        return prev.map(p => p.id===bundleId ? {id:bundleId, qty:newQty, avgCost:newAvgCost} : p);
      }
      return [...prev, {id:bundleId, qty:tokensReceived, avgCost:bundle.nav}];
    });
  };

  const handleDemoPpnDeposit = (bundleId:string, usdcAmount:number) => {
    const bundle = BUNDLES.find(b=>b.id===bundleId); if (!bundle) return;
    const vaultAmount = usdcAmount * 0.93;
    const basketAmount = usdcAmount * 0.07;
    const tokensReceived = (basketAmount * 0.995) / bundle.nav;

    setDemoUsdc(prev => Math.max(0, prev - usdcAmount));
    setDemoPortfolio(prev => {
      const existing = prev.find(p=>p.id===bundleId);
      if (existing) {
        const newQty = existing.qty + tokensReceived;
        const newAvgCost = ((existing.qty * existing.avgCost) + (tokensReceived * bundle.nav)) / newQty;
        return prev.map(p => p.id===bundleId ? {id:bundleId, qty:newQty, avgCost:newAvgCost} : p);
      }
      return [...prev, {id:bundleId, qty:tokensReceived, avgCost:bundle.nav}];
    });
    setDemoVaults(prev => {
      const vaultId = `VAULT-${bundleId.split("-")[2]}`;
      const existing = prev.find(v=>v.id===vaultId);
      if (existing) {
        return prev.map(v => v.id===vaultId ? {...v, principal: v.principal + vaultAmount} : v);
      }
      return [...prev, {
        id: vaultId,
        label: "Meteora vault",
        principal: vaultAmount,
        yieldEarned: 0,
        apy: 8.4,
        daysLeft: bundle.daysLeft,
        daysTotal: bundle.daysLeft + 30,
        resolveDate: bundle.date,
      }];
    });
  };

  const handleResetDemo = () => {
    setDemoUsdc(DEMO_STARTING_USDC);
    setDemoPortfolio([]);
    setDemoVaults([]);
    setShowResetConfirm(false);
  };

  return (
    <MobileCtx.Provider value={isMobile}>
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:${C.bg};}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=range]{accent-color:${C.teal};}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(45, 212, 191, 0.15);border-radius:2px;}
        ::-webkit-scrollbar-thumb:hover{background:rgba(45, 212, 191, 0.3);}
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes ctaShine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Persistent subtle starfield — atmospheric reminder users are "in space" */}
      <StarfieldBG />

      {/* Top Nav — sticky, blurred, all-screens */}
      <nav style={{
        position:"fixed",top:0,left:0,right:0,zIndex:100,
        padding: isMobile ? "14px 18px" : "16px 28px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
        background:"rgba(5, 8, 12, 0.65)",
        borderBottom:`0.5px solid ${C.border}`,
      }}>
        {/* Logo — clickable, returns home */}
        <div onClick={()=>{setTab("home");if(isMobile)setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <img src="/senthos_full.png" alt="Senthos" style={{width:isMobile?26:30,height:isMobile?26:30,display:"block",flexShrink:0}} />
          <div style={{fontSize:isMobile?13:15,fontWeight:700,color:C.textPrimary,fontFamily:FD,letterSpacing:"0.12em"}}>SENTHOS</div>
        </div>

        {/* Center: tab pills (desktop only) */}
        {!isMobile && (
          <ul style={{display:"flex",gap:4,listStyle:"none",margin:0,padding:0}}>
            {[
              {id:"home",label:"Home"},
              {id:"markets",label:"Markets"},
              {id:"constellations",label:"Constellations"},
              {id:"portfolio",label:"Portfolio"},
            ].map(n=>{
              const isActive = tab===n.id || (tab==="detail" && fromTab===n.id);
              return (
                <li key={n.id}>
                  <button onClick={()=>setTab(n.id as TabId)} style={{
                    background: isActive ? "rgba(45, 212, 191, 0.1)" : "transparent",
                    color: isActive ? C.tealLight : C.textSecondary,
                    border:"none",padding:"8px 16px",borderRadius:100,
                    fontSize:13,fontWeight:500,fontFamily:FD,letterSpacing:"0.01em",
                    cursor:"pointer",transition:`all 0.3s ${EASE}`,
                  }}
                    onMouseEnter={e=>{if(!isActive){(e.currentTarget as HTMLElement).style.color=C.textPrimary;(e.currentTarget as HTMLElement).style.background="rgba(45, 212, 191, 0.06)";}}}
                    onMouseLeave={e=>{if(!isActive){(e.currentTarget as HTMLElement).style.color=C.textSecondary;(e.currentTarget as HTMLElement).style.background="transparent";}}}
                  >{n.label}</button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Right: demo pill + wallet */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {!isMobile && demoMode && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:100,background:"rgba(45, 212, 191, 0.08)",border:`0.5px solid rgba(45, 212, 191, 0.25)`}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:C.tealLight,boxShadow:`0 0 8px ${C.tealLight}`}} />
              <span style={{fontSize:11,color:C.tealLight,fontFamily:FM,letterSpacing:"0.08em",fontWeight:500}}>DEMO</span>
              <span style={{fontSize:11,color:C.textSecondary,fontFamily:FM}}>${demoUsdc.toFixed(0)}</span>
              <button onClick={()=>setShowResetConfirm(true)} style={{background:"none",border:"none",color:C.textMuted,fontSize:10,fontFamily:FM,cursor:"pointer",letterSpacing:"0.08em",padding:0,marginLeft:2}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color=C.textSecondary}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color=C.textMuted}
              >↻</button>
            </div>
          )}
          {walletConnected ? (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:100,background:C.tealBg,border:`0.5px solid ${C.teal}44`}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.green}} />
              <span style={{fontSize:12,color:C.textPrimary,fontFamily:FM}}>7xK9...mR4p</span>
            </div>
          ) : (
            <button onClick={()=>setShowWalletModal(true)} style={{
              display:"inline-flex",alignItems:"center",gap:6,
              fontSize:isMobile?12:13,fontWeight:600,
              padding: isMobile?"8px 14px":"10px 18px",
              borderRadius:100,
              background:`linear-gradient(135deg, ${C.teal} 0%, ${C.tealLight} 100%)`,
              color:"#000",border:"none",cursor:"pointer",
              letterSpacing:"0.01em",fontFamily:FD,
              transition:`all 0.3s ${EASE}`,position:"relative",overflow:"hidden",
              boxShadow:`0 0 0 1px rgba(45, 212, 191, 0.3), 0 4px 20px rgba(45, 212, 191, 0.2)`,
            }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-1px)";(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(45, 212, 191, 0.5), 0 8px 30px rgba(45, 212, 191, 0.4)`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow=`0 0 0 1px rgba(45, 212, 191, 0.3), 0 4px 20px rgba(45, 212, 191, 0.2)`;}}
            >
              {isMobile ? "Connect" : "Connect wallet"}
            </button>
          )}
          {isMobile && (
            <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{
              background:"none",border:`0.5px solid ${C.border}`,borderRadius:8,
              padding:"8px 10px",cursor:"pointer",color:C.textSecondary,
              fontSize:16,lineHeight:1,
            }}>{sidebarOpen?"✕":"☰"}</button>
          )}
        </div>
      </nav>

      {/* Mobile tab sheet */}
      {isMobile && sidebarOpen && (
        <>
          <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:90,backdropFilter:"blur(2px)"}} />
          <div style={{
            position:"fixed",top:58,right:12,left:12,zIndex:95,
            background:"rgba(13, 19, 28, 0.95)",backdropFilter:"blur(16px)",
            border:`0.5px solid ${C.border}`,borderRadius:14,
            padding:"10px 8px",
            animation:`slideDown 0.25s ${EASE}`,
            boxShadow:"0 20px 60px rgba(0,0,0,0.5)",
          }}>
            {[
              {id:"home",label:"Home"},
              {id:"markets",label:"Markets"},
              {id:"constellations",label:"Constellations"},
              {id:"portfolio",label:"Portfolio"},
            ].map(n=>{
              const isActive = tab===n.id || (tab==="detail" && fromTab===n.id);
              return (
                <button key={n.id} onClick={()=>{setTab(n.id as TabId);setSidebarOpen(false);}} style={{
                  display:"block",width:"100%",textAlign:"left",
                  padding:"12px 14px",borderRadius:10,border:"none",background:isActive?"rgba(45,212,191,0.08)":"transparent",
                  color:isActive?C.tealLight:C.textPrimary,
                  fontSize:14,fontWeight:isActive?600:400,fontFamily:FD,letterSpacing:"0.01em",
                  cursor:"pointer",marginBottom:2,
                }}>{n.label}</button>
              );
            })}
            {demoMode && (
              <div style={{borderTop:`0.5px solid ${C.border}`,marginTop:8,paddingTop:10,padding:"10px 14px 4px"}}>
                <div style={{fontSize:10,color:C.textMuted,fontFamily:FM,letterSpacing:"0.08em",marginBottom:6}}>DEMO BALANCE</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:14,color:C.tealLight,fontFamily:FM,fontWeight:500}}>${demoUsdc.toFixed(0)} USDC</span>
                  <button onClick={()=>{setShowResetConfirm(true);setSidebarOpen(false);}} style={{background:"none",border:`0.5px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.textMuted,fontSize:10,fontFamily:FM,letterSpacing:"0.08em",cursor:"pointer"}}>RESET</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Main content — full width, top padding for nav */}
      <div style={{
        position:"relative",zIndex:1,
        minHeight:"100vh",
        paddingTop: tab==="home" ? 0 : (isMobile ? 70 : 78),
      }}>
        {tab==="home" && <LandingPage onEnterApp={()=>setTab("markets")} onNav={(t)=>setTab(t as TabId)} />}
        {tab!=="home" && (
          <div style={{maxWidth:1400,margin:"0 auto",padding: isMobile ? "8px 16px 24px" : "16px 36px 32px"}}>
            {tab==="markets"&&<MarketsPage onSelect={handleSelect} />}
            {tab==="constellations"&&<ConstellationsPage onSelect={handleSelect} />}
            {tab==="detail"&&selectedBundle&&<DetailPage bundle={selectedBundle} fromTab={fromTab} onBack={handleBack} demoMode={demoMode} demoUsdc={demoUsdc} onDemoDeposit={handleDemoDeposit} onDemoPpnDeposit={handleDemoPpnDeposit} />}
            {tab==="portfolio"&&<PortfolioPage onSelect={handleSelect} portfolio={activePortfolio} vaultPositions={activeVaults} usdcBalance={activeUsdc} demoMode={demoMode} />}
          </div>
        )}
      </div>

      {showWalletModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setShowWalletModal(false)}>
          <div style={{background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:20,width:360,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 24px",borderBottom:`0.5px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:15,fontWeight:600,color:C.textPrimary,fontFamily:FD}}>Connect wallet</span>
              <button onClick={()=>setShowWalletModal(false)} style={{background:"none",border:"none",color:C.textSecondary,cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:12}}>
              {[
                {name:"Phantom",sub:"Detected",color:"#4c44c6",initials:"Ph",available:true,url:""},
                {name:"Backpack",sub:"Install",color:"#e33d3d",initials:"Ba",available:false,url:"https://backpack.app/"},
                {name:"Solflare",sub:"Install",color:"#fc7227",initials:"Sf",available:false,url:"https://solflare.com/"},
              ].map(w=>(
                <a key={w.name} href={!w.available?w.url:undefined} target={!w.available?"_blank":undefined} rel="noreferrer" onClick={(e)=>{
                    if(w.available){e.preventDefault();setWalletConnected(true);setShowWalletModal(false);}
                  }}
                  style={{textDecoration:"none",display:"flex",alignItems:"center",gap:14,padding:"13px 12px",borderRadius:10,cursor:"pointer",marginBottom:4,background:w.available?"#1a2a3a":"transparent",transition:`background 0.2s ${EASE}`,opacity:w.available?1:0.45}}
                  onMouseEnter={e=>{if(!w.available)(e.currentTarget as HTMLElement).style.opacity="0.75";}}
                  onMouseLeave={e=>{if(!w.available)(e.currentTarget as HTMLElement).style.opacity="0.45";}}>
                  <div style={{width:38,height:38,borderRadius:10,background:w.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{w.initials}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,color:C.textPrimary,fontFamily:FS}}>{w.name}</div>
                    <div style={{fontSize:11,color:C.textSecondary,fontFamily:FS,marginTop:2}}>{w.sub}{!w.available && " ↗"}</div>
                  </div>
                  {w.available&&<div style={{width:8,height:8,borderRadius:"50%",background:C.green}} />}
                </a>
              ))}
            </div>
            <div style={{padding:"12px 24px",borderTop:`0.5px solid ${C.border}`}}>
              <div style={{fontSize:11,color:C.textMuted,fontFamily:FS,textAlign:"center"}}>By connecting you agree to Senthos terms of use</div>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setShowResetConfirm(false)}>
          <div style={{background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:20,width:340,padding:"24px 24px 20px"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:600,color:C.textPrimary,fontFamily:FD,marginBottom:8}}>Reset demo state?</div>
            <div style={{fontSize:13,color:C.textSecondary,fontFamily:FS,lineHeight:1.5,marginBottom:18}}>All demo positions and vault deposits will be cleared. Your USDC balance returns to $10,000.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowResetConfirm(false)} style={{flex:1,padding:"10px 0",borderRadius:8,border:`0.5px solid ${C.border}`,background:"transparent",color:C.textSecondary,fontSize:13,fontFamily:FS,cursor:"pointer"}}>Cancel</button>
              <button onClick={handleResetDemo} style={{flex:1,padding:"10px 0",borderRadius:8,border:"none",background:C.teal,color:"#000",fontSize:13,fontFamily:FS,fontWeight:600,cursor:"pointer"}}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </>
    </MobileCtx.Provider>
  );
}