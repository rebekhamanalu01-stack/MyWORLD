import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import {
  Leaf, Info, Mail, Trash2, Check, Sprout, TreePine, ListChecks, RotateCcw, Flame, Award, CalendarDays,
  Car, Snowflake, Beef, Tv, ShoppingBag, Droplets, Bike, Sparkles, ShieldCheck,
} from "lucide-react";

const EMERALD = "#027A48";

/* ---------- helpers ---------- */
function useAnimatedNumber(target, duration = 700) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = begin + (target - begin) * eased;
      setVal(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(16,24,40,0.06)] ${className}`} {...rest}>
    {children}
  </div>
);

/* Muncul dengan skala halus; murni kelas Tailwind + satu state */
function PopIn({ className = "", style, children }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div style={style}
      className={`transition duration-500 ease-out motion-reduce:transition-none ${on ? "scale-100 opacity-100" : "scale-50 opacity-0"} ${className}`}>
      {children}
    </div>
  );
}

/* ---------- LOGO: bumi dan daun yang menyatu (datar, ringan, tanpa filter/animasi) ---------- */
const Logo = memo(function Logo({ size = 48 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Logo MyWORLD">
      <circle cx="24" cy="24" r="22" fill={EMERALD} />
      <g fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1">
        <ellipse cx="24" cy="24" rx="9" ry="22" />
        <path d="M2.5 24h43M5.5 14h37M5.5 34h37" />
      </g>
      <path d="M12 37C10 22 20 11 37 11C38 28 28 38 12 37Z" fill="#fff" />
      <g fill="none" stroke={EMERALD} strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 37C19 29 26 22 33 15" />
        <path d="M18 31.5l5 1M22.5 26.5l5 1M27 21.5l4 1" strokeWidth="1.2" />
      </g>
    </svg>
  );
});

/* ---------- TAB 1: SINKRON EMAIL (Gmail API) ---------- */
// Kosongkan = mode contoh. Isi dengan Client ID Google OAuth jika ingin sinkronisasi Gmail sungguhan.
const CLIENT_ID = "";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CO2_PER_EMAIL_G = 4; // estimasi edukatif per email tersimpan

const SAMPLE = [
  { id: "e1", from: "PromoMart", subject: "Diskon 70% hanya malam ini", kb: 820, co2: 4, cat: "Email" },
  { id: "e2", from: "TechWeekly", subject: "Newsletter edisi #284", kb: 2100, co2: 4, cat: "Email" },
  { id: "e3", from: "SocialApp", subject: "Ada 9 notifikasi baru untukmu", kb: 310, co2: 4, cat: "Email" },
  { id: "f1", from: "Galeri", subject: "12 screenshot duplikat", kb: 3600, co2: 8, cat: "Foto" },
  { id: "f2", from: "Galeri", subject: "Foto burst hasil bidikan ganda", kb: 5200, co2: 12, cat: "Foto" },
  { id: "b1", from: "Unduhan", subject: "Installer aplikasi lama", kb: 15400, co2: 15, cat: "Berkas" },
  { id: "b2", from: "Unduhan", subject: "PDF materi kuliah salinan ganda", kb: 8400, co2: 10, cat: "Berkas" },
  { id: "m1", from: "Grup chat", subject: "Video forward tahun lalu", kb: 22000, co2: 25, cat: "Media chat" },
  { id: "c1", from: "Cache aplikasi", subject: "Data sementara media sosial", kb: 31000, co2: 20, cat: "Cache" },
];

function loadGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const el = document.createElement("script");
    el.src = "https://accounts.google.com/gsi/client";
    el.async = true;
    el.onload = resolve;
    el.onerror = () => reject(new Error("Gagal memuat layanan Google. Periksa koneksi internet."));
    document.head.appendChild(el);
  });
}

async function gmail(token, path, opts = {}) {
  const res = await fetch(`${GMAIL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Sesi berakhir. Hubungkan ulang Gmail." : `Gmail menolak permintaan (kode ${res.status}).`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function DigitalHygiene({ freedKb, savedG, onSaved }) {
  const [token, setToken] = useState(null);
  const [account, setAccount] = useState("");
  const [mails, setMails] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [error, setError] = useState("");
  const [sel, setSel] = useState(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [done, setDone] = useState(null);
  const [filter, setFilter] = useState("Semua");
  const [progress, setProgress] = useState(0);

  const totalKb = mails.reduce((a, m) => a + m.kb, 0);
  const selKb = mails.filter((m) => sel.has(m.id)).reduce((a, m) => a + m.kb, 0);
  const pct = totalKb ? (selKb / totalKb) * 100 : 0;
  const animFreed = useAnimatedNumber(freedKb);
  const animG = useAnimatedNumber(savedG);
  const R = 52, C = 2 * Math.PI * R;
  const cats = ["Semua", ...new Set(mails.map((m) => m.cat))];
  const f = cats.includes(filter) ? filter : "Semua";
  const shown = f === "Semua" ? mails : mails.filter((m) => m.cat === f);
  const EMAIL_CATS = ["Email", "Promosi", "Sosial"];
  const noun = mails.length > 0 && mails.every((m) => EMAIL_CATS.includes(m.cat)) ? "email" : "item";
  const allSelected = shown.length > 0 && shown.every((m) => sel.has(m.id));

  const loadSample = () => {
    setToken("sample"); setAccount("Pemindaian contoh"); setMails(SAMPLE); setSel(new Set()); setStatus("ready");
  };

  const load = async (tk) => {
    if (tk === "sample") return loadSample();
    setStatus("loading"); setError("");
    try {
      const q = encodeURIComponent("(category:promotions OR category:social) older_than:30d");
      const [profile, list] = await Promise.all([gmail(tk, "/profile"), gmail(tk, `/messages?maxResults=25&q=${q}`)]);
      setAccount(profile.emailAddress);
      const detail = await Promise.all(
        (list.messages || []).map((m) => gmail(tk, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`))
      );
      setMails(detail.map((d) => {
        const h = (n) => d.payload?.headers?.find((x) => x.name === n)?.value || "";
        const from = h("From").replace(/<.*>/, "").replace(/"/g, "").trim();
        return {
          id: d.id,
          from: from || h("From") || "(tanpa nama)",
          subject: h("Subject") || "(tanpa subjek)",
          kb: Math.max(1, Math.round((d.sizeEstimate || 0) / 1024)),
          co2: CO2_PER_EMAIL_G,
          cat: d.labelIds?.includes("CATEGORY_SOCIAL") ? "Sosial" : "Promosi",
        };
      }));
      setSel(new Set());
      setStatus("ready");
    } catch (e) { setError(e.message); setStatus("idle"); setToken(null); }
  };

  const connect = async () => {
    setError("");
    if (!CLIENT_ID) return loadSample(); // tanpa Client ID: jalan dengan data contoh
    try {
      await loadGoogle();
      window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: "https://www.googleapis.com/auth/gmail.modify",
        callback: (r) => {
          if (r.error) { setError("Izin akses Gmail tidak diberikan."); return; }
          setToken(r.access_token); load(r.access_token);
        },
      }).requestAccessToken();
    } catch (e) { setError(e.message); }
  };

  const disconnect = () => {
    try { window.google?.accounts?.oauth2?.revoke(token, () => {}); } catch (e) { /* abaikan */ }
    setToken(null); setAccount(""); setMails([]); setSel(new Set()); setStatus("idle");
  };

  const toggle = (id) => {
    if (cleaning) return;
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const clean = async () => {
    if (!sel.size || cleaning) return;
    setCleaning(true); setProgress(8); setError("");
    const iv = setInterval(() => setProgress((p) => Math.min(p + 6, 90)), 120);
    try {
      if (token === "sample") await new Promise((r) => setTimeout(r, 900));
      else await gmail(token, "/messages/batchModify", {
        method: "POST",
        body: JSON.stringify({ ids: [...sel], addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
      });
      clearInterval(iv); setProgress(100);
      await new Promise((r) => setTimeout(r, 350));
      const gone = mails.filter((m) => sel.has(m.id));
      const g = gone.reduce((a, m) => a + m.co2, 0);
      onSaved(g, gone.reduce((a, m) => a + m.kb, 0), gone.length);
      setDone({ n: gone.length, kb: gone.reduce((a, m) => a + m.kb, 0), g });
      setMails((ms) => ms.filter((m) => !sel.has(m.id)));
      setSel(new Set());
    } catch (e) { clearInterval(iv); setError(e.message); }
    setCleaning(false);
  };

  if (status !== "ready") {
    return (
      <Card className="flex flex-col items-center py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50"><Mail size={30} color={EMERALD} /></div>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">Bersihkan jejak digitalmu</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {CLIENT_ID ? "MyWORLD hanya membaca pengirim, subjek, dan ukuran email promosi dan sosial yang usianya lebih dari 30 hari. Isi pesanmu tidak dibaca dan tidak dikirim ke server mana pun." : "Email lama, foto dobel, unduhan yang terlupakan, sampai cache aplikasi. Semua yang menumpuk di perangkat dan server ikut menyedot energi. Yuk, rapikan."}
        </p>
        <button onClick={connect} disabled={status === "loading"}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(2,122,72,0.25)] transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: EMERALD }}>
          <Mail size={18} /> {status === "loading" ? "Memindai…" : CLIENT_ID ? "Hubungkan Gmail" : "Mulai pindai"}
        </button>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{CLIENT_ID ? "Email yang dibersihkan dipindahkan ke Sampah dan bisa dipulihkan selama 30 hari." : "Mode contoh: data ilustrasi, tidak ada berkas nyata yang dihapus."}</p>
      </Card>
    );
  }

  if (done) {
    const mb = done.kb >= 1000 ? `${(done.kb / 1024).toFixed(1)} MB` : `${done.kb} KB`;
    return (
      <Card className="flex flex-col items-center py-10 text-center" role="status">
        <PopIn className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: EMERALD }}>
          <Check size={40} color="#fff" strokeWidth={3} />
        </PopIn>
        <h2 className="mt-5 text-xl font-extrabold text-slate-900">Beres. Ruang digitalmu lebih lega.</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {done.n} item ({mb}) sudah dibersihkan, setara ±{Math.round(done.g)} g CO₂e yang tak perlu lagi ditanggung server. Langkah kecil yang dilakukan berulang pasti terasa dampaknya.
        </p>
        <p className="mt-3 max-w-xs text-xs text-slate-500">{token === "sample" ? "Mode contoh: tidak ada berkas nyata yang dihapus." : "Email ada di Sampah Gmail dan bisa dipulihkan selama 30 hari."}</p>
        <button onClick={() => setDone(null)} className="mt-6 w-full rounded-2xl py-4 text-base font-extrabold text-white transition-transform active:scale-[0.98]" style={{ background: EMERALD }}>
          {mails.length ? "Lanjut merapikan" : "Selesai"}
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-semibold text-slate-500">Sumber: <span className="text-slate-800">{account}</span></p>
          <button onClick={disconnect} className="shrink-0 text-xs font-bold text-slate-400">Putuskan</button>
        </div>
        <div className="flex items-center gap-5">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" stroke="#EEF0F2" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke={EMERALD} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
                style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-slate-900">{(totalKb / 1024).toFixed(1)}</span>
              <span className="text-xs font-medium text-slate-500">{noun === "email" ? "MB email lama" : "MB sampah digital"}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-slate-900">Sampah digital</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">Centang {noun} yang sudah tidak kamu perlukan.</p>
            <div className="mt-3 text-sm font-semibold" style={{ color: EMERALD }}>{sel.size} dipilih · {(selKb / 1024).toFixed(2)} MB</div>
          </div>
        </div>
        {cleaning && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: EMERALD, transition: "width 120ms linear" }} />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">Membersihkan… {progress}%</p>
          </div>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs font-semibold text-slate-500">Ruang dibebaskan</p>
          <p className="mt-1 text-xl font-extrabold text-slate-900">{(animFreed / 1024).toFixed(2)} <span className="text-sm font-semibold text-slate-400">MB</span></p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-semibold text-slate-500">Emisi dihindari (estimasi)</p>
          <p className="mt-1 text-xl font-extrabold" style={{ color: EMERALD }}>{animG.toFixed(0)} <span className="text-sm font-semibold text-slate-400">g CO₂e</span></p>
        </Card>
      </div>

      <Card className="!p-2">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <h3 className="text-sm font-extrabold text-slate-900">Daftar jejak ({shown.length})</h3>
          <button onClick={() => setSel(allSelected ? new Set() : new Set(shown.map((m) => m.id)))}
            className="rounded-full px-3 py-1 text-xs font-bold hover:bg-emerald-50" style={{ color: EMERALD }}>
            {allSelected ? "Batal pilih" : "Pilih semua"}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
          {cats.map((c) => (
            <button key={c} onClick={() => { setFilter(c); setSel(new Set()); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${f === c ? "text-white" : "bg-slate-100 text-slate-600"}`}
              style={f === c ? { background: EMERALD } : undefined}>{c}</button>
          ))}
        </div>
        {mails.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50"><ShieldCheck size={26} color={EMERALD} /></div>
            <p className="mt-3 text-base font-extrabold text-slate-900">Sudah bersih semua</p>
            <p className="mt-1 text-sm text-slate-500">Tidak ada lagi yang perlu dirapikan. Server pun ikut lega.</p>
            <button onClick={() => load(token)} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
              <RotateCcw size={15} /> Pindai lagi
            </button>
          </div>
        ) : (
          <ul>
            {shown.map((m) => {
              const on = sel.has(m.id);
              return (
                <li key={m.id}>
                  <button onClick={() => toggle(m.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${on ? "bg-emerald-50/70" : "hover:bg-slate-50"}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all"
                      style={{ borderColor: on ? EMERALD : "#D0D5DD", background: on ? EMERALD : "#fff" }}>
                      {on && <Check size={14} color="#fff" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">{m.from}</span>
                      <span className="block truncate text-xs text-slate-500">{m.subject}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold text-slate-700">{m.kb >= 1000 ? (m.kb / 1024).toFixed(1) + " MB" : m.kb + " KB"}</span>
                      <span className="block text-[11px] text-slate-400">{m.cat}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {mails.length > 0 && (
        <>
          <button onClick={clean} disabled={!sel.size || cleaning}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(2,122,72,0.25)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            style={{ background: EMERALD }}>
            <Trash2 size={18} /> {cleaning ? "Membersihkan…" : `Bersihkan ${sel.size || ""} ${noun}`}
          </button>
          <p className="text-center text-[11px] text-slate-400">{token === "sample" ? "Mode contoh: data ilustrasi, tidak ada berkas nyata yang dihapus." : "Email dipindahkan ke Sampah Gmail dan bisa dipulihkan selama 30 hari."}</p>
        </>
      )}
    </div>
  );
}

/* ---------- TAB 2: ECO SIMULATOR ---------- */
const MODES = [
  { key: "motor", label: "Motor", f: 0.1, icon: Car },
  { key: "mobil", label: "Mobil", f: 0.19, icon: Car },
  { key: "bus", label: "Angkot/Bus", f: 0.05, icon: Car },
  { key: "sepeda", label: "Sepeda/Jalan", f: 0, icon: Bike },
];

function lerp(a, b, t) { return a + (b - a) * t; }

function Tree({ health }) {
  // health 0..1 → ukuran, warna, jumlah daun & buah
  const scale = lerp(0.5, 1, health);
  const hue = lerp(38, 152, health);
  const sat = lerp(45, 90, health);
  const light = lerp(42, 28, health);
  const fill = `hsl(${hue} ${sat}% ${light}%)`;
  const fill2 = `hsl(${hue} ${sat}% ${light + 8}%)`;
  const fruits = Math.round(health * 6);
  const pos = [[88, 78], [128, 70], [108, 104], [76, 112], [140, 108], [112, 62]];
  const fallen = Math.round((1 - health) * 5);
  const fpos = [[60, 214], [92, 220], [128, 216], [156, 221], [110, 224]];
  return (
    <svg viewBox="0 0 216 240" className="mx-auto h-56 w-56">
      <ellipse cx="108" cy="226" rx="78" ry="9" fill="#EEF0F2" />
      <rect x="99" y={lerp(150, 120, health)} width="18" height={lerp(76, 106, health)} rx="8" fill="#8A6A4F"
        style={{ transition: "all 600ms cubic-bezier(.22,1,.36,1)" }} />
      <g style={{ transformOrigin: "108px 150px", transform: `scale(${scale})`, transition: "transform 600ms cubic-bezier(.22,1,.36,1)" }}>
        <circle cx="70" cy="110" r="42" fill={fill} style={{ transition: "fill 600ms" }} />
        <circle cx="146" cy="110" r="42" fill={fill} style={{ transition: "fill 600ms" }} />
        <circle cx="108" cy="78" r="52" fill={fill2} style={{ transition: "fill 600ms" }} />
        <circle cx="108" cy="124" r="46" fill={fill} style={{ transition: "fill 600ms" }} />
      </g>
      {pos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i < fruits ? 6 : 0} fill="#F79009"
          style={{ transition: "r 500ms cubic-bezier(.34,1.56,.64,1)", transitionDelay: `${i * 60}ms` }} />
      ))}
      {fpos.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={i < fallen ? 7 : 0} ry={i < fallen ? 3.5 : 0} fill="#B9A27C"
          style={{ transition: "all 400ms" }} />
      ))}
    </svg>
  );
}

function Simulator() {
  const [mode, setMode] = useState("motor");
  const [km, setKm] = useState(12);
  const [ac, setAc] = useState(5);
  const [meat, setMeat] = useState(2);
  const [stream, setStream] = useState(3);
  const [plastic, setPlastic] = useState(4);

  const items = useMemo(() => {
    const f = MODES.find((m) => m.key === mode).f;
    return [
      { k: "Transportasi", v: km * f },
      { k: "Pendingin ruangan", v: ac * 0.9 },
      { k: "Daging", v: meat * 2.5 },
      { k: "Streaming", v: stream * 0.05 },
      { k: "Plastik sekali pakai", v: plastic * 0.03 },
    ];
  }, [mode, km, ac, meat, stream, plastic]);

  const dayKg = items.reduce((a, i) => a + i.v, 0);
  const yearT = (dayKg * 365) / 1000;
  const health = Math.max(0, Math.min(1, 1 - (yearT - 0.5) / 5.5));
  const trees = Math.ceil((yearT * 1000) / 21);
  const animT = useAnimatedNumber(yearT, 500);
  const maxV = Math.max(...items.map((i) => i.v), 0.1);

  const status = health > 0.75 ? "Taman subur" : health > 0.5 ? "Cukup lestari" : health > 0.3 ? "Mulai layu" : "Perlu dipulihkan";
  const sliders = [
    { label: "Jarak tempuh", unit: "km/hari", v: km, set: setKm, max: 60, icon: Car },
    { label: "Pendingin ruangan", unit: "jam/hari", v: ac, set: setAc, max: 12, icon: Snowflake },
    { label: "Porsi daging", unit: "porsi/hari", v: meat, set: setMeat, max: 4, icon: Beef },
    { label: "Streaming video", unit: "jam/hari", v: stream, set: setStream, max: 10, icon: Tv },
    { label: "Plastik sekali pakai", unit: "item/hari", v: plastic, set: setPlastic, max: 10, icon: ShoppingBag },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Taman yang kamu rawat</p>
            <h2 className="text-xl font-extrabold text-slate-900">{status}</h2>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold" style={{ color: EMERALD }}>{animT.toFixed(1)}</p>
            <p className="text-xs font-semibold text-slate-500">ton CO₂e / tahun</p>
          </div>
        </div>
        <Tree health={health} />
        <div className="mt-1 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
          <span className="text-xs font-semibold text-slate-500">Pohon untuk menyerap emisimu</span>
          <span className="text-sm font-extrabold text-slate-900">{trees} pohon / tahun</span>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-extrabold text-slate-900">Kebiasaan harianmu</h3>
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`rounded-xl px-1 py-2 text-[11px] font-bold transition-all ${mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="space-y-5">
          {sliders.map(({ label, unit, v, set, max, icon: Icon }) => (
            <div key={label}>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50"><Icon size={16} color={EMERALD} /></span>
                  {label}
                </span>
                <span className="text-sm font-extrabold text-slate-900">{v} <span className="text-xs font-medium text-slate-400">{unit}</span></span>
              </div>
              <input type="range" min="0" max={max} value={v} onChange={(e) => set(+e.target.value)}
                className="h-2 w-full cursor-pointer" style={{ accentColor: EMERALD }} aria-label={label} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-extrabold text-slate-900">Dari mana emisimu berasal</h3>
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.k}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-slate-600">{i.k}</span>
                <span className="font-bold text-slate-900">{i.v.toFixed(2)} kg/hari</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(i.v / maxV) * 100}%`, background: EMERALD, transition: "width 500ms cubic-bezier(.22,1,.36,1)" }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Angka bersifat estimasi edukatif dengan faktor emisi rata-rata. Bumi dan isinya milik Tuhan (Mzm. 24:1); kita hanya dipercaya merawatnya, dimulai dari kebiasaan kecil yang berulang setiap hari.
        </p>
      </Card>
    </div>
  );
}

/* ---------- TAB 3: ECO MISSIONS ---------- */
const VERSES = [
  { ref: "Mazmur 24:1", t: "Bumi dan segala isinya milik Tuhan. Kita merawatnya, bukan memilikinya." },
  { ref: "Kejadian 2:15", t: "Manusia ditempatkan di taman untuk mengusahakan dan memelihara, bukan sekadar memakai." },
  { ref: "Amsal 12:10", t: "Orang benar peduli pada kehidupan makhluk di sekitarnya." },
  { ref: "Roma 8:19-21", t: "Seluruh ciptaan turut menantikan pemulihan, dan manusia dipanggil mengambil bagian di dalamnya." },
];

const MISSIONS = [
  { id: 1, t: "Bawa tumbler dan tas belanja sendiri", d: "Kurangi plastik sekali pakai hari ini", p: 15, icon: ShoppingBag, v: "Mazmur 24:1", r: "Bumi dan isinya milik Tuhan. Membawa wadah sendiri adalah cara kecil mengakui bahwa kita hanya dipercaya merawatnya." },
  { id: 2, t: "Matikan lampu dan perangkat yang tak terpakai", d: "Hemat listrik di rumah dan kampus", p: 10, icon: Sparkles, v: "Lukas 16:10", r: "Kesetiaan diuji dalam perkara kecil yang tak dilihat orang, seperti sebuah lampu yang tidak lagi perlu menyala." },
  { id: 3, t: "Habiskan makananmu, tanpa sisa", d: "Syukuri berkat dengan tidak membuang pangan", p: 15, icon: Leaf, v: "Yohanes 6:12", r: "Yesus meminta potongan yang tersisa dikumpulkan agar tidak ada yang terbuang. Bersyukur berarti menghargai apa yang ada di piring." },
  { id: 4, t: "Bersihkan 20 email atau berkas yang tak perlu", d: "Tercentang otomatis begitu 20 item selesai dibersihkan di tab Bersih", p: 20, icon: Mail, v: "Lukas 12:15", r: "Hidup tidak ditentukan oleh banyaknya milik. Menimbun data yang tak terpakai juga bentuk keserakahan yang membebani bumi." },
  { id: 5, t: "Tanam atau siram satu tanaman", d: "Rawat satu tanaman, sekecil apa pun", p: 25, icon: Sprout, v: "Kejadian 2:15", r: "Manusia ditempatkan di taman untuk mengusahakan dan memelihara. Panggilan itu dimulai dari satu tanaman di dekatmu." },
  { id: 6, t: "Berjalan kaki atau naik angkutan umum", d: "Satu perjalanan tanpa kendaraan pribadi", p: 15, icon: Bike, v: "Mazmur 19:2", r: "Langit menceritakan kemuliaan Allah. Berjalan perlahan memberi kesempatan untuk benar-benar melihat dan bersyukur atas ciptaan." },
];

/* ---------- KALENDER GEREJA: TANTANGAN MUSIMAN ---------- */
function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function adventStart(y) {
  const xmas = new Date(y, 11, 25);
  const dow = xmas.getDay();
  return addDays(xmas, -(dow === 0 ? 7 : dow) - 21);
}
function seasonRanges(y) {
  const E = easterDate(y), ash = addDays(E, -46), pent = addDays(E, 49), adv = adventStart(y);
  return [
    { key: "natal", start: new Date(y, 0, 1), end: new Date(y, 0, 5) },
    { key: "epifani", start: new Date(y, 0, 6), end: addDays(ash, -1) },
    { key: "prapaskah", start: ash, end: addDays(E, -1) },
    { key: "paskah", start: E, end: addDays(pent, -1) },
    { key: "pentakosta", start: pent, end: new Date(y, 7, 31) },
    { key: "creation", start: new Date(y, 8, 1), end: new Date(y, 9, 4) },
    { key: "biasa", start: new Date(y, 9, 5), end: addDays(adv, -1) },
    { key: "advent", start: adv, end: new Date(y, 11, 24) },
    { key: "natal", start: new Date(y, 11, 25), end: new Date(y, 11, 31) },
  ];
}

const SEASONS = {
  advent: {
    name: "Adven", short: "Adven",
    theme: "Masa menanti dengan sederhana dan penuh harap, termasuk dalam cara kita memakai bumi.",
    verse: { ref: "Yesaya 11:6-9", t: "Nabi menggambarkan kedamaian ketika manusia dan makhluk lain hidup berdampingan tanpa saling merusak." },
    missions: [
      { t: "Kurangi satu belanja yang tidak perlu menjelang Natal", p: 40 },
      { t: "Buat hiasan Natal dari bahan bekas", p: 30 },
      { t: "Tanam atau rawat satu tanaman sebagai tanda penantian", p: 30 },
    ],
  },
  natal: {
    name: "Natal", short: "Natal",
    theme: "Allah hadir di dunia yang nyata. Rayakan dengan syukur, bukan dengan limbah.",
    verse: { ref: "Yohanes 1:14", t: "Firman menjadi manusia dan tinggal di antara kita, tanda bahwa dunia ciptaan ini berharga bagi Allah." },
    missions: [
      { t: "Habiskan makanan perayaan Natal keluargamu tanpa sisa", p: 40 },
      { t: "Pilih kado tanpa plastik atau bungkus ulang kertas bekas", p: 30 },
      { t: "Bagikan makanan atau pakaian layak pakai kepada sesama", p: 30 },
    ],
  },
  epifani: {
    name: "Epifani", short: "Epifani",
    theme: "Terang yang menyatakan diri. Belajar melihat Pencipta lewat ciptaan di sekitar kita.",
    verse: { ref: "Matius 2:9-10", t: "Orang-orang bijaksana dituntun oleh sebuah bintang, ciptaan yang menjadi penunjuk jalan menuju Kristus." },
    missions: [
      { t: "Amati satu bagian alam selama 10 menit tanpa ponsel", p: 40 },
      { t: "Bagikan satu pengetahuan lingkungan kepada temanmu", p: 30 },
      { t: "Jalan kaki atau naik angkutan umum untuk satu perjalanan", p: 30 },
    ],
  },
  prapaskah: {
    name: "Pra-Paska", short: "Pra-Paska",
    theme: "Masa berpuasa dan bertobat. Menahan diri agar ada yang bisa dibagikan kepada sesama dan bumi.",
    verse: { ref: "Yesaya 58:6-7", t: "Puasa yang dikehendaki Allah berujung pada keadilan: berbagi makanan dan perhatian kepada yang membutuhkan." },
    missions: [
      { t: "Puasa digital: hapus 50 berkas atau email yang tak perlu", p: 40 },
      { t: "Puasa daging selama satu hari", p: 30 },
      { t: "Salurkan hasil hematmu kepada sesama yang membutuhkan", p: 30 },
    ],
  },
  paskah: {
    name: "Paskah", short: "Paskah",
    theme: "Kehidupan baru yang dimulai dari tanah. Pemulihan juga menjangkau ciptaan.",
    verse: { ref: "Kolose 1:19-20", t: "Melalui Kristus Allah mendamaikan segala sesuatu dengan diri-Nya, termasuk ciptaan, bukan hanya manusia." },
    missions: [
      { t: "Tanam satu pohon atau tanaman baru sebagai tanda hidup baru", p: 40 },
      { t: "Perbaiki satu barang rusak daripada membeli yang baru", p: 30 },
      { t: "Pungut sampah di satu tempat umum", p: 30 },
    ],
  },
  pentakosta: {
    name: "Pentakosta", short: "Pentakosta",
    theme: "Roh yang memperbarui. Digerakkan untuk bertindak bersama komunitas.",
    verse: { ref: "Mazmur 104:30", t: "Roh Allah menciptakan dan memperbarui permukaan bumi, sumber pengharapan bagi pemulihan alam." },
    missions: [
      { t: "Ikut atau mulai kegiatan penghijauan bersama komunitasmu", p: 40 },
      { t: "Ganti satu barang sekali pakai dengan yang bisa dipakai ulang", p: 30 },
      { t: "Matikan semua perangkat yang tidak dipakai sepanjang hari", p: 30 },
    ],
  },
  creation: {
    name: "Masa Penciptaan", short: "Penciptaan",
    theme: "1 September sampai 4 Oktober. Umat di berbagai belahan dunia merayakan dan merawat ciptaan bersama.",
    verse: { ref: "Mazmur 104:24", t: "Bumi dipenuhi ciptaan Allah yang dijadikan dengan hikmat, dan semuanya layak dijaga." },
    missions: [
      { t: "Bersihkan satu area dari sampah bersama teman atau jemaat", p: 40 },
      { t: "Doakan ciptaan dan sebutkan satu hal dari alam yang kamu syukuri", p: 30 },
      { t: "Ajak satu orang memulai satu kebiasaan ramah lingkungan", p: 30 },
    ],
  },
  biasa: {
    name: "Masa Biasa", short: "Masa Biasa",
    theme: "Bertumbuh dalam kesetiaan sehari-hari, seperti pohon yang berbuah pada musimnya.",
    verse: { ref: "Mazmur 1:3", t: "Orang yang berakar pada firman Tuhan digambarkan seperti pohon di tepi aliran air yang berbuah pada waktunya." },
    missions: [
      { t: "Pilih satu kebiasaan ramah lingkungan dan jalani selama 7 hari", p: 40 },
      { t: "Tulis satu hal dari alam yang kamu syukuri hari ini", p: 30 },
      { t: "Kurangi satu plastik sekali pakai dalam rutinmu", p: 30 },
    ],
  },
};
const SEASON_ORDER = ["advent", "natal", "epifani", "prapaskah", "paskah", "pentakosta", "creation", "biasa"];
const SEASON_KEY = "myworld_season_v1";
function loadSeason() {
  try { return JSON.parse(localStorage.getItem(SEASON_KEY)) || {}; } catch (e) { return {}; }
}
const fmtDay = (d) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function SeasonChallenge({ season, setSeason }) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ranges = [...seasonRanges(t.getFullYear()), ...seasonRanges(t.getFullYear() + 1)];
  const current = ranges.find((r) => t >= r.start && t <= r.end);
  const [view, setView] = useState(current.key);
  const S = SEASONS[view];
  const o = ranges.find((r) => r.key === view && r.end >= t);
  const id = `${view}-${o.start.getFullYear()}`;
  const done = season[id] || [];
  const isNow = view === current.key;
  const gotPts = done.reduce((a, i) => a + S.missions[i].p, 0);
  const totalPts = S.missions.reduce((a, m) => a + m.p, 0);
  const complete = done.length === S.missions.length;
  const label = view === "natal" ? "25 Des – 5 Jan" : `${fmtDay(o.start)} – ${fmtDay(o.end)}`;
  const nxt = ranges.filter((r) => r.start > t).sort((a, b) => a.start - b.start)[0];
  const daysTo = (d) => Math.round((d - t) / 86400000);
  const badges = Object.entries(season)
    .filter(([k, v]) => v.length === 3 && SEASONS[k.split("-")[0]])
    .map(([k]) => `${SEASONS[k.split("-")[0]].name} ${k.split("-")[1]}`);

  const toggle = (i) => setSeason((prev) => {
    const set = new Set(prev[id] || []);
    set.has(i) ? set.delete(i) : set.add(i);
    return { ...prev, [id]: [...set] };
  });

  return (
    <Card>
      <p className="text-xs font-semibold text-slate-500">Tantangan tahun gerejawi</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold text-slate-900">{S.name}</h2>
        <span className="mt-1 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: isNow ? EMERALD : "#F2F4F7", color: isNow ? "#fff" : "#475467" }}>
          {isNow ? "Sedang berlangsung" : `Mulai ${fmtDay(o.start)}`}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-slate-400">{label}{!isNow && ` · ${daysTo(o.start)} hari lagi`}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{S.theme}</p>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {SEASON_ORDER.map((k) => (
          <button key={k} onClick={() => setView(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${view === k ? "text-white" : "bg-slate-100 text-slate-600"}`}
            style={view === k ? { background: EMERALD } : undefined}>
            {SEASONS[k].short}{k === current.key && view !== k ? " •" : ""}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-bold" style={{ color: EMERALD }}>{S.verse.ref}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{S.verse.t}</p>
        <p className="mt-1 text-[11px] text-slate-400">Parafrase. Rujuk Alkitab terjemahanmu untuk teks lengkap.</p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-500">Kemajuan musim ini</span>
          <span style={{ color: EMERALD }}>{gotPts}/{totalPts} poin</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${(gotPts / totalPts) * 100}%`, background: EMERALD, transition: "width 900ms cubic-bezier(.22,1,.36,1)" }} />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {S.missions.map((m, i) => {
          const on = done.includes(i);
          return (
            <button key={i} onClick={() => toggle(i)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${on ? "bg-emerald-50/70" : "bg-slate-50 hover:bg-slate-100"}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all"
                style={{ borderColor: on ? EMERALD : "#D0D5DD", background: on ? EMERALD : "#fff" }}>
                {on && <Check size={14} color="#fff" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>{m.t}</span>
                <span className="block text-[11px] font-bold" style={{ color: EMERALD }}>+{m.p} poin</span>
              </span>
            </button>
          );
        })}
      </div>

      {complete && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
          <Award size={22} color={EMERALD} />
          <p className="text-sm font-bold" style={{ color: EMERALD }}>Lencana {S.name} {o.start.getFullYear()} diraih</p>
        </div>
      )}
      {isNow && nxt && (
        <p className="mt-3 text-xs text-slate-400">Berikutnya: {SEASONS[nxt.key].name}, mulai {fmtDay(nxt.start)} ({daysTo(nxt.start)} hari lagi)</p>
      )}
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              <Award size={12} color={EMERALD} /> {b}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

const LEVELS = [
  { at: 0, name: "Benih" },
  { at: 60, name: "Tunas" },
  { at: 150, name: "Pohon muda" },
  { at: 300, name: "Pohon rimbun" },
  { at: 500, name: "Hutan kecil" },
];
const IMPACT_G = { 1: 30, 2: 90, 3: 150, 4: 0, 5: 60, 6: 200 }; // estimasi edukatif g CO2e per misi
const DAYS_KEY = "myworld_days_v1";
const HYG_KEY = "myworld_hygiene_v1";
function loadHyg() {
  try {
    const v = JSON.parse(localStorage.getItem(HYG_KEY));
    return { g: v?.g || 0, kb: v?.kb || 0, daily: v?.daily || {} };
  } catch (e) { return { g: 0, kb: 0, daily: {} }; }
}
const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE");

// Jam hidup: hari berganti otomatis (tengah malam, saat tab dibuka lagi, saat fokus kembali)
function useClock() {
  const calc = () => {
    const n = new Date();
    return { today: dayKey(n), msLeft: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n };
  };
  const [c, setC] = useState(calc);
  useEffect(() => {
    const tick = () => setC((p) => {
      const n = calc();
      return n.today === p.today && Math.floor(n.msLeft / 60000) === Math.floor(p.msLeft / 60000) ? p : n;
    });
    const iv = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, []);
  return c;
}
const fmtLeft = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60);
  return h ? `${h} jam ${m % 60} menit` : `${m} menit`;
};
function loadDays() {
  try { return JSON.parse(localStorage.getItem(DAYS_KEY)) || {}; } catch (e) { return {}; }
}
function stats(days, season = {}) {
  let pts = 0, g = 0;
  Object.entries(season).forEach(([k, idxs]) => {
    const S = SEASONS[k.split("-")[0]];
    if (S) idxs.forEach((i) => { pts += S.missions[i]?.p || 0; });
  });
  Object.values(days).forEach((ids) => ids.forEach((id) => {
    const m = MISSIONS.find((x) => x.id === id);
    if (m) { pts += m.p; g += IMPACT_G[id] || 0; }
  }));
  let streak = 0;
  const d = new Date();
  if (!(days[dayKey(d)] || []).length) d.setDate(d.getDate() - 1);
  while ((days[dayKey(d)] || []).length) { streak++; d.setDate(d.getDate() - 1); }
  return { pts, g, streak };
}

function Missions({ days, setDays, season, today, msLeft }) {
  const done = new Set(days[today] || []);
  const total = MISSIONS.reduce((a, m) => a + m.p, 0);
  const todayPts = MISSIONS.filter((m) => done.has(m.id)).reduce((a, m) => a + m.p, 0);
  const pct = Math.round((todayPts / total) * 100);
  const { pts, g, streak } = stats(days, season);
  const li = LEVELS.reduce((acc, l, i) => (pts >= l.at ? i : acc), 0);
  const next = LEVELS[li + 1];
  const lvlPct = next ? Math.round(((pts - LEVELS[li].at) / (next.at - LEVELS[li].at)) * 100) : 100;
  const animG = useAnimatedNumber(g, 600);
  const verse = VERSES[Number(today.slice(8)) % VERSES.length];

  const toggle = (id) => setDays((d) => {
    const cur = new Set(d[today] || []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    return { ...d, [today]: [...cur] };
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Perjalananmu menuju hutan kecil</p>
            <h2 className="text-xl font-extrabold text-slate-900">{LEVELS[li].name}</h2>
          </div>
          <p className="text-3xl font-extrabold" style={{ color: EMERALD }}>{pts}<span className="text-sm font-semibold text-slate-400"> poin</span></p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${lvlPct}%`, background: EMERALD, transition: "width 900ms cubic-bezier(.22,1,.36,1)" }} />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-500">
          {next ? `${next.at - pts} poin lagi menuju ${next.name}` : "Kamu sudah mencapai puncak: Penjaga Ciptaan"}
        </p>
        <div className="mt-4 flex items-start justify-between">
          {LEVELS.map((l, i) => (
            <div key={l.name} className="flex w-14 flex-col items-center gap-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors"
                style={{ borderColor: i <= li ? EMERALD : "#D0D5DD", background: i <= li ? EMERALD : "#fff" }}>
                {i <= li ? <Check size={15} color="#fff" strokeWidth={3} /> : <span className="text-[11px] font-bold text-slate-400">{l.at}</span>}
              </span>
              <span className={`text-center text-[10px] font-bold leading-tight ${i <= li ? "text-slate-800" : "text-slate-400"}`}>{l.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Flame size={14} color={EMERALD} /> Beruntun</p>
          <p className="mt-1 text-xl font-extrabold text-slate-900">{streak} <span className="text-sm font-semibold text-slate-400">hari</span></p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-semibold text-slate-500">Dampak total (estimasi)</p>
          <p className="mt-1 text-xl font-extrabold" style={{ color: EMERALD }}>{Math.round(animG)} <span className="text-sm font-semibold text-slate-400">g CO₂e</span></p>
        </Card>
      </div>

      <Card className="!p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-slate-900">Misi hari ini</p>
          <p className="text-sm font-extrabold" style={{ color: EMERALD }}>{pct}%</p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: EMERALD, transition: "width 900ms cubic-bezier(.22,1,.36,1)" }} />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-500">{done.size} dari {MISSIONS.length} misi selesai · misi baru muncul otomatis dalam {fmtLeft(msLeft)}</p>
      </Card>

      <Card className="!p-4">
        <p className="text-xs font-semibold text-slate-500">Renungan hari ini</p>
        <p className="mt-1 text-sm font-extrabold" style={{ color: EMERALD }}>{verse.ref}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{verse.t}</p>
        <p className="mt-2 text-[11px] text-slate-400">Parafrase. Rujuk Alkitab terjemahanmu untuk teks lengkap.</p>
      </Card>

      <div className="space-y-3">
        {MISSIONS.map(({ id, t, d, p, icon: Icon, v, r }, idx) => {
          const on = done.has(id);
          const isNext = !on && MISSIONS.find((m) => !done.has(m.id))?.id === id;
          return (
            <button key={id} onClick={() => toggle(id)}
              aria-pressed={on} className={`flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-[0_8px_30px_rgba(16,24,40,0.06)] transition-transform active:scale-[0.99] ${isNext ? "ring-2 ring-emerald-500/40" : ""}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors"
                style={{ background: on ? EMERALD : "#ECFDF3" }}>
                <Icon size={22} color={on ? "#fff" : EMERALD} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold tracking-wide" style={{ color: EMERALD }}>MISI {idx + 1}{isNext ? " · BERIKUTNYA" : on ? " · SELESAI" : ""}</span>
                <span className={`mt-0.5 block text-sm font-extrabold transition-colors ${on ? "text-slate-400 line-through" : "text-slate-900"}`}>{t}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{d}</span>
                <span className="mt-1 block text-xs font-bold" style={{ color: EMERALD }}>+{p} poin · {id === 4 ? "dampaknya dihitung di tab Bersih" : `hemat ±${IMPACT_G[id]} g CO₂e`}</span>
                <span className="mt-3 block rounded-2xl border-l-4 bg-emerald-50/60 px-3 py-2.5 transition-opacity"
                  style={{ borderColor: EMERALD, opacity: on ? 0.7 : 1 }}>
                  <span className="block text-[11px] font-bold" style={{ color: EMERALD }}>{v}</span>
                  <span className="mt-0.5 block text-xs italic leading-relaxed text-slate-700">{r}</span>
                </span>
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                style={{ borderColor: on ? EMERALD : "#D0D5DD", background: on ? EMERALD : "#fff" }}>
                {on && <Check size={15} color="#fff" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      {pct === 100 && (
        <Card className="flex items-center gap-3 !bg-emerald-50">
          <ShieldCheck size={24} color={EMERALD} />
          <p className="text-sm font-bold" style={{ color: EMERALD }}>Semua misi hari ini beres. Terima kasih sudah ikut merawat ciptaan. Misi baru hadir dalam {fmtLeft(msLeft)}.</p>
        </Card>
      )}
      <p className="text-center text-xs text-slate-500">Misi baru muncul otomatis tiap pergantian hari. Poin dan runtunmu tersimpan di perangkat ini.</p>
    </div>
  );
}

const TITLES = { hygiene: "Bersih Digital", sim: "Simulator Jejak", missions: "Misi Harian", season: "Yobel Bumi" };
const HygieneTab = memo(DigitalHygiene);
const SimulatorTab = memo(Simulator);
const SeasonTab = memo(SeasonChallenge);
const MissionsTab = memo(Missions);

/* ---------- APP SHELL ---------- */
const TABS = [
  { key: "hygiene", label: "Bersih", icon: Droplets },
  { key: "sim", label: "Simulasi", icon: TreePine },
  { key: "missions", label: "Misi", icon: ListChecks },
  { key: "season", label: "Yobel", icon: CalendarDays },
];

const AppHeader = memo(function AppHeader({ title, grams, pct }) {
  return (
    <header className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Logo size={48} />
        <div>
          <h1 className="text-lg font-extrabold leading-tight tracking-tight">MyWORLD</h1>
          <p className="text-xs font-medium text-slate-500">{title}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-[0_4px_14px_rgba(16,24,40,0.06)]" style={{ color: EMERALD }}>
          {grams} g hemat
        </span>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-[0_4px_14px_rgba(16,24,40,0.06)]">
          {pct}% misi
        </span>
      </div>
    </header>
  );
});

const TabBar = memo(function TabBar({ tab, onChange }) {
  return (
      <nav className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[28px] border border-white/70 bg-white/70 p-2 shadow-[0_12px_40px_rgba(16,24,40,0.14)] backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1">
          {TABS.map(({ key, label, icon: Icon }) => {
            const on = tab === key;
            return (
              <button key={key} onClick={() => onChange(key)} aria-current={on ? "page" : undefined}
                className="flex flex-col items-center gap-1 rounded-3xl py-2.5 transition-all"
                style={{ background: on ? EMERALD : "transparent" }}>
                <Icon size={21} color={on ? "#fff" : "#667085"} strokeWidth={on ? 2.4 : 2} />
                <span className={`text-[11px] font-bold ${on ? "text-white" : "text-slate-500"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
  );
});

function AboutSheet({ onClose }) {
  return (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={() => onClose()}>
          <div role="dialog" aria-modal="true" aria-label="Tentang MyWORLD" onClick={(e) => e.stopPropagation()}
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 text-sm leading-relaxed text-slate-600">
            <h2 className="text-lg font-extrabold text-slate-900">Tentang MyWORLD</h2>
            <p className="mt-1">Aplikasi kecil untuk merawat ciptaan lewat kebiasaan harian, dari kotak masuk sampai meja makan.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Privasi</h3>
            <p>Mode Gmail hanya membaca pengirim, subjek, dan ukuran email promosi dan sosial yang berusia lebih dari 30 hari. Isi pesan tidak dibaca. Tidak ada server MyWORLD yang menyimpan datamu. Misi, poin, dan statistik hanya tersimpan di browser perangkat ini, dan hilang bila data browser dihapus. Akses Gmail bisa dicabut kapan saja lewat pengaturan keamanan akun Google.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Sumber dan batas angka</h3>
            <p>Semua angka adalah estimasi edukatif untuk menumbuhkan kesadaran, bukan audit karbon. Faktor emisi memakai rata-rata yang lazim dipakai: sekitar 4 g CO₂e per email standar (Mike Berners-Lee), serta kisaran emisi listrik dan transportasi dari rujukan umum seperti IPCC dan IEA. Hasil nyata berbeda untuk tiap orang.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Mode contoh</h3>
            <p>Tanpa Gmail, aplikasi memakai data ilustrasi. Foto ganda, berkas unduhan, dan cache belum bisa diakses dari browser, jadi fitur itu masuk rencana pengembangan versi Android.</p>
            <p className="mt-4 text-xs text-slate-500">Renungan ayat adalah parafrase. Rujuk Alkitab terjemahanmu untuk teks lengkap.</p>
            <button onClick={() => onClose()} className="mt-5 w-full rounded-2xl py-3.5 text-base font-extrabold text-white" style={{ background: EMERALD }}>Tutup</button>
          </div>
        </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("hygiene");
  const [hyg, setHyg] = useState(loadHyg);
  const [days, setDays] = useState(loadDays);
  const { today, msLeft } = useClock();
  const [about, setAbout] = useState(false);
  const [season, setSeason] = useState(loadSeason);
  useEffect(() => {
    try { localStorage.setItem(SEASON_KEY, JSON.stringify(season)); } catch (e) { /* abaikan */ }
  }, [season]);
  useEffect(() => {
    try { localStorage.setItem(DAYS_KEY, JSON.stringify(days)); } catch (e) { /* abaikan */ }
  }, [days]);
  useEffect(() => {
    try { localStorage.setItem(HYG_KEY, JSON.stringify(hyg)); } catch (e) { /* abaikan */ }
  }, [hyg]);

  // Misi #4 tercentang otomatis saat total pembersihan hari ini mencapai 20 item
  const cleanedToday = hyg.daily[today] || 0;
  const prevCleaned = useRef(cleanedToday);
  useEffect(() => {
    if (cleanedToday >= 20 && prevCleaned.current < 20) {
      const k = dayKey();
      setDays((d) => ((d[k] || []).includes(4) ? d : { ...d, [k]: [...(d[k] || []), 4] }));
    }
    prevCleaned.current = cleanedToday;
  }, [cleanedToday]);

  const handleSaved = useCallback((g, kb, n) => setHyg((h) => {
    const k = dayKey();
    return { g: h.g + g, kb: h.kb + kb, daily: { ...h.daily, [k]: (h.daily[k] || 0) + n } };
  }), []);
  const { pct, missionG } = useMemo(() => {
    const done = new Set(days[today] || []);
    const total = MISSIONS.reduce((a, m) => a + m.p, 0);
    const got = MISSIONS.filter((m) => done.has(m.id)).reduce((a, m) => a + m.p, 0);
    return { pct: Math.round((got / total) * 100), missionG: stats(days, season).g };
  }, [days, season, today]);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      <div className="mx-auto max-w-md px-4 pb-32 pt-6">
        <AppHeader title={TITLES[tab]} grams={Math.max(0, hyg.g) + missionG} pct={pct} />

        <main>
          <div hidden={tab !== "hygiene"}><HygieneTab freedKb={hyg.kb} savedG={hyg.g} onSaved={handleSaved} /></div>
          <div hidden={tab !== "sim"}><SimulatorTab /></div>
          <div hidden={tab !== "season"}><SeasonTab season={season} setSeason={setSeason} /></div>
          <div hidden={tab !== "missions"}><MissionsTab days={days} setDays={setDays} season={season} today={today} msLeft={msLeft} /></div>
        </main>
        <button onClick={() => setAbout(true)} className="mx-auto mt-6 flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <Info size={13} /> Tentang, privasi, dan sumber angka
        </button>
      </div>

      <TabBar tab={tab} onChange={setTab} />
      {about && <AboutSheet onClose={() => setAbout(false)} />}
    </div>
  );
}
