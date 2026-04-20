"use client";
import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import Link from "next/link";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
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
      const count = Math.floor((c.width * c.height) / 9000);
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
// LANDING PAGE - CENTERED orbital hero
// =========================================================================
// FlybyCanvas - distant planets + occasional comet streaks drifting past camera.
// Pure canvas for perf. Objects depth-sorted, spawn behind camera (z large),
// accelerate toward camera (z → 0), culled when offscreen.
function FlybyCanvas({ scrollProgress }: { scrollProgress: { current: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    let w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Object pools
    type Planet = { x:number; y:number; z:number; vx:number; vy:number; vz:number; r:number; color:string; ring:boolean; rot:number; };
    type Comet = { x:number; y:number; vx:number; vy:number; life:number; maxLife:number; color:string; };

    const planets: Planet[] = [];
    const comets: Comet[] = [];

    const MAX_PLANETS = 1;

    const rand = (a:number, b:number) => a + Math.random()*(b-a);

    const spawnPlanet = () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const colors = ["#2dd4bf", "#fbbf24", "#fb923c", "#a78bfa", "#60a5fa", "#f472b6"];
      planets.push({
        x: side * rand(400, 700), y: rand(-300, 300),
        z: rand(1800, 2400),
        vx: -side * rand(0.3, 0.55), vy: rand(-0.08, 0.08),
        vz: rand(-1.4, -0.8),
        r: rand(40, 90),
        color: colors[Math.floor(Math.random()*colors.length)],
        ring: Math.random() < 0.5,
        rot: rand(0, Math.PI),
      });
    };
    const spawnComet = () => {
      // Fast diagonal streak across viewport
      const fromLeft = Math.random() < 0.5;
      const y0 = rand(0, h);
      const speed = rand(8, 12); // slower, more graceful streaks
      const angle = rand(-0.3, 0.3) + (fromLeft ? 0 : Math.PI);
      const tealComet = Math.random() < 0.6;
      comets.push({
        x: fromLeft ? -50 : w+50, y: y0,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed + rand(-1,1),
        life: 0, maxLife: rand(70, 120),
        color: tealComet ? "#2dd4bf" : "#fb923c",
      });
    };

    let raf = 0;
    let frame = 0;
    const render = () => {
      frame++;
      const cx = w/2, cy = h/2;
      const FOCAL = 500;

      ctx.clearRect(0, 0, w, h);

      // scroll-driven camera roll (very subtle)
      const prog = scrollProgress.current;
      const rollRad = Math.sin(prog * Math.PI * 2) * 0.02;

      // Spawn planets very rarely
      if (planets.length < MAX_PLANETS && Math.random() < 0.0008) spawnPlanet();
      // Spawn comets rarely, max 2 on screen at once
      if (comets.length < 2 && Math.random() < 0.003) spawnComet();

      // Depth-sorted render array
      // Planet-only drawables (depth sorted)
      const drawables: Planet[] = [];

      // Update planets
      for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i];
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        p.rot += 0.003;
        if (p.z < 100 || Math.abs(p.x) > 2000) {
          planets.splice(i, 1);
          continue;
        }
        drawables.push(p);
      }
      // Sort far-to-near
      drawables.sort((A,B) => B.z - A.z);

      // Apply camera roll by rotating whole ctx for space objects
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rollRad);

      for (const p of drawables) {
        {
          const scale = FOCAL / (FOCAL + p.z);
          const sx = p.x * scale;
          const sy = p.y * scale;
          const sr = p.r * scale;
          if (sr < 0.5) continue;

          // Atmospheric glow
          const glow = ctx.createRadialGradient(sx, sy, sr*0.7, sx, sy, sr*2.2);
          glow.addColorStop(0, p.color + "80");
          glow.addColorStop(1, p.color + "00");
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, sr*2.2, 0, Math.PI*2); ctx.fill();

          // Planet body with shadow
          const bodyGrad = ctx.createRadialGradient(sx - sr*0.3, sy - sr*0.3, sr*0.1, sx, sy, sr);
          bodyGrad.addColorStop(0, "#ffffff");
          bodyGrad.addColorStop(0.15, p.color);
          bodyGrad.addColorStop(1, "#06101a");
          ctx.fillStyle = bodyGrad;
          ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();

          // Rings
          if (p.ring) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(p.rot);
            ctx.scale(1, 0.25);
            ctx.strokeStyle = p.color + "cc";
            ctx.lineWidth = Math.max(1, sr*0.08);
            ctx.beginPath(); ctx.arc(0, 0, sr*1.6, 0, Math.PI*2); ctx.stroke();
            ctx.strokeStyle = p.color + "66";
            ctx.lineWidth = Math.max(0.5, sr*0.04);
            ctx.beginPath(); ctx.arc(0, 0, sr*1.9, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
          }
        }
      }
      ctx.restore();

      // Comets (screen-space, above everything)
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.x += c.vx; c.y += c.vy; c.life++;
        if (c.life > c.maxLife || c.x < -200 || c.x > w+200) {
          comets.splice(i, 1);
          continue;
        }
        const alpha = 1 - c.life/c.maxLife;
        // Long streak tail
        const tailLen = 180;
        const tx = c.x - c.vx * 8;
        const ty = c.y - c.vy * 8;
        const trail = ctx.createLinearGradient(tx, ty, c.x, c.y);
        trail.addColorStop(0, c.color + "00");
        trail.addColorStop(0.6, c.color + "80");
        trail.addColorStop(1, "#ffffff" + (alpha > 0.5 ? "ff" : Math.floor(alpha*2*255).toString(16).padStart(2,"0")));
        ctx.strokeStyle = trail;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(c.x - c.vx*tailLen/10, c.y - c.vy*tailLen/10);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        // Bright head
        const headGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 8);
        headGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
        headGrad.addColorStop(0.4, c.color);
        headGrad.addColorStop(1, c.color + "00");
        ctx.fillStyle = headGrad;
        ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, Math.PI*2); ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} style={{position:"fixed",inset:0,width:"100vw",height:"100vh",zIndex:4,pointerEvents:"none"}} />;
}

// Camera orbit - ISS-style pass around the star.
// Physics: we're on a circular orbit, camera always pointing at the star.
// Scroll drives orbital angle. Star enters from upper-right, arcs across,
// exits past the left edge by the end. Ring plane rotates in 3D as we pass.
function cameraPath(progress: number) {
  // Normalize progress 0..1 across the full scroll
  const p = Math.max(0, Math.min(4, progress));
  const t = p / 4;

  // Smoother ease - quadratic so motion starts gentle and accelerates slightly mid-pass
  const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;

  // ORBITAL ANGLE - spans a full 200deg arc so we genuinely pass around.
  // +80deg: star far ahead upper-right (we're approaching)
  // 0deg: star directly to our side (closest approach, beside us)
  // -120deg: we've passed it, star is behind-left and drifting off-screen
  const thetaDeg = 80 - ease * 200;
  const theta = thetaDeg * Math.PI / 180;

  // Apparent star position in viewport.
  // Wider horizontal sweep (0.75 vw range) so star truly exits past the edge.
  // sin(80deg) = 0.98 - star starts near right edge.
  // sin(-120deg) = -0.87 - star ends past left edge.
  const x = Math.sin(theta) * 0.75;
  // Vertical: star rides slightly higher at closest approach (peak of our arc)
  const y = -Math.cos(theta) * 0.12 - 0.04;

  // Proximity-based scale. Closest at theta=0.
  // Use cos(theta) folded: bigger in the middle of pass, smaller at entry/exit.
  const proximity = Math.max(-0.5, Math.cos(theta));
  const scale = 0.6 + (proximity + 0.5) * 0.5; // 0.6 (entry/exit) -> 1.35 (closest)

  // Camera banking - we tilt slightly into the turn.
  const rotZ = -Math.sin(theta) * 4;

  // Ring plane rotation (the big one for selling "orbit").
  // As we arc past, the ring plane appears to rotate around the star.
  // When star is ahead-right (+theta): rings viewed from one side, normal rotation.
  // When we pass closest: rings compress edge-on.
  // When star is behind-left (-theta): rings appear rotated the other way.
  // Simulated via scaleY (vertical compression) + rotate (plane tilt).
  const ringScaleY = 0.2 + Math.abs(Math.sin(theta * 0.8)) * 0.75;
  // Additional plane rotation driven by viewing angle - fakes perspective
  const ringPerspective = Math.cos(theta) * 12; // up to ±12deg additional tilt

  // Opacity: star stays vivid through most of the arc.
  // Only starts fading in the final 15% as it moves off-screen.
  const opacity = t < 0.85 ? 1 : Math.max(0.35, 1 - (t - 0.85) * 4);

  return {
    x,
    y,
    scale,
    rotZ,
    blur: 0,
    opacity,
    ringScaleY,
    ringPerspective,
  };
}

function LandingPage({ onEnterApp, onNav }: { onEnterApp:()=>void, onNav:(t:string)=>void }) {
  const isMobile = useMobile();
  const systemRef = useRef<HTMLDivElement>(null);
  const orbit1Ref = useRef<HTMLDivElement>(null);
  const orbit2Ref = useRef<HTMLDivElement>(null);
  const orbit3Ref = useRef<HTMLDivElement>(null);
  const pc1Ref = useRef<HTMLDivElement>(null);
  const pc2Ref = useRef<HTMLDivElement>(null);
  const pc3Ref = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLElement|null)[]>([]);
  const scrollProgressRef = useRef(0);

  // Scroll-driven 3D camera orbit + ring rotation
  useEffect(() => {
    let raf = 0;
    let t = 0;
    let smoothProgress = 0;
    const update = () => {
      t += 0.12;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const targetProgress = y / vh; // 0..4 across 5 sections
      // Smooth progress with lerp - camera eases toward scroll position
      smoothProgress += (targetProgress - smoothProgress) * 0.08;
      const progress = smoothProgress;
      scrollProgressRef.current = progress;

      const cam = cameraPath(progress);

      // Apply camera transform to the star system (position + scale + subtle roll)
      if (systemRef.current) {
        const translateX = cam.x * 100; // vw
        const translateY = cam.y * 100; // vh
        systemRef.current.style.transform =
          `translate(-50%, -50%) translate(${translateX}vw, ${translateY}vh) scale(${cam.scale}) rotate(${cam.rotZ}deg)`;
        systemRef.current.style.filter = cam.blur > 0.1 ? `blur(${cam.blur}px)` : "none";
        systemRef.current.style.opacity = String(cam.opacity);
      }

      // Ring rotations + 3D tilt (scaleY = view angle, perspective = plane rotation)
      const ringTilt = cam.ringScaleY;
      const ringPers = cam.ringPerspective;
      if (orbit1Ref.current) orbit1Ref.current.style.transform = `translate(-50%, -50%) rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${progress*360*0.35}deg)`;
      if (orbit2Ref.current) orbit2Ref.current.style.transform = `translate(-50%, -50%) rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${-progress*360*0.22}deg)`;
      if (orbit3Ref.current) orbit3Ref.current.style.transform = `translate(-50%, -50%) rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${progress*360*0.15}deg)`;
      // Planets track the ring plane
      if (pc1Ref.current) pc1Ref.current.style.transform = `rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${progress*360*0.55 + 30 + t*0.35}deg)`;
      if (pc2Ref.current) pc2Ref.current.style.transform = `rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${progress*360*0.32 + 120 + t*0.22}deg)`;
      if (pc3Ref.current) pc3Ref.current.style.transform = `rotate(${ringPers}deg) scaleY(${ringTilt}) rotate(${progress*360*0.18 + 210 + t*0.15}deg)`;

      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Orbital sizing
  const orbitalSize = isMobile ? 360 : 560;
  const starSize = isMobile ? 120 : 150;
  const r1 = isMobile ? 200 : 250;
  const r2 = isMobile ? 300 : 400;
  const r3 = isMobile ? 420 : 560;
  const p1Dist = isMobile ? 100 : 125;
  const p2Dist = isMobile ? 150 : 200;
  const p3Dist = isMobile ? 210 : 280;

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

      {/* Flyby canvas - planets + comets */}
      {!isMobile && <FlybyCanvas scrollProgress={scrollProgressRef} />}

      {/* Fixed orbital system - now driven by camera path */}
      <div ref={systemRef} style={{
        position:"fixed",
        top:"50%",
        left:"50%",
        transform:"translate(-50%, -50%)",
        width: orbitalSize,
        height: orbitalSize,
        zIndex:1,
        pointerEvents:"none",
        opacity: 1,
        willChange: "transform, opacity, filter",
        transition: "none",
      }}>
        {/* Rings */}
        <div ref={orbit3Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(234, 88, 12, 0.22)`,
          width:r3,height:r3,
          marginTop:-r3/2,marginLeft:-r3/2,
        }} />
        <div ref={orbit2Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(217, 119, 6, 0.3)`,
          boxShadow:"0 0 50px rgba(217, 119, 6, 0.1)",
          width:r2,height:r2,
          marginTop:-r2/2,marginLeft:-r2/2,
        }} />
        <div ref={orbit1Ref} style={{
          position:"absolute",top:"50%",left:"50%",borderRadius:"50%",
          border:`1px solid rgba(13, 148, 136, 0.4)`,
          boxShadow:"0 0 40px rgba(13, 148, 136, 0.15), inset 0 0 40px rgba(13, 148, 136, 0.05)",
          width:r1,height:r1,
          marginTop:-r1/2,marginLeft:-r1/2,
        }} />

        {/* Planets */}
        <div ref={pc1Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${p1Dist}px, 0)`,
            background:C.tealLight,boxShadow:`0 0 20px ${C.tealLight}`,
          }} />
        </div>
        <div ref={pc2Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${p2Dist}px, 0)`,
            background:"#fbbf24",boxShadow:"0 0 20px #fbbf24",
          }} />
        </div>
        <div ref={pc3Ref} style={{position:"absolute",top:"50%",left:"50%",transformOrigin:"0 0"}}>
          <div style={{position:"absolute",width:14,height:14,borderRadius:"50%",top:"50%",left:"50%",marginTop:-7,marginLeft:-7,
            transform:`translate(${p3Dist}px, 0)`,
            background:"#fb923c",boxShadow:"0 0 20px #fb923c",
          }} />
        </div>

        {/* Central Star */}
        <div style={{position:"absolute",top:"50%",left:"50%",width:starSize,height:starSize,marginTop:-starSize/2,marginLeft:-starSize/2}}>
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
          <div style={{position:"absolute",top:"50%",left:"50%",width:3,height:starSize*1.8,marginTop:-starSize*0.9,marginLeft:-1.5,
            background:"linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)",
            filter:"blur(1px)",animation:"flarePulse 3s ease-in-out infinite",
          }} />
          <div style={{position:"absolute",top:"50%",left:"50%",width:starSize*1.8,height:3,marginTop:-1.5,marginLeft:-starSize*0.9,
            background:"linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)",
            filter:"blur(1px)",animation:"flarePulse 3s ease-in-out infinite 0.8s",
          }} />
        </div>
      </div>

      {/* Content sections - ALL CENTERED */}
      <main style={{position:"relative",zIndex:10,pointerEvents:"none"}}>

        {/* SECTION 1 - Arrival */}
        <section ref={el=>{chapterRefs.current[0]=el;}} style={{minHeight:"100vh",padding:isMobile?"120px 24px 80px":"140px 40px 80px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          {/* Readability vignette - darker center so text reads on top of star */}
          <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 55% 50% at 50% 50%, rgba(5, 8, 12, 0.78) 0%, rgba(5, 8, 12, 0.45) 45%, transparent 80%)",pointerEvents:"none",zIndex:2}} />
          <div style={{margin:"0 auto",maxWidth:760,position:"relative",zIndex:5,textAlign:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:10,fontFamily:FM,fontSize:isMobile?10:11,fontWeight:500,color:C.tealLight,letterSpacing:"0.2em",marginBottom:32,padding:"6px 12px",border:"1px solid rgba(45, 212, 191, 0.3)",borderRadius:100,background:"rgba(45, 212, 191, 0.08)",backdropFilter:"blur(8px)"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:C.tealLight,boxShadow:`0 0 10px ${C.tealLight}`,animation:"starPulse 2s ease-in-out infinite"}} />
              LIVE ON SOLANA
            </div>
            <h1 style={{fontFamily:FD,fontSize:isMobile?"clamp(44px, 10vw, 60px)":"clamp(56px, 7vw, 96px)",fontWeight:200,lineHeight:1.02,letterSpacing:"-0.035em",marginBottom:32,color:C.textPrimary}}>
              Prediction markets, <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>structured</span>.
            </h1>
            <p style={{fontSize:isMobile?16:19,lineHeight:1.65,color:C.textSecondary,fontWeight:300,maxWidth:560,margin:"0 auto",fontFamily:FS}}>
              One deposit. Ten curated positions. A single token that tracks the whole constellation, and pays out when markets settle.
            </p>
          </div>
          {!isMobile && (
            <div style={{position:"absolute",bottom:40,left:"50%",transform:"translateX(-50%)",fontFamily:FM,fontSize:10,letterSpacing:"0.22em",color:C.textMuted,display:"flex",flexDirection:"column",alignItems:"center",gap:10,animation:"landingBob 2s ease-in-out infinite",zIndex:5}}>
              <span>SCROLL</span>
              <div style={{width:1,height:30,background:`linear-gradient(to bottom, ${C.textMuted}, transparent)`}} />
            </div>
          )}
        </section>

        {/* SECTION 2 - Constellations */}
        <section ref={el=>{chapterRefs.current[1]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 40px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5, 8, 12, 0.82) 0%, rgba(5, 8, 12, 0.5) 50%, transparent 85%)",pointerEvents:"none",zIndex:2}} />
          <div style={{margin:"0 auto",maxWidth:680,position:"relative",zIndex:5,textAlign:"center"}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 01 · Constellations
              <span style={{width:28,height:1,background:"currentColor"}} />
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 62px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Not a single bet. A <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>constellation</span> of them.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS,maxWidth:560,margin:"0 auto 18px"}}>
              Betting on one prediction market is a coin flip. A Senthos Constellation bundles 10 or more high-liquidity positions into a single basket token, spreading exposure across uncorrelated outcomes.
            </p>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:18,fontFamily:FS,maxWidth:560,margin:"0 auto 40px"}}>
              You don't pick the positions. Our structurers do. You pick the risk profile, and buy the whole sky at once.
            </p>
            <div style={{marginTop:40,padding:isMobile?18:24,background:"rgba(15, 21, 32, 0.7)",border:"1px solid rgba(45, 212, 191, 0.12)",borderRadius:14,backdropFilter:"blur(16px)",textAlign:"left",maxWidth:520,margin:"40px auto 0"}}>
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

        {/* SECTION 3 - Tiers */}
        <section ref={el=>{chapterRefs.current[2]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 40px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5, 8, 12, 0.82) 0%, rgba(5, 8, 12, 0.5) 50%, transparent 85%)",pointerEvents:"none",zIndex:2}} />
          <div style={{margin:"0 auto",maxWidth:680,position:"relative",zIndex:5,textAlign:"center"}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 02 · Risk tiers
              <span style={{width:28,height:1,background:"currentColor"}} />
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 62px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Three orbits. Three <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>risk profiles</span>.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:40,fontFamily:FS,maxWidth:560,margin:"0 auto 40px"}}>
              Each constellation lives on one of three rings, defined by its weighted probability. Closer to the star means safer; further means bigger payout.
            </p>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:14,marginTop:40,textAlign:"left",maxWidth:560,margin:"40px auto 0"}}>
              {[
                {tier:90,label:"Conservative",sub:"STHS-90",desc:"High-probability basket. Issue price around $0.90. Built for capital preservation with small upside.",color:C.tealLight},
                {tier:70,label:"Balanced",sub:"STHS-70",desc:"Medium conviction. Issue price around $0.70. Meaningful payout with manageable downside.",color:"#fbbf24"},
                {tier:50,label:"High conviction",sub:"STHS-50",desc:"Near even-odds. Issue price around $0.50. Maximum payout potential for directional views.",color:"#fb923c"},
              ].map(t=>(
                <div key={t.tier} style={{padding:isMobile?"18px 20px":"22px 24px",background:"rgba(15, 21, 32, 0.7)",border:"1px solid rgba(45, 212, 191, 0.1)",borderRadius:16,backdropFilter:"blur(14px)",position:"relative",overflow:"hidden",transition:`all 0.3s ${EASE}`}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.borderColor="rgba(45, 212, 191, 0.25)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.borderColor="rgba(45, 212, 191, 0.1)";}}
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

        {/* SECTION 4 - Mechanics */}
        <section ref={el=>{chapterRefs.current[3]=el;}} style={{minHeight:"100vh",padding:isMobile?"100px 24px 80px":"120px 40px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5, 8, 12, 0.82) 0%, rgba(5, 8, 12, 0.5) 50%, transparent 85%)",pointerEvents:"none",zIndex:2}} />
          <div style={{margin:"0 auto",maxWidth:680,position:"relative",zIndex:5,textAlign:"center"}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Chapter 03 · Mechanics
              <span style={{width:28,height:1,background:"currentColor"}} />
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(32px, 8vw, 44px)":"clamp(40px, 5vw, 62px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary}}>
              Deposit. Hold. <span style={{fontWeight:500,background:`linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Collect</span>.
            </h2>
            <p style={{fontSize:isMobile?14:16,lineHeight:1.7,color:C.textSecondary,fontWeight:300,marginBottom:40,fontFamily:FS,maxWidth:560,margin:"0 auto 40px"}}>
              No claiming, no manual steps, no unwinding trades. The token is the position, and it auto-resolves.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?22:28,marginTop:40,textAlign:"left",maxWidth:560,margin:"40px auto 0"}}>
              {[
                ["01","Pick a tier, deposit USDC","Choose your risk level. Your deposit buys the underlying prediction market positions at issuance. A 0.5% structuring fee is taken once."],
                ["02","Receive an STHS token","One token lands in your wallet. It tracks the live net asset value of the constellation. You can sell it on Jupiter at any time, or hold through resolution."],
                ["03","Collect when markets settle","When the last position resolves, USDC is sent directly to every holder's wallet. Tokens burn. Nothing to claim."],
              ].map(([n,t,d],i)=>(
                <div key={n} style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:isMobile?18:28,alignItems:"flex-start"}}>
                  <div style={{width:isMobile?40:48,height:isMobile?40:48,borderRadius:"50%",border:"1px solid rgba(45, 212, 191, 0.3)",background:"rgba(45, 212, 191, 0.08)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FM,fontSize:isMobile?12:13,color:C.tealLight,fontWeight:500,flexShrink:0,position:"relative"}}>
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

        {/* SECTION 5 - Launch */}
        <section ref={el=>{chapterRefs.current[4]=el;}} style={{minHeight:"100vh",padding:isMobile?"80px 24px":"140px 40px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",pointerEvents:"auto"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5, 8, 12, 0.82) 0%, rgba(5, 8, 12, 0.5) 50%, transparent 85%)",pointerEvents:"none",zIndex:2}} />
          <div style={{margin:"0 auto",maxWidth:720,textAlign:"center",position:"relative",zIndex:5}}>
            <div style={{fontFamily:FM,fontSize:isMobile?10:11,letterSpacing:"0.22em",color:C.textMuted,marginBottom:16,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{width:28,height:1,background:"currentColor"}} />
              Final approach
              <span style={{width:28,height:1,background:"currentColor"}} />
            </div>
            <h2 style={{fontFamily:FD,fontSize:isMobile?"clamp(36px, 9vw, 52px)":"clamp(48px, 6vw, 84px)",fontWeight:200,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:28,color:C.textPrimary,textAlign:"center"}}>
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

export default function Page() {
  const isMobile = useIsMobile();
  return (
    <MobileCtx.Provider value={isMobile}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#05080c;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(45,212,191,0.15);border-radius:2px;}
        @keyframes starPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.08);opacity:0.85;}}
        @keyframes flarePulse{0%,100%{opacity:0.4;}50%{opacity:0.9;}}
        @keyframes landingBob{0%,100%{transform:translateX(-50%) translateY(0);}50%{transform:translateX(-50%) translateY(6px);}}
        @keyframes senthosOrbitSlow{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes senthosOrbitRev{from{transform:rotate(0deg);}to{transform:rotate(-360deg);}}
        .senthos-orbit-slow{animation:senthosOrbitSlow 80s linear infinite;}
        .senthos-orbit-med{animation:senthosOrbitRev 120s linear infinite;}
        .senthos-orbit-fast{animation:senthosOrbitSlow 160s linear infinite;}
      `}</style>
      <LandingPage
        onEnterApp={() => { window.location.href = "/app"; }}
        onNav={(t) => { window.location.href = `/app`; }}
      />
    </MobileCtx.Provider>
  );
}
