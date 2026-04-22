import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "./supabase.js";

const TOTAL = 101;
const pad = n => String(n).padStart(3, "0");
const mkTickets = () =>
  Array.from({ length: TOTAL }, (_, i) => ({
    number: pad(i), status: "available", seller: "", buyerName: "",
  }));

const C = {
  rosaPrincipal: "#d85a9c",
  rosaProfundo:  "#c25aa8",
  rosaSuave:     "#f0a8cf",
  rosaFondo:     "#fde4ef",
  lilaPrincipal: "#a56bc9",
  lilaFondo:     "#e8d5f0",
  lilaMedio:     "#f1e3f5",
  marfil:        "#faf3ee",
  textoPrincipal:"#3d2846",
  textoMedio:    "#5f3d5c",
  textoSuave:    "#7a5772",
  textoMute:     "#a68a9e",
  textoAcento:   "#8b3d74",
  fondoOscuro:   "#3d2846",
};

const STATUS = {
  available: { label:"Disponible", bg:C.lilaMedio,   border:C.lilaPrincipal, text:C.textoPrincipal },
  separated: { label:"Separado",   bg:C.rosaFondo,   border:C.rosaPrincipal, text:C.textoPrincipal },
  sold:      { label:"Vendido",    bg:C.fondoOscuro, border:C.fondoOscuro,   text:"#ffffff" },
};

const Star4 = ({ size=14, color=C.rosaSuave, opacity=0.7 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
    style={{ opacity, display:"inline-block", verticalAlign:"middle" }}>
    <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"/>
  </svg>
);

const Heart = ({ size=14, color=C.rosaPrincipal, opacity=0.7 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
    style={{ opacity, display:"inline-block", verticalAlign:"middle" }}>
    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
  </svg>
);

const Flourish = ({ color=C.rosaSuave }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, margin:"6px 0" }}>
    <div style={{ flex:1, height:1, background:`${color}66` }}/>
    <Heart size={12} color={color} opacity={0.9}/>
    <div style={{ flex:1, height:1, background:`${color}66` }}/>
  </div>
);

function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

export default function App() {
  const [tickets,  setTickets]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState({});
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSet,  setBulkSet]  = useState(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkSeller, setBulkSeller] = useState("");
  const [bulkStatus, setBulkStatus] = useState("keep");
  const [filter, setFilter] = useState("all");
  const [tab,    setTab]    = useState("grid");
  const [exportOpts, setExportOpts] = useState({ available:true, separated:true, sold:false });
  const [toast,  setToast]  = useState(null);
  const [resetOk, setResetOk] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [rangeForm, setRangeForm] = useState({ desde:"000", hasta:"100", vendedor:"", estado:"keep" });
  const canvasRef     = useRef(null);
  const prevTickets   = useRef(null); // para detectar solo los boletos que cambiaron

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("boletos")
          .select("*")
          .order("numero");
        if (error) throw error;
        // Mapear columnas de Supabase → formato interno de la app
        const mapped = data.map(r => ({
          number:    r.numero,
          status:    r.estado,
          seller:    r.vendedor,
          buyerName: r.comprador,
        }));
        setTickets(mapped.length ? mapped : mkTickets());
      } catch { setTickets(mkTickets()); }
      setLoading(false);
    })();
  }, []);

  // Guarda SOLO los boletos que cambiaron (no los 101 cada vez)
  useEffect(() => {
    if (!tickets) return;
    const prev = prevTickets.current;
    prevTickets.current = tickets;
    if (!prev) return; // primera carga, no guardar (ya vienen de Supabase)

    const changed = tickets.filter((t, i) => {
      const p = prev[i];
      return !p || p.status !== t.status || p.seller !== t.seller || p.buyerName !== t.buyerName;
    });
    if (!changed.length) return;

    const rows = changed.map(t => ({
      numero: t.number, estado: t.status, vendedor: t.seller, comprador: t.buyerName,
    }));
    supabase.from("boletos").upsert(rows).then(({ error }) => {
      if (error) console.error("Error guardando:", error.message);
    });
  }, [tickets]);

  // Escucha cambios en tiempo real — actualiza la pantalla al instante
  useEffect(() => {
    const channel = supabase
      .channel("boletos-realtime")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "boletos" },
        ({ new: r }) => {
          setTickets(prev => {
            if (!prev) return prev;
            return prev.map(t =>
              t.number === r.numero
                ? { number: r.numero, status: r.estado, seller: r.vendedor, buyerName: r.comprador }
                : t
            );
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fire = msg => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const stats = {
    available: tickets?.filter(t => t.status === "available").length ?? 0,
    separated: tickets?.filter(t => t.status === "separated").length ?? 0,
    sold:      tickets?.filter(t => t.status === "sold").length ?? 0,
  };

  const sellers  = [...new Set((tickets ?? []).map(t => t.seller).filter(Boolean))];
  const filtered = (tickets ?? []).filter(t => filter === "all" || t.status === filter);

  const openModal = num => {
    const t = tickets.find(x => x.number === num);
    setForm({ status: t.status, seller: t.seller||"", buyerName: t.buyerName||"" });
    setModal(num);
  };

  const saveModal = () => {
    setTickets(p => p.map(t => t.number === modal ? { ...t, ...form } : t));
    setModal(null); fire(`Boleto ${modal} guardado 💗`);
  };

  const applyBulk = () => {
    if (!bulkSet.size) return;
    setTickets(p => p.map(t => {
      if (!bulkSet.has(t.number)) return t;
      const u = {};
      if (bulkSeller.trim()) u.seller = bulkSeller.trim();
      if (bulkStatus !== "keep") u.status = bulkStatus;
      return { ...t, ...u };
    }));
    fire(`${bulkSet.size} boletos actualizados 💗`);
    setBulkSet(new Set()); setBulkMode(false); setShowBulk(false);
    setBulkSeller(""); setBulkStatus("keep");
  };

  const toggleBulk = num =>
    setBulkSet(p => { const s = new Set(p); s.has(num)?s.delete(num):s.add(num); return s; });

  const selectAllFor = seller => {
    setBulkSet(new Set((tickets??[]).filter(t=>t.seller===seller).map(t=>t.number)));
    setBulkMode(true); setShowBulk(true);
  };

  const applyRange = () => {
    const desde = parseInt(rangeForm.desde, 10);
    const hasta  = parseInt(rangeForm.hasta,  10);
    if (isNaN(desde)||isNaN(hasta)||desde>hasta) { fire("⚠️ Rango inválido"); return; }
    if (!rangeForm.vendedor.trim() && rangeForm.estado==="keep") { fire("⚠️ Ingresa vendedor o estado"); return; }
    let count = 0;
    setTickets(p => p.map(t => {
      const n = parseInt(t.number, 10);
      if (n < desde || n > hasta) return t;
      const u = {};
      if (rangeForm.vendedor.trim()) u.seller = rangeForm.vendedor.trim();
      if (rangeForm.estado !== "keep") u.status = rangeForm.estado;
      count++;
      return { ...t, ...u };
    }));
    fire(`${count} boletos asignados 💗`);
    setShowRange(false);
    setRangeForm({ desde:"000", hasta:"100", vendedor:"", estado:"keep" });
  };

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 1080; canvas.height = 1920;

    const bg = ctx.createLinearGradient(0,0,0,1920);
    bg.addColorStop(0,"#fde4ef"); bg.addColorStop(.55,"#f1e3f5"); bg.addColorStop(1,"#e8d5f0");
    ctx.fillStyle = bg; ctx.fillRect(0,0,1080,1920);

    const b1 = ctx.createRadialGradient(280,380,0,280,380,520);
    b1.addColorStop(0,"rgba(255,182,213,.55)"); b1.addColorStop(1,"rgba(255,182,213,0)");
    ctx.fillStyle=b1; ctx.fillRect(0,0,1080,1920);
    const b2 = ctx.createRadialGradient(820,1300,0,820,1300,600);
    b2.addColorStop(0,"rgba(196,162,230,.45)"); b2.addColorStop(1,"rgba(196,162,230,0)");
    ctx.fillStyle=b2; ctx.fillRect(0,0,1080,1920);

    ctx.fillStyle=C.lilaPrincipal; ctx.font="700 34px Inter,sans-serif";
    ctx.textAlign="center"; ctx.fillText("✦  TÓMBOLA SOLIDARIA  ✦",540,108);
    ctx.strokeStyle=`${C.rosaPrincipal}55`; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(180,128); ctx.lineTo(900,128); ctx.stroke();

    ctx.fillStyle=C.rosaPrincipal; ctx.font="italic 700 148px Georgia,serif";
    ctx.fillText("Laya",540,305); ctx.fillText("Luccia",540,480);
    ctx.beginPath(); ctx.moveTo(180,508); ctx.lineTo(900,508); ctx.stroke();

    ctx.fillStyle=C.textoMedio; ctx.font="28px Inter,sans-serif";
    ctx.fillText("Apóyanos a recaudar fondos para su operación",540,562);
    ctx.fillText("de adenoamigdalectomía 💗",540,606);

    // ── Leyenda de colores ──
    const legend = [
      exportOpts.available && ["#f1e3f5", C.lilaPrincipal, C.textoPrincipal, "Disponible"],
      exportOpts.separated && ["#fde4ef", C.rosaPrincipal, C.textoPrincipal, "Separado"],
      exportOpts.sold      && [C.fondoOscuro, "#7a5c8a", "#ffffff", "Vendido"],
    ].filter(Boolean);

    let legendX = 540 - (legend.length * 180) / 2 + 60;
    legend.forEach(([bg, bd, tx, label]) => {
      ctx.fillStyle = bg; ctx.strokeStyle = bd; ctx.lineWidth = 2;
      rRect(ctx, legendX - 20, 638, 38, 38, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.textoMedio; ctx.font = "26px Inter,sans-serif";
      ctx.textAlign = "left"; ctx.fillText(label, legendX + 24, 664);
      legendX += 180;
    });

    // ── Grid unificado con todos los boletos coloreados ──
    const cols = 9, cw = 100, ch = 74, gap = 9;
    const gridW = cols * cw + (cols - 1) * gap;
    const sx = (1080 - gridW) / 2;
    const gridStartY = 690;

    const COLORS = {
      available: { bg:"#f1e3f5", bd:C.lilaPrincipal, tx:C.textoPrincipal },
      separated: { bg:"#fde4ef", bd:C.rosaPrincipal,  tx:C.textoPrincipal },
      sold:      { bg:C.fondoOscuro, bd:"#7a5c8a",    tx:"#ffffff" },
    };

    // Decide qué boletos pintar según opciones seleccionadas
    const toShow = (tickets??[]).filter(t =>
      (t.status==="available" && exportOpts.available) ||
      (t.status==="separated" && exportOpts.separated) ||
      (t.status==="sold"      && exportOpts.sold)
    );

    // Recorremos todos del 000 al 100 para mantener posición fija en el grid
    (tickets??[]).forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = sx + col * (cw + gap);
      const cy = gridStartY + row * (ch + gap);
      const visible = toShow.find(x => x.number === t.number);
      const clr = visible ? COLORS[t.status] : null;

      if (!clr) {
        // Boleto no incluido: dibuja hueco gris muy suave
        ctx.fillStyle = "rgba(200,190,210,0.18)";
        ctx.strokeStyle = "rgba(200,190,210,0.3)";
        ctx.lineWidth = 1.5;
        rRect(ctx, cx, cy, cw, ch, 12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(160,140,170,0.4)";
        ctx.font = "bold 26px 'Courier New',monospace";
        ctx.textAlign = "center";
        ctx.fillText(t.number, cx + cw/2, cy + ch/2 + 9);
        return;
      }

      ctx.fillStyle = clr.bg; ctx.strokeStyle = clr.bd; ctx.lineWidth = 2;
      rRect(ctx, cx, cy, cw, ch, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = clr.tx; ctx.font = "bold 30px 'Courier New',monospace";
      ctx.textAlign = "center"; ctx.fillText(t.number, cx + cw/2, cy + ch/2 + 10);
    });

    const rows = Math.ceil((tickets??[]).length / cols);
    const y = gridStartY + rows * (ch + gap) + 32;

    // ── Footer ticket block ──
    const fh = 160;
    const fy = Math.max(y, 1920 - fh - 40);
    ctx.fillStyle = C.fondoOscuro;
    rRect(ctx, 60, fy, 960, fh, 20); ctx.fill();

    // Notches decorativos
    ctx.fillStyle = "#f1e3f5";
    ctx.beginPath(); ctx.arc(60,  fy + fh/2, 18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(1020, fy + fh/2, 18, 0, Math.PI*2); ctx.fill();

    // Precio
    ctx.fillStyle = C.rosaSuave;
    ctx.font = "italic 700 68px Georgia,serif";
    ctx.textAlign = "center";
    ctx.fillText("$10.00", 280, fy + fh/2 + 22);

    // Separador punteado
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; ctx.setLineDash([4,8]);
    ctx.beginPath(); ctx.moveTo(490, fy+18); ctx.lineTo(490, fy+fh-18); ctx.stroke();
    ctx.setLineDash([]);

    // Texto derecho en dos líneas para que no se corte
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.font = "italic 32px Georgia,serif";
    ctx.textAlign = "center";
    ctx.fillText("¡Participa y ayuda a", 765, fy + fh/2 - 4);
    ctx.fillText("una buena causa! 💗", 765, fy + fh/2 + 38);

    const link=document.createElement("a"); link.download="tombola-laya-luccia.png";
    link.href=canvas.toDataURL("image/png"); link.click();
    fire("Imagen descargada 🎉");
  }, [tickets, exportOpts]);

  // ── Style atoms ──────────────────────────────────────────────────────────
  const inp  = { width:"100%", padding:"10px 14px", borderRadius:12, border:`1.5px solid ${C.lilaPrincipal}33`, fontSize:14, fontFamily:"Inter,sans-serif", color:C.textoPrincipal, outline:"none", background:C.marfil, boxSizing:"border-box" };
  const selS = { ...inp, background:"white" };
  const btnP = { background:`linear-gradient(135deg,${C.rosaPrincipal},${C.lilaPrincipal})`, color:"white", border:"none", borderRadius:14, padding:"13px 20px", fontSize:14, fontWeight:700, fontFamily:"Inter,sans-serif", cursor:"pointer", flex:1, boxShadow:`0 8px 24px ${C.rosaPrincipal}40` };
  const btnG = { background:"white", color:C.textoMedio, border:`1.5px solid ${C.lilaPrincipal}44`, borderRadius:14, padding:"13px 20px", fontSize:14, fontWeight:600, fontFamily:"Inter,sans-serif", cursor:"pointer", flex:1 };
  const card = (a=C.lilaPrincipal) => ({ background:"white", border:`1px solid ${a}22`, borderRadius:16, boxShadow:`0 6px 20px ${a}18`, padding:"20px", position:"relative", overflow:"hidden" });
  const lbl  = { display:"block", fontSize:11, fontWeight:700, fontFamily:"Inter,sans-serif", textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:6, marginTop:14 };
  const eyeb = (c=C.lilaPrincipal) => ({ fontSize:11, fontWeight:700, letterSpacing:"5px", textTransform:"uppercase", color:c, fontFamily:"Inter,sans-serif", marginBottom:4 });
  const ser  = (sz=22,c=C.textoPrincipal) => ({ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontSize:sz, color:c });
  const corn = (c=C.rosaPrincipal) => ({ position:"absolute", top:-20, right:-20, width:100, height:100, borderRadius:"50%", background:`${c}10`, pointerEvents:"none" });
  const chip = (c=C.rosaPrincipal) => ({ background:`${c}15`, border:`1px dashed ${c}55`, borderRadius:100, padding:"4px 12px", fontSize:12, color:c, fontWeight:700, fontFamily:"Inter,sans-serif" });

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:`linear-gradient(180deg,${C.rosaFondo},${C.lilaMedio},${C.lilaFondo})` }}>
      <div style={{ textAlign:"center" }}>
        <Heart size={44} color={C.rosaPrincipal} opacity={1}/>
        <div style={{ ...ser(18), marginTop:14 }}>Cargando tómbola…</div>
      </div>
    </div>
  );

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600;1,9..144,700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
      <canvas ref={canvasRef} style={{ display:"none" }}/>

      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:C.fondoOscuro, color:C.rosaSuave, padding:"11px 22px", borderRadius:100, fontSize:13, fontWeight:700, fontFamily:"Inter,sans-serif", zIndex:2000, whiteSpace:"nowrap", border:`1px solid ${C.rosaSuave}44`, boxShadow:`0 4px 20px rgba(61,40,70,.38)` }}>
          {toast}
        </div>
      )}

      <div style={{ minHeight:"100vh", background:`linear-gradient(180deg,${C.rosaFondo} 0%,${C.lilaMedio} 55%,${C.lilaFondo} 100%)`, fontFamily:"Inter,sans-serif", paddingBottom:84, position:"relative", overflowX:"hidden" }}>

        {/* Blobs */}
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }}>
          <div style={{ position:"absolute", top:"4%", left:"-12%", width:380, height:380, borderRadius:"50%", background:"rgba(255,182,213,.55)", filter:"blur(10px)" }}/>
          <div style={{ position:"absolute", bottom:"16%", right:"-8%", width:320, height:320, borderRadius:"50%", background:"rgba(196,162,230,.45)", filter:"blur(10px)" }}/>
        </div>

        <div style={{ position:"relative", zIndex:1 }}>

          {/* ── HEADER ── */}
          <header style={{ textAlign:"center", padding:"32px 20px 16px", position:"relative" }}>
            <svg style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-58%)", opacity:.3, pointerEvents:"none" }} width="300" height="170" viewBox="0 0 300 170">
              <ellipse cx="150" cy="85" rx="146" ry="82" fill="none" stroke={C.rosaPrincipal} strokeWidth="1.5" strokeDasharray="2 10"/>
            </svg>
            <div style={eyeb(C.lilaPrincipal)}>
              <Star4 size={9} color={C.lilaPrincipal} opacity={1}/>&nbsp;Tómbola Solidaria&nbsp;<Star4 size={9} color={C.lilaPrincipal} opacity={1}/>
            </div>
            <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontWeight:700, fontSize:"clamp(62px,18vw,96px)", color:C.rosaPrincipal, lineHeight:.9, letterSpacing:"-3px" }}>
              Laya<br/>Luccia
            </div>
            <Flourish color={C.rosaPrincipal}/>
            <p style={{ fontSize:14, color:C.textoMedio, margin:"6px 0 0", lineHeight:1.55 }}>
              Apóyanos a recaudar fondos para<br/>su operación de adenoamigdalectomía
            </p>
          </header>

          {/* ── STATS DARK BLOCK ── */}
          <div style={{ padding:"0 16px 18px" }}>
            <div style={{ background:C.fondoOscuro, borderRadius:20, padding:"20px", boxShadow:`0 12px 32px rgba(61,40,70,.28)`, display:"grid", gridTemplateColumns:"1fr 1px 1fr 1px 1fr", alignItems:"center" }}>
              {[
                ["available","Disponibles",stats.available],
                "sep",
                ["separated","Separados",stats.separated],
                "sep",
                ["sold","Vendidos",stats.sold],
              ].map((item,i) => {
                if (item==="sep") return <div key={i} style={{ width:1, height:40, background:"rgba(255,255,255,.18)", margin:"0 auto" }}/>;
                const [k,l,v]=item;
                return (
                  <div key={k} style={{ textAlign:"center", cursor:"pointer" }} onClick={() => { setFilter(filter===k?"all":k); setTab("grid"); }}>
                    <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontWeight:700, fontSize:36, color:C.rosaSuave, lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", color:"rgba(255,255,255,.45)", marginTop:4 }}>{l}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ════════ GRID TAB ════════ */}
          {tab==="grid" && (<>
            <div style={{ display:"flex", gap:7, padding:"0 14px 12px", overflowX:"auto", alignItems:"center" }}>
              {[["all","Todos",C.lilaPrincipal],["available","Disponible",C.lilaPrincipal],["separated","Separado",C.rosaPrincipal],["sold","Vendido",C.textoAcento]].map(([v,l,c])=>(
                <button key={v} style={{ padding:"7px 14px", borderRadius:100, border:`1.5px solid ${c}55`, background:filter===v?c:"rgba(255,255,255,.78)", color:filter===v?"white":c, fontSize:12, fontWeight:700, fontFamily:"Inter,sans-serif", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }} onClick={()=>setFilter(v)}>{l}</button>
              ))}
              <button style={{ padding:"7px 14px", borderRadius:100, border:`1.5px dashed ${C.rosaPrincipal}88`, background:showRange?`${C.rosaPrincipal}15`:"rgba(255,255,255,.78)", color:C.rosaPrincipal, fontSize:12, fontWeight:700, fontFamily:"Inter,sans-serif", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}
                onClick={()=>{ setShowRange(r=>!r); setBulkMode(false); setBulkSet(new Set()); }}>
                {showRange?"✕ Cerrar":"📋 Por rango"}
              </button>
              <button style={{ padding:"7px 14px", borderRadius:100, marginLeft:"auto", border:`1.5px dashed ${bulkMode?C.rosaPrincipal:C.lilaPrincipal}88`, background:bulkMode?`${C.rosaPrincipal}15`:"rgba(255,255,255,.78)", color:bulkMode?C.rosaPrincipal:C.lilaPrincipal, fontSize:12, fontWeight:700, fontFamily:"Inter,sans-serif", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}
                onClick={()=>{ setBulkMode(b=>!b); setBulkSet(new Set()); setShowBulk(false); setShowRange(false); }}>
                {bulkMode?"✕ Cancelar":"☑ Manual"}
              </button>
            </div>

            {/* ── RANGE PANEL ── */}
            {showRange && (
              <div style={{ margin:"0 14px 14px", background:"white", border:`1px solid ${C.rosaPrincipal}22`, borderRadius:16, padding:"18px 20px", boxShadow:`0 6px 20px ${C.rosaPrincipal}18`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:-16, right:-16, width:80, height:80, borderRadius:"50%", background:`${C.rosaPrincipal}10` }}/>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"4px", textTransform:"uppercase", color:C.rosaPrincipal, marginBottom:10, fontFamily:"Inter,sans-serif" }}>
                  <Star4 size={9} color={C.rosaPrincipal} opacity={.8}/> Asignar por rango
                </div>

                {/* Desde / Hasta */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:4, fontFamily:"Inter,sans-serif" }}>Desde</div>
                    <input type="number" min="0" max="100" style={{ ...inp, textAlign:"center", fontFamily:"monospace", fontWeight:700, fontSize:18 }}
                      value={parseInt(rangeForm.desde,10)}
                      onChange={e=>setRangeForm(f=>({...f,desde:pad(Math.min(100,Math.max(0,parseInt(e.target.value)||0)))}))  }/>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:4, fontFamily:"Inter,sans-serif" }}>Hasta</div>
                    <input type="number" min="0" max="100" style={{ ...inp, textAlign:"center", fontFamily:"monospace", fontWeight:700, fontSize:18 }}
                      value={parseInt(rangeForm.hasta,10)}
                      onChange={e=>setRangeForm(f=>({...f,hasta:pad(Math.min(100,Math.max(0,parseInt(e.target.value)||0)))}))}/>
                  </div>
                </div>

                {/* Preview count */}
                <div style={{ fontSize:12, color:C.lilaPrincipal, fontFamily:"Inter,sans-serif", marginBottom:10, fontWeight:600 }}>
                  {(() => { const d=parseInt(rangeForm.desde,10),h=parseInt(rangeForm.hasta,10); return !isNaN(d)&&!isNaN(h)&&d<=h ? `${h-d+1} boletos seleccionados (${pad(d)} → ${pad(h)})` : "Rango inválido"; })()}
                </div>

                {/* Vendedor */}
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:4, fontFamily:"Inter,sans-serif" }}>Responsable de venta</div>
                <input style={{ ...inp, marginBottom:10 }} placeholder="Nombre del vendedor (ej: Abuelita)" value={rangeForm.vendedor}
                  onChange={e=>setRangeForm(f=>({...f,vendedor:e.target.value}))} list="sl-range"/>
                <datalist id="sl-range">{sellers.map(s=><option key={s} value={s}/>)}</datalist>

                {/* Estado */}
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:4, fontFamily:"Inter,sans-serif" }}>Cambiar estado</div>
                <select style={{ ...selS, marginBottom:14 }} value={rangeForm.estado} onChange={e=>setRangeForm(f=>({...f,estado:e.target.value}))}>
                  <option value="keep">— No cambiar estado —</option>
                  <option value="available">✨ Disponible</option>
                  <option value="separated">🕐 Separado</option>
                  <option value="sold">💗 Vendido</option>
                </select>

                <div style={{ display:"flex", gap:10 }}>
                  <button style={{ ...btnG, flex:"none", padding:"11px 16px", fontSize:13 }} onClick={()=>setShowRange(false)}>Cancelar</button>
                  <button style={{ ...btnP, fontSize:13 }} onClick={applyRange}>Asignar boletos 💗</button>
                </div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(68px,1fr))", gap:8, padding:"0 14px 14px" }}>
              {filtered.map(t => {
                const st=STATUS[t.status], sel2=bulkSet.has(t.number);
                return (
                  <div key={t.number} style={{ background:sel2?C.rosaPrincipal:st.bg, border:`2px solid ${sel2?C.rosaPrincipal:st.border}`, borderRadius:12, padding:"9px 4px", textAlign:"center", cursor:"pointer", transition:"all .14s", boxShadow:sel2?`0 4px 14px ${C.rosaPrincipal}55`:`0 2px 8px ${st.border}25` }}
                    onClick={()=>bulkMode?toggleBulk(t.number):openModal(t.number)}>
                    <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:700, letterSpacing:1, color:sel2?"white":st.text }}>{t.number}</div>
                    {t.seller    && <div style={{ fontSize:9, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:sel2?"rgba(255,255,255,.78)":C.textoMute }}>{t.seller.split(" ")[0]}</div>}
                    {t.buyerName && <div style={{ fontSize:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:sel2?"rgba(255,255,255,.58)":C.textoMute, fontStyle:"italic" }}>{t.buyerName.split(" ")[0]}</div>}
                  </div>
                );
              })}
            </div>
          </>)}

          {/* ════════ SELLERS TAB ════════ */}
          {tab==="sellers" && (
            <div style={{ padding:"0 16px" }}>
              <div style={{ ...card(C.lilaPrincipal), marginBottom:14, padding:"16px 20px" }}>
                <div style={corn(C.lilaPrincipal)}/>
                <div style={eyeb(C.lilaPrincipal)}><Star4 size={9} color={C.lilaPrincipal} opacity={.8}/> Responsables de Venta</div>
                <div style={ser(26)}>{sellers.length} responsable{sellers.length!==1?"s":""} asignado{sellers.length!==1?"s":""}</div>
              </div>
              {sellers.length===0 && (
                <div style={{ textAlign:"center", color:C.textoMute, padding:"40px 20px", fontSize:14 }}>
                  <Heart size={32} color={C.rosaSuave} opacity={.8}/>
                  <div style={{ marginTop:12, lineHeight:1.6 }}>Aún no hay responsables asignados.<br/>Usa el modo "☑ Selección" en la cuadrícula.</div>
                </div>
              )}
              {sellers.map(s => {
                const mine=tickets.filter(t=>t.seller===s);
                const sv=mine.filter(t=>t.status==="sold").length;
                const sp=mine.filter(t=>t.status==="separated").length;
                const av=mine.filter(t=>t.status==="available").length;
                return (
                  <div key={s} style={{ ...card(C.rosaPrincipal), marginBottom:14 }}>
                    <div style={corn(C.rosaPrincipal)}/>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div>
                        <div style={{ ...eyeb(C.textoMute) }}>Vendedora</div>
                        <div style={ser(22)}>{s}</div>
                      </div>
                      <div style={chip(C.rosaPrincipal)}>{mine.length} 🎟️</div>
                    </div>
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>
                      {[["Vendidos",sv,C.rosaProfundo],["Separados",sp,C.lilaPrincipal],["Disponibles",av,C.textoMute]].map(([l,v,c])=>(
                        <div key={l} style={{ background:`${c}18`, borderRadius:8, padding:"4px 10px", fontSize:11, color:c, fontWeight:700 }}>{l}: {v}</div>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
                      {mine.map(t=>(
                        <span key={t.number} style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, padding:"3px 8px", borderRadius:8, cursor:"pointer", background:STATUS[t.status].bg, color:STATUS[t.status].text, border:`1px solid ${STATUS[t.status].border}44` }} onClick={()=>openModal(t.number)}>{t.number}</span>
                      ))}
                    </div>
                    <button style={{ ...btnG, flex:"none", display:"block", width:"100%", fontSize:12, padding:"9px 14px", borderRadius:10, boxSizing:"border-box" }} onClick={()=>selectAllFor(s)}>☑ Seleccionar todos</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ════════ EXPORT TAB ════════ */}
          {tab==="export" && (
            <div style={{ padding:"0 16px" }}>
              <div style={{ ...card(C.lilaPrincipal), marginBottom:14 }}>
                <div style={corn(C.lilaPrincipal)}/>
                <div style={eyeb(C.lilaPrincipal)}><Star4 size={9} color={C.lilaPrincipal} opacity={.8}/> Exportar</div>
                <div style={{ ...ser(24), marginBottom:14 }}>Historia de Instagram</div>
                <Flourish color={C.lilaPrincipal}/>
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"2px", color:C.textoMute, marginBottom:12, fontFamily:"Inter,sans-serif" }}>¿Qué incluir?</div>
                  {[["available","✨ Disponibles",stats.available,C.lilaPrincipal],["separated","🕐 Separados",stats.separated,C.rosaPrincipal],["sold","✓ Vendidos",stats.sold,C.textoAcento]].map(([k,l,v,c])=>(
                    <label key={k} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:13, cursor:"pointer" }}>
                      <input type="checkbox" checked={exportOpts[k]} onChange={e=>setExportOpts(p=>({...p,[k]:e.target.checked}))} style={{ width:18, height:18, accentColor:c }}/>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:C.textoPrincipal, fontFamily:"Inter,sans-serif" }}>{l}</div>
                        <div style={{ fontSize:11, color:C.textoMute, fontFamily:"Inter,sans-serif" }}>{v} boletos</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ticket preview block */}
              <div style={{ background:C.fondoOscuro, borderRadius:20, padding:"22px 28px", boxShadow:`0 12px 32px rgba(61,40,70,.28)`, marginBottom:14, display:"flex", alignItems:"center", gap:16, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", left:-14, top:"50%", transform:"translateY(-50%)", width:28, height:28, borderRadius:"50%", background:C.lilaMedio }}/>
                <div style={{ position:"absolute", right:-14, top:"50%", transform:"translateY(-50%)", width:28, height:28, borderRadius:"50%", background:C.lilaMedio }}/>
                <div style={{ flex:"none" }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:"3px", textTransform:"uppercase", color:"rgba(255,255,255,.4)", marginBottom:2, fontFamily:"Inter,sans-serif" }}>Boleto</div>
                  <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontWeight:700, fontSize:54, color:C.rosaSuave, lineHeight:1 }}>$10</div>
                </div>
                <div style={{ width:1, height:52, background:"rgba(255,255,255,.2)", borderLeft:"2px dashed rgba(255,255,255,.25)", flexShrink:0 }}/>
                <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontSize:18, color:"rgba(255,255,255,.88)", lineHeight:1.45 }}>¡Participa y ayuda<br/>a una buena causa!</div>
              </div>

              <button style={{ ...btnP, display:"block", width:"100%", padding:"15px", fontSize:15, borderRadius:16, textAlign:"center", boxSizing:"border-box" }} onClick={exportImage}>
                ⬇ Descargar Imagen (1080 × 1920)
              </button>

              <div style={{ ...card(C.rosaPrincipal), marginTop:14 }}>
                <div style={corn(C.rosaPrincipal)}/>
                <div style={eyeb(C.rosaPrincipal)}><Heart size={9} color={C.rosaPrincipal} opacity={1}/> Resumen</div>
                {[["Total boletos",TOTAL],["Recaudado (vendidos)",`$${stats.sold*10}`],["Potencial (sep.+vend.)",`$${(stats.sold+stats.separated)*10}`],["Por recaudar",`$${stats.available*10}`]].map(([l,v])=>(
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.rosaPrincipal}18`, fontSize:13 }}>
                    <span style={{ color:C.textoSuave }}>{l}</span>
                    <span style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", color:C.rosaPrincipal, fontSize:15 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════ SETTINGS TAB ════════ */}
          {tab==="settings" && (
            <div style={{ padding:"0 16px" }}>
              <div style={{ ...card(C.lilaPrincipal), marginBottom:14 }}>
                <div style={corn(C.lilaPrincipal)}/>
                <div style={{ fontSize:14, fontWeight:700, color:C.textoPrincipal, marginBottom:6, fontFamily:"Inter,sans-serif" }}>⚠️ Reiniciar tómbola</div>
                <div style={{ fontSize:12, color:C.textoMute, marginBottom:16, lineHeight:1.6, fontFamily:"Inter,sans-serif" }}>Borrará todos los estados, nombres y responsables. No se puede deshacer.</div>
                {!resetOk
                  ? <button style={{ ...btnG, flex:"none", display:"block", width:"100%", color:C.rosaProfundo, borderColor:`${C.rosaProfundo}44`, boxSizing:"border-box" }} onClick={()=>setResetOk(true)}>🔄 Reiniciar</button>
                  : <div>
                      <div style={{ fontSize:13, color:C.rosaProfundo, fontWeight:600, marginBottom:12, textAlign:"center", fontFamily:"Inter,sans-serif" }}>¿Estás segura? No se puede deshacer.</div>
                      <div style={{ display:"flex", gap:10 }}>
                        <button style={btnG} onClick={()=>setResetOk(false)}>Cancelar</button>
                        <button style={{ ...btnP, background:C.rosaProfundo, boxShadow:"none" }} onClick={()=>{ setTickets(mkTickets()); setResetOk(false); fire("Tómbola reiniciada"); }}>Sí, reiniciar</button>
                      </div>
                    </div>
                }
              </div>
              <div style={card(C.rosaPrincipal)}>
                <div style={corn(C.rosaPrincipal)}/>
                <div style={eyeb(C.rosaPrincipal)}><Heart size={9} color={C.rosaPrincipal} opacity={1}/> Estadísticas</div>
                {[["🎟️ Total boletos",TOTAL],["✨ Disponibles",stats.available],["🕐 Separados",stats.separated],["💗 Vendidos",stats.sold],["💵 Recaudado",`$${stats.sold*10}.00`],["💰 Potencial total",`$${(stats.sold+stats.separated)*10}.00`]].map(([l,v])=>(
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.rosaPrincipal}18`, fontSize:13 }}>
                    <span style={{ color:C.textoSuave, fontFamily:"Inter,sans-serif" }}>{l}</span>
                    <span style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontWeight:600, color:C.rosaPrincipal, fontSize:15 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bulk floating bar */}
        {bulkMode && bulkSet.size>0 && !showBulk && (
          <div style={{ position:"fixed", bottom:65, left:0, right:0, zIndex:99, background:C.fondoOscuro, padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 -4px 20px rgba(61,40,70,.38)` }}>
            <span style={{ fontSize:13, color:C.rosaSuave, fontFamily:"Inter,sans-serif" }}>{bulkSet.size} boleto{bulkSet.size!==1?"s":""} seleccionado{bulkSet.size!==1?"s":""}</span>
            <button style={{ background:C.rosaPrincipal, color:"white", border:"none", borderRadius:10, padding:"8px 18px", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"Inter,sans-serif", boxShadow:`0 4px 12px ${C.rosaPrincipal}55` }} onClick={()=>setShowBulk(true)}>Asignar ›</button>
          </div>
        )}

        {/* Bottom Nav */}
        <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(255,255,255,.94)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.rosaSuave}44`, display:"flex", justifyContent:"space-around", padding:"10px 0 18px", zIndex:100, boxShadow:`0 -4px 20px ${C.rosaPrincipal}15` }}>
          {[["grid","🎟️","Boletos"],["sellers","💗","Vendedores"],["export","📸","Exportar"],["settings","⚙️","Config"]].map(([t2,icon,label])=>(
            <button key={t2} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"center", color:tab===t2?C.rosaPrincipal:C.textoMute, padding:"2px 14px", fontFamily:"Inter,sans-serif" }} onClick={()=>setTab(t2)}>
              <div style={{ fontSize:20 }}>{icon}</div>
              <div style={{ fontSize:10, fontWeight:tab===t2?700:400, marginTop:2, letterSpacing:".5px" }}>{label}</div>
            </button>
          ))}
        </nav>
      </div>

      {/* ── Ticket Modal ── */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(61,40,70,.52)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:"white", borderRadius:24, padding:28, width:"100%", maxWidth:400, boxShadow:`0 24px 64px rgba(61,40,70,.32)`, position:"relative", overflow:"hidden" }}>
            <div style={corn(C.rosaPrincipal)}/>
            <div style={{ ...eyeb(C.lilaPrincipal), textAlign:"center" }}>Boleto</div>
            <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontWeight:700, fontSize:44, color:C.rosaPrincipal, textAlign:"center", lineHeight:1, marginBottom:4 }}>#{modal}</div>
            <Flourish color={C.rosaSuave}/>
            <label style={lbl}>Estado</label>
            <select style={selS} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              <option value="available">✨ Disponible</option>
              <option value="separated">🕐 Separado</option>
              <option value="sold">💗 Vendido</option>
            </select>
            <label style={lbl}>Responsable de venta</label>
            <input style={inp} placeholder="Nombre del vendedor" value={form.seller} onChange={e=>setForm(f=>({...f,seller:e.target.value}))} list="sl1"/>
            <datalist id="sl1">{sellers.map(s=><option key={s} value={s}/>)}</datalist>
            {(form.status==="separated"||form.status==="sold")&&(<>
              <label style={lbl}>{form.status==="sold"?"Comprado por":"Separado por"}</label>
              <input style={inp} placeholder="Nombre del cliente" value={form.buyerName} onChange={e=>setForm(f=>({...f,buyerName:e.target.value}))}/>
            </>)}
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button style={btnG} onClick={()=>setModal(null)}>Cancelar</button>
              <button style={btnP} onClick={saveModal}>Guardar 💗</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Panel Modal ── */}
      {showBulk && (
        <div style={{ position:"fixed", inset:0, background:"rgba(61,40,70,.52)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }} onClick={e=>e.target===e.currentTarget&&setShowBulk(false)}>
          <div style={{ background:"white", borderRadius:24, padding:28, width:"100%", maxWidth:400, boxShadow:`0 24px 64px rgba(61,40,70,.32)`, position:"relative", overflow:"hidden" }}>
            <div style={corn(C.lilaPrincipal)}/>
            <div style={{ ...eyeb(C.lilaPrincipal), textAlign:"center" }}>Asignación grupal</div>
            <div style={{ fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", fontSize:30, color:C.textoPrincipal, textAlign:"center", marginBottom:12 }}>{bulkSet.size} boletos</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:16, maxHeight:108, overflowY:"auto" }}>
              {[...bulkSet].sort().map(n=><span key={n} style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, padding:"3px 8px", background:C.lilaMedio, borderRadius:8, color:C.lilaPrincipal }}>{n}</span>)}
            </div>
            <label style={lbl}>Responsable de venta</label>
            <input style={inp} placeholder="Dejar vacío para no cambiar" value={bulkSeller} onChange={e=>setBulkSeller(e.target.value)} list="sl2"/>
            <datalist id="sl2">{sellers.map(s=><option key={s} value={s}/>)}</datalist>
            <label style={lbl}>Cambiar estado</label>
            <select style={selS} value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
              <option value="keep">— No cambiar estado —</option>
              <option value="available">✨ Disponible</option>
              <option value="separated">🕐 Separado</option>
              <option value="sold">💗 Vendido</option>
            </select>
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button style={btnG} onClick={()=>setShowBulk(false)}>Cancelar</button>
              <button style={btnP} onClick={applyBulk}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}