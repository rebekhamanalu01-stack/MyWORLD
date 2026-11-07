import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import {
  Leaf, Info, Mail, Trash2, Check, Sprout, TreePine, ListChecks, RotateCcw, Flame, Award, MapPin, Wind, Waves, Layers,
  Car, Snowflake, Beef, Tv, ShoppingBag, Droplets, Bike, Sparkles, ShieldCheck,
  CloudRain, Sun, Cloud, Home,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  <div className={`rounded-[2rem] bg-white p-5 shadow-[0_8px_30px_rgba(16,24,40,0.06)] ${className}`} {...rest}>
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

/* ---------- LOGO: Bumi Tersenyum (datar, ringan, tanpa filter/animasi) ---------- */
const Logo = memo(function Logo({ size = 48 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Logo MyWORLD">
      <circle cx="24" cy="24" r="22" fill={EMERALD} />
      <path d="M8 18C10 11 18 8 22 11C24 14 19 17 20 20C21 23 15 24 12 22C9 21 7 21 8 18Z" fill="#A7F3D0" />
      <path d="M34 29C38 28 41 31 40 35C39 39 34 41 31 38C29 35 30 30 34 29Z" fill="#A7F3D0" />
      <circle cx="18" cy="26" r="2.2" fill="#fff" />
      <circle cx="30" cy="26" r="2.2" fill="#fff" />
      <path d="M17.5 31C20 35 27 35 29.5 31" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
});

/* ---------- TAB 1: SINKRON EMAIL (Gmail API) ---------- */
// Kosongkan = pemrosesan lokal. Isi dengan Client ID Google OAuth jika ingin sinkronisasi Gmail.
const CLIENT_ID = "";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CO2_PER_EMAIL_G = 4; // estimasi edukatif per email tersimpan

const SAMPLE = [
  { id: "e1", from: "PromoMart", subject: "Diskon 70% hanya malam ini", kb: 820, co2: 4, cat: "Email" },
  { id: "e2", from: "TechWeekly", subject: "Newsletter edisi #284", kb: 2100, co2: 4, cat: "Email" },
  { id: "e3", from: "SocialApp", subject: "Ada 9 notifikasi baru untukmu", kb: 310, co2: 4, cat: "Email" },
  { id: "f1", from: "Galeri", subject: "12 tangkapan layar ganda", kb: 3600, co2: 8, cat: "Foto" },
  { id: "f2", from: "Galeri", subject: "Foto beruntun dengan hasil serupa", kb: 5200, co2: 12, cat: "Foto" },
  { id: "b1", from: "Unduhan", subject: "Installer aplikasi lama", kb: 15400, co2: 15, cat: "Berkas" },
  { id: "b2", from: "Unduhan", subject: "PDF materi kuliah (salinan ganda)", kb: 8400, co2: 10, cat: "Berkas" },
  { id: "m1", from: "Grup chat", subject: "Video kiriman ulang dari tahun lalu", kb: 22000, co2: 25, cat: "Media chat" },
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

function DigitalHygieneBody({ freedKb, savedG, onSaved }) {
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
    setToken("sample"); setAccount("Pemrosesan Lokal"); setMails(SAMPLE); setSel(new Set()); setStatus("ready");
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50"><Mail size={30} color={EMERALD} /></div>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">Bersihkan jejak digitalmu</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {CLIENT_ID ? "MyWORLD hanya membaca pengirim, subjek, dan ukuran email promosi dan sosial yang berusia lebih dari 30 hari. Isi pesanmu tidak dibaca dan tidak dikirim ke server mana pun." : "Email lama, foto ganda, unduhan terlupakan, sampai cache aplikasi: semuanya ikut menyedot energi, di perangkat maupun di server. Yuk, rapikan."}
        </p>
        <button onClick={connect} disabled={status === "loading"}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(2,122,72,0.25)] transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: EMERALD }}>
          <Mail size={18} /> {status === "loading" ? "Memindai…" : CLIENT_ID ? "Hubungkan Gmail" : "Mulai pindai"}
        </button>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{CLIENT_ID ? "Email yang dibersihkan dipindahkan ke Sampah dan bisa dipulihkan selama 30 hari." : "Pemrosesan lokal: semua dihitung di perangkatmu, dan tidak ada berkas yang diubah atau dihapus."}</p>
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
          {done.n} item ({mb}) sudah dibersihkan, setara ±{Math.round(done.g)} g CO₂e yang tak lagi dibebankan ke server. Langkah kecil yang rutin dilakukan akan terasa dampaknya.
        </p>
        <p className="mt-3 max-w-xs text-xs text-slate-500">{token === "sample" ? "Pemrosesan lokal: tidak ada berkas di perangkatmu yang diubah atau dihapus." : "Email ada di Sampah Gmail dan bisa dipulihkan selama 30 hari."}</p>
        <button onClick={() => setDone(null)} className="mt-6 w-full rounded-full py-4 text-base font-extrabold text-white transition-transform active:scale-[0.98]" style={{ background: EMERALD }}>
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
          <p className="text-xs font-semibold text-slate-500">Emisi yang dihindari (estimasi)</p>
          <p className="mt-1 text-xl font-extrabold" style={{ color: EMERALD }}>{animG.toFixed(0)} <span className="text-sm font-semibold text-slate-400">g CO₂e</span></p>
        </Card>
      </div>

      <Card className="!p-2">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <h3 className="text-sm font-extrabold text-slate-900">Daftar sampah digital ({shown.length})</h3>
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50"><ShieldCheck size={26} color={EMERALD} /></div>
            <p className="mt-3 text-base font-extrabold text-slate-900">Sudah bersih semua</p>
            <p className="mt-1 text-sm text-slate-500">Tidak ada lagi yang perlu dirapikan. Server pun ikut lega.</p>
            <button onClick={() => load(token)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
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
                    className={`flex w-full items-center gap-3 rounded-full px-3 py-3 text-left transition-colors ${on ? "bg-emerald-50/70" : "hover:bg-slate-50"}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all"
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
            className="flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(2,122,72,0.25)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            style={{ background: EMERALD }}>
            <Trash2 size={18} /> {cleaning ? "Membersihkan…" : `Bersihkan ${sel.size || ""} ${noun}`}
          </button>
          <p className="text-center text-[11px] text-slate-400">{token === "sample" ? "Pemrosesan lokal: semua dihitung di perangkatmu, dan tidak ada berkas yang diubah atau dihapus." : "Email dipindahkan ke Sampah Gmail dan bisa dipulihkan selama 30 hari."}</p>
        </>
      )}
    </div>
  );
}

function CarbonBanner() {
  return (
    <section className="rounded-[2rem] p-5 text-white shadow-[0_12px_40px_rgba(2,122,72,0.22)]" style={{ background: EMERALD }}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
        <Info size={12} /> Tahukah kamu?
      </span>
      <p className="mt-3 text-sm font-medium leading-relaxed text-emerald-50">
        Setiap email yang kamu simpan, foto ganda, dan berkas lama tersimpan di server fisik yang menyala dan didinginkan 24 jam nonstop. Makin menumpuk, makin besar listrik dan emisi karbon yang dibutuhkan. Membersihkan yang tak perlu adalah cara kecil untuk ikut merawat bumi.
      </p>
    </section>
  );
}

function DigitalHygiene(props) {
  return (
    <div className="space-y-4">
      <CarbonBanner />
      <DigitalHygieneBody {...props} />
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
        <div className="mt-1 flex items-center justify-between rounded-full bg-slate-50 px-4 py-3">
          <span className="text-xs font-semibold text-slate-500">Pohon untuk menyerap emisimu</span>
          <span className="text-sm font-extrabold text-slate-900">{trees} pohon / tahun</span>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-extrabold text-slate-900">Kebiasaan harianmu</h3>
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-slate-100 p-1">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`rounded-full px-1 py-2 text-[11px] font-bold transition-all ${mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="space-y-5">
          {sliders.map(({ label, unit, v, set, max, icon: Icon }) => (
            <div key={label}>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50"><Icon size={16} color={EMERALD} /></span>
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
// Tempel teks Alkitab Terjemahan Baru (TB) persis seperti aslinya pada tiap ayat di bawah ini.
// Selama masih kosong, aplikasi hanya menampilkan rujukan ayatnya.
const AYAT_TB = {
  "Mazmur 24:1": "TUHANlah yang empunya bumi serta segala isinya, dan dunia serta yang diam di dalamnya.",
  "Kejadian 2:15": "",
  "Amsal 12:10": "",
  "Roma 8:19-21": "",
  "Lukas 16:10": "",
  "Yohanes 6:12": "",
  "Lukas 12:15": "",
  "Mazmur 19:2": "",
  "Imamat 25:23": "",
  "Ulangan 20:19": "",
  "Ayub 12:7-10": "",
  "Yesaya 24:4-5": "",
  "Matius 6:26": "",
  "Kolose 1:15-20": "",
  "Wahyu 11:18": "",
};

const VERSES = [
  { ref: "Mazmur 24:1", r: "Kita adalah penjaga, bukan pemilik, atas segala yang dipercayakan kepada kita." },
  { ref: "Kejadian 2:15", r: "Merawat bumi bukan tambahan, melainkan bagian dari panggilan sejak semula." },
  { ref: "Amsal 12:10", r: "Kepedulian kepada makhluk lain mencerminkan hati yang benar." },
  { ref: "Roma 8:19-21", r: "Pemulihan ciptaan adalah harapan bersama yang kita kerjakan lewat pilihan sehari-hari." },
  { ref: "Imamat 25:23", r: "Tanah tidak sepenuhnya milik kita. Kita hanyalah penumpang dan penggarap, jadi rawatlah agar layak diwariskan." },
  { ref: "Ulangan 20:19", r: "Bahkan di tengah perang, pohon buah dilindungi. Apalagi di masa damai, pohon layak kita jaga." },
  { ref: "Ayub 12:7-10", r: "Hewan, burung, dan bumi sendiri menjadi guru yang bersaksi tentang tangan Tuhan. Mari belajar mendengarkan mereka." },
  { ref: "Yesaya 24:4-5", r: "Ketika manusia merusak bumi, bumi pun berduka. Kerusakan alam adalah soal iman dan tanggung jawab, bukan sekadar teknis." },
  { ref: "Matius 6:26", r: "Tuhan memelihara burung-burung di udara. Jika Ia peduli pada mereka, kita pun terpanggil ikut menjaga rumah mereka." },
  { ref: "Kolose 1:15-20", r: "Kristus mendamaikan segala sesuatu, termasuk seluruh ciptaan. Karya penebusan-Nya mencakup bumi dan isinya." },
  { ref: "Yohanes 6:12", r: "Yesus meminta sisa makanan dikumpulkan agar tidak ada yang terbuang. Menghabiskan makanan adalah bentuk syukur." },
  { ref: "Lukas 12:15", r: "Hidup bukan ditentukan oleh banyaknya harta. Hidup sederhana dan tidak berlebihan menolong bumi bernapas lega." },
  { ref: "Lukas 16:10", r: "Setia dalam perkara kecil seperti membuang sampah pada tempatnya adalah latihan setia dalam perkara besar." },
  { ref: "Wahyu 11:18", r: "Tuhan akan membinasakan mereka yang membinasakan bumi. Merusak ciptaan adalah hal serius di hadapan-Nya." },
];


const MISSIONS = [
  { id: 1, t: "Bawa tumbler dan tas belanja sendiri", d: "Kurangi plastik sekali pakai hari ini", p: 15, icon: ShoppingBag },
  { id: 2, t: "Matikan lampu dan perangkat yang tak terpakai", d: "Hemat listrik di rumah dan kampus", p: 10, icon: Sparkles },
  { id: 3, t: "Habiskan makananmu, tanpa sisa", d: "Syukuri berkat dengan tidak membuang pangan", p: 15, icon: Leaf },
  { id: 4, t: "Bersihkan 20 email atau berkas yang tak perlu", d: "Tercentang otomatis begitu 20 item selesai dibersihkan di tab Beranda", p: 20, icon: Mail },
  { id: 5, t: "Tanam atau siram satu tanaman", d: "Rawat satu tanaman, sekecil apa pun", p: 25, icon: Sprout },
  { id: 6, t: "Berjalan kaki atau naik angkutan umum", d: "Satu perjalanan tanpa kendaraan pribadi", p: 15, icon: Bike },
];

/* ---------- TAB 4: PETA EKOLOGI (React Leaflet + OpenStreetMap) ---------- */
const GEO_CATS = [
  { key: "all", label: "Semua", icon: Layers },
  { key: "udara", label: "Udara", icon: Wind },
  { key: "air", label: "Air", icon: Waves },
  { key: "hutan", label: "Hutan", icon: TreePine },
  { key: "limbah", label: "Limbah", icon: Trash2 },
];
const STATUS_COLOR = { Kritis: "#D92D20", Waspada: "#F79009", Aman: EMERALD };
const GEO_POINTS = [
  // Titik simulasi edukatif untuk wilayah Tapanuli Utara (koordinat perkiraan, bukan hasil pengukuran sensor)
  { id: 1, name: "Pusat Kota Tarutung", cat: "udara", status: "Waspada", lat: 2.0167, lng: 98.9667, desc: "Asap kendaraan dan pembakaran sampah terbuka di jam sibuk membuat kualitas udara naik turun. Kurangi pakai motor untuk jarak dekat dan jangan bakar sampah." },
  { id: 2, name: "Sipoholon", cat: "udara", status: "Aman", lat: 2.0500, lng: 98.9300, desc: "Udara pegunungan yang relatif bersih dan sejuk dengan lalu lintas ringan. Pertahankan dengan menjaga pepohonan dan tidak membakar lahan." },
  { id: 3, name: "Hutan Siatas Barita", cat: "hutan", status: "Aman", lat: 2.0000, lng: 99.0000, desc: "Kawasan hutan dan perbukitan yang masih rimbun. Tutupan pohonnya menahan longsor, menjaga mata air, dan menyimpan karbon." },
  { id: 4, name: "Hutan Adiankoting", cat: "hutan", status: "Aman", lat: 1.9700, lng: 98.9000, desc: "Tegakan hutan dan kebun campuran yang masih terjaga di lereng. Menanam pohon pelindung membantu mempertahankan tanah dan sumber air." },
  { id: 5, name: "Lereng Gundul Adiankoting", cat: "hutan", status: "Kritis", lat: 1.9450, lng: 98.8700, desc: "Titik simulasi lereng yang pohonnya banyak dibuka. Tanah mudah longsor saat hujan deras dan lapisan tanah suburnya terbawa air." },
  { id: 6, name: "Aek Sigeaon, Tarutung", cat: "air", status: "Waspada", lat: 2.0100, lng: 98.9750, desc: "Limbah rumah tangga dan sampah yang terbuang ke sungai membuat air keruh di beberapa ruas. Pilah sampah dan jangan buang ke aliran sungai." },
  { id: 7, name: "Sumber Mata Air Siatas Barita", cat: "air", status: "Aman", lat: 2.0250, lng: 98.9900, desc: "Mata air di kawasan berhutan yang masih jernih. Hutan di hulu adalah kunci agar debit dan kualitas airnya tetap terjaga." },
  { id: 8, name: "Hilir Sungai Sipoholon", cat: "air", status: "Kritis", lat: 2.0650, lng: 98.9200, desc: "Titik simulasi aliran dengan penumpukan sampah plastik dan limbah ternak yang menurunkan kualitas air bagi warga di hilir." },
  { id: 9, name: "Pasar Tarutung", cat: "limbah", status: "Kritis", lat: 2.0200, lng: 98.9600, desc: "Sampah organik dan plastik pasar menumpuk cepat dan sering terbuang sembarangan. Pemilahan serta pengomposan sisa sayur bisa mengurangi timbunan." },
  { id: 10, name: "Permukiman Sipoholon", cat: "limbah", status: "Waspada", lat: 2.0400, lng: 98.9450, desc: "Pengelolaan sampah rumah tangga belum merata sehingga sebagian dibakar atau dibuang ke kebun. Mulai dari memilah sampah organik dan anorganik." },
  // Titik simulasi edukatif di kota-kota besar, agar pengguna dari luar Tapanuli Utara tetap melihat data di sekitar mereka
  { id: 11, name: "Bundaran HI, Jakarta Pusat", cat: "udara", status: "Kritis", lat: -6.1950, lng: 106.8230, desc: "Titik simulasi kawasan padat kendaraan dengan polusi udara tinggi pada jam sibuk. Naik transportasi umum, bersepeda, atau berjalan kaki membantu menurunkan emisi." },
  { id: 12, name: "Taman Menteng, Jakarta Pusat", cat: "hutan", status: "Aman", lat: -6.1960, lng: 106.8350, desc: "Ruang hijau kota dengan pepohonan rindang yang membantu menyerap polutan dan menurunkan suhu sekitar. Taman seperti ini perlu dijaga dan diperbanyak." },
  { id: 13, name: "Sungai Deli, Medan", cat: "air", status: "Kritis", lat: 3.5750, lng: 98.6800, desc: "Titik simulasi aliran sungai kota dengan sampah plastik dan limbah rumah tangga yang menumpuk. Jangan buang sampah ke sungai dan pilah sampah dari rumah." },
  { id: 14, name: "Hulu Citarum, Dayeuhkolot, Bandung", cat: "air", status: "Waspada", lat: -6.9850, lng: 107.6280, desc: "Titik simulasi aliran sungai yang menerima limbah domestik dan sampah dari permukiman padat. Pengelolaan sampah di tingkat rumah tangga sangat menentukan kualitas airnya." },
  { id: 15, name: "Hutan Kota Babakan Siliwangi, Bandung", cat: "hutan", status: "Aman", lat: -6.8900, lng: 107.6070, desc: "Hutan kota yang masih rimbun di tengah kawasan padat. Pepohonannya menjaga udara tetap sejuk dan menjadi tempat resapan air hujan." },
  { id: 16, name: "Mangrove Wonorejo, Surabaya", cat: "hutan", status: "Waspada", lat: -7.3050, lng: 112.8330, desc: "Titik simulasi kawasan mangrove pesisir yang menahan abrasi, tetapi terancam sampah kiriman dan alih fungsi lahan. Menanam dan menjaga mangrove melindungi pantai." },
  { id: 17, name: "Sekitar TPA Benowo, Surabaya", cat: "limbah", status: "Kritis", lat: -7.2300, lng: 112.6350, desc: "Titik simulasi kawasan pengolahan sampah dengan timbunan besar dan potensi bau serta pencemaran. Mengurangi sampah dari sumbernya adalah langkah paling efektif." },
];
const PIN_ICONS = Object.fromEntries(Object.entries(STATUS_COLOR).map(([k, c]) => [k, L.divIcon({
  className: "",
  html: `<span style="display:block;width:24px;height:24px;border-radius:9999px;background:${c};border:3px solid #fff;box-shadow:0 3px 10px rgba(16,24,40,.35)"></span>`,
  iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14],
})]));

const USER_ICON = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.2),0 3px 10px rgba(16,24,40,.35)"></span>',
  iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -12],
});
const DEFAULT_CENTER = [2.0031, 98.9640]; // Tapanuli Utara
const DEFAULT_ZOOM = 11; // pas untuk Tarutung, Sipoholon, Adiankoting, dan Siatas Barita
const USER_ZOOM = 12; // zoom saat peta dipusatkan ke lokasi pengguna

/* ---------- Titik simulasi dinamis: dibangkitkan hanya di sekitar area yang sedang dilihat ---------- */
const SIM_NAMES = {
  udara: ["Stasiun Pantau Udara Lokal", "Titik Pantau Debu Jalan"],
  air: ["Area Aliran Sungai", "Titik Pantau Air Permukaan"],
  hutan: ["Titik Resapan Kota", "Area Tutupan Pohon"],
  limbah: ["Titik Penumpukan Sampah", "Area Pengumpulan Sampah Warga"],
};
const SIM_DESC = {
  udara: "Titik simulasi kualitas udara. Kendaraan dan pembakaran terbuka biasanya menjadi penyumbang utama polusi di area seperti ini.",
  air: "Titik simulasi kualitas air. Sampah dan limbah rumah tangga di sekitar aliran dapat menurunkan kejernihan air.",
  hutan: "Titik simulasi tutupan hijau. Pohon dan lahan resapan membantu menyerap karbon dan menahan air hujan.",
  limbah: "Titik simulasi pengelolaan sampah. Pemilahan di sumber membantu mengurangi timbunan di area seperti ini.",
};
const SIM_STATUS = ["Aman", "Waspada", "Kritis"];
const SIM_MAX = 5; // batas tetap agar peta tetap ringan
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let simSeq = 0;
function genSimPoints(center) {
  const n = 3 + Math.floor(Math.random() * (SIM_MAX - 2)); // 3 sampai 5 titik
  const cats = Object.keys(SIM_NAMES);
  return Array.from({ length: n }, () => {
    const cat = pick(cats);
    return {
      id: `sim-${++simSeq}`, sim: true, cat, name: pick(SIM_NAMES[cat]), status: pick(SIM_STATUS), desc: SIM_DESC[cat],
      lat: center.lat + (Math.random() - 0.5) * 0.1, // +/- 0,05 derajat
      lng: center.lng + (Math.random() - 0.5) * 0.1,
    };
  });
}
const SIM_ICONS = Object.fromEntries(Object.entries(STATUS_COLOR).map(([k, c]) => [k, L.divIcon({
  className: "",
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#fff;border:4px solid ${c};box-shadow:0 3px 10px rgba(16,24,40,.25)"></span>`,
  iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12],
})]));

// Setiap peta selesai digeser, titik simulasi lama ditimpa titik baru di sekitar pusat peta
function SimPoints({ onChange }) {
  useMapEvents({ moveend: (e) => onChange(genSimPoints(e.target.getCenter())) });
  return null;
}

function MapSync({ active, userPos }) {
  const map = useMap();
  const lat = userPos ? userPos.lat : null;
  const lng = userPos ? userPos.lng : null;
  // Setiap kali tab Peta dibuka (atau lokasi pengguna baru tersedia), pusatkan ke lokasi pengguna.
  // Jika lokasi belum ada atau ditolak, gunakan DEFAULT_CENTER (Tapanuli Utara) sebagai fallback.
  useEffect(() => {
    if (!active) return;
    map.invalidateSize();
    if (lat !== null && lng !== null) map.setView([lat, lng], USER_ZOOM);
    else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }, [map, active, lat, lng]);
  return null;
}

function EcoMap({ active, userPos }) {
  const [cat, setCat] = useState("all");
  const points = useMemo(() => (cat === "all" ? GEO_POINTS : GEO_POINTS.filter((p) => p.cat === cat)), [cat]);
  const [sim, setSim] = useState([]);
  const simShown = useMemo(() => (cat === "all" ? sim : sim.filter((p) => p.cat === cat)), [sim, cat]);
  const allShown = useMemo(() => [...points, ...simShown], [points, simShown]);
  const count = (k) => (k === "all" ? GEO_POINTS.length + sim.length : GEO_POINTS.filter((p) => p.cat === k).length + sim.filter((p) => p.cat === k).length);
  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {GEO_CATS.map(({ key, label, icon: Icon }) => {
          const on = cat === key;
          return (
            <button key={key} onClick={() => setCat(key)} aria-pressed={on}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold shadow-[0_4px_14px_rgba(16,24,40,0.06)] transition-colors ${on ? "text-white" : "bg-white text-slate-600"}`}
              style={on ? { background: EMERALD } : undefined}>
              <Icon size={14} /> {label}
              <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{count(key)}</span>
            </button>
          );
        })}
      </div>

      <div className="isolate overflow-hidden rounded-[2rem] bg-white shadow-[0_8px_30px_rgba(16,24,40,0.06)] [&_.leaflet-popup-content-wrapper]:rounded-[1.5rem] [&_.leaflet-popup-content-wrapper]:shadow-[0_8px_30px_rgba(16,24,40,0.18)] [&_.leaflet-popup-content]:m-4">
        <MapContainer center={userPos ? [userPos.lat, userPos.lng] : DEFAULT_CENTER} zoom={userPos ? USER_ZOOM : DEFAULT_ZOOM} scrollWheelZoom={false} className="h-[26rem] w-full">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapSync active={active} userPos={userPos} />
          <SimPoints onChange={setSim} />
          {userPos && (
            <Marker position={[userPos.lat, userPos.lng]} icon={USER_ICON}>
              <Popup><div className="text-sm font-extrabold text-slate-900">Lokasi Anda</div></Popup>
            </Marker>
          )}
          {points.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={PIN_ICONS[p.status]}>
              <Popup>
                <div className="min-w-[200px]">
                  <div className="text-sm font-extrabold text-slate-900">{p.name}</div>
                  <span className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: STATUS_COLOR[p.status] }}>{p.status}</span>
                  <div className="mt-2 text-xs leading-relaxed text-slate-600">{p.desc}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {simShown.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={SIM_ICONS[p.status]}>
              <Popup>
                <div className="min-w-[200px]">
                  <div className="text-sm font-extrabold text-slate-900">{p.name}</div>
                  <div className="mt-1.5 flex gap-1.5">
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: STATUS_COLOR[p.status] }}>{p.status}</span>
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">Titik simulasi</span>
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-slate-600">{p.desc}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {k} · {allShown.filter((p) => p.status === k).length}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Ketuk penanda untuk melihat detail lokasi. Titik dan status pada peta ini adalah simulasi edukatif untuk Tapanuli Utara dan beberapa kota besar (Jakarta, Medan, Bandung, Surabaya), dengan koordinat perkiraan. Belum terhubung ke sensor atau instansi resmi. Penanda bercincin kosong adalah titik simulasi yang dibangkitkan otomatis (3 sampai 5 titik) di sekitar area yang sedang kamu lihat, dan diganti setiap peta digeser.</p>
      </Card>
    </div>
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
function stats(days) {
  let pts = 0, g = 0;
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

/* ---------- CUACA (Open-Meteo, tanpa API key) ---------- */
// Cuaca dan kualitas udara berasal dari model Open-Meteo, bukan sensor resmi.
function useWeather(pos) {
  const lat = pos ? pos.lat : DEFAULT_CENTER[0];
  const lng = pos ? pos.lng : DEFAULT_CENTER[1];
  const [w, setW] = useState({ status: "loading", data: null });
  useEffect(() => {
    let off = false;
    setW({ status: "loading", data: null });
    const wx = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,uv_index&timezone=auto`;
    const aq = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi`;
    Promise.allSettled([fetch(wx).then((r) => r.json()), fetch(aq).then((r) => r.json())]).then(([a, b]) => {
      if (off) return;
      const c = a.status === "fulfilled" ? a.value?.current : null;
      if (!c || typeof c.temperature_2m !== "number") { setW({ status: "error", data: null }); return; }
      const aqi = b.status === "fulfilled" ? b.value?.current?.us_aqi : null;
      setW({ status: "ready", data: { temp: c.temperature_2m, rain: c.precipitation || 0, code: c.weather_code, uv: c.uv_index, aqi: typeof aqi === "number" ? aqi : null } });
    });
    return () => { off = true; };
  }, [lat, lng]);
  return w;
}

/* ---------- NAMA TEMPAT (Nominatim / OpenStreetMap), di-cache agar hemat permintaan ---------- */
const PLACE_KEY = "myworld_place_v1";
function readPlaceCache() {
  try { return JSON.parse(localStorage.getItem(PLACE_KEY)) || {}; } catch (e) { return {}; }
}
function usePlaceName(pos) {
  const [name, setName] = useState(null);
  const lat = pos ? pos.lat : null;
  const lng = pos ? pos.lng : null;
  useEffect(() => {
    if (lat === null || lng === null) { setName(null); return; }
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`; // ketelitian ±110 m
    const cached = readPlaceCache()[key];
    if (cached) { setName(cached); return; }
    const ctrl = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=id&lat=${lat}&lon=${lng}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const a = j?.address || {};
        const n = a.village || a.suburb || a.neighbourhood || a.hamlet || a.town || a.city_district || a.city || a.municipality || a.county || null;
        if (!n) return;
        setName(n);
        try {
          let c = readPlaceCache();
          if (Object.keys(c).length > 20) c = {};
          c[key] = n;
          localStorage.setItem(PLACE_KEY, JSON.stringify(c));
        } catch (e) { /* abaikan */ }
      })
      .catch(() => { /* gagal: tetap memakai "lokasimu" */ });
    return () => ctrl.abort();
  }, [lat, lng]);
  return name;
}

const isRainy = (d) => d.rain > 0 || (d.code >= 51 && d.code <= 99);

function weatherLabel(d) {
  const c = d.code;
  if (c === 0) return "Cerah";
  if (c === 1 || c === 2) return "Cerah berawan";
  if (c === 3) return "Berawan";
  if (c === 45 || c === 48) return "Berkabut";
  if (c >= 95) return "Badai petir";
  if (c >= 80) return "Hujan deras";
  if (c >= 61) return "Hujan";
  if (c >= 51) return "Gerimis";
  return isRainy(d) ? "Hujan" : "Berawan";
}

// Satu kalimat saran, menyesuaikan cuaca di lokasi saat ini
function weatherAdvice(d, place) {
  if (d.aqi !== null && d.aqi > 100)
    return `Udara kurang sehat di ${place}. Kurangi motor untuk jarak dekat, jangan bakar sampah, dan pakai masker bila perlu keluar.`;
  if (isRainy(d))
    return `Sedang hujan di ${place}. Tampung air hujan untuk menyiram tanaman dan jemur pakaian di dalam ruangan, tanpa mesin pengering.`;
  if (d.temp >= 30)
    return `Cuaca panas di ${place}. Jaga suhu pendingin ruangan tetap efisien di 25–26°C dan hindari penggunaan plastik sekali pakai hari ini.`;
  if (d.temp <= 24)
    return `Cuaca sejuk di ${place}. Cukup buka jendela atau pakai kipas tanpa AC, hemat listrik sekaligus menekan emisi.`;
  return `Cuaca bersahabat di ${place}. Jemur pakaian di bawah matahari, berjalan kaki untuk jarak dekat, dan bawa tumbler sendiri.`;
}

function WeatherCard({ pos, onNavigate }) {
  const { status, data } = useWeather(pos);
  const placeName = usePlaceName(pos);
  if (status === "loading") return <Card className="!p-4"><p className="text-xs font-medium text-slate-500">Memuat cuaca…</p></Card>;
  if (status === "error") return <Card className="!p-4"><p className="text-xs font-medium text-slate-500">Cuaca belum bisa dimuat. Periksa koneksi internet, lalu buka ulang aplikasi ini.</p></Card>;

  const place = pos ? placeName || "lokasimu" : "Tarutung";
  const Icon = isRainy(data) ? CloudRain : data.code <= 1 ? Sun : Cloud;

  return (
    <Card className="bg-gradient-to-br from-blue-50/50 to-white !p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold leading-snug text-slate-900">
          {weatherLabel(data)} di {place}, {Math.round(data.temp)}°C
        </h2>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_2px_8px_rgba(16,24,40,0.08)]">
          <Icon size={22} color={EMERALD} />
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{weatherAdvice(data, place)}</p>

      <div className="mt-4 flex gap-2">
        <button onClick={() => onNavigate?.("map")}
          className="rounded-full px-4 py-2 text-xs font-extrabold text-white transition-transform active:scale-[0.97]"
          style={{ background: EMERALD }}>
          Lihat Peta
        </button>
        <button onClick={() => onNavigate?.("missions")}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 transition-transform active:scale-[0.97]">
          Misi Ekologi
        </button>
      </div>
    </Card>
  );
}

function Missions({ days, setDays, today, msLeft }) {
  const done = new Set(days[today] || []);
  const total = MISSIONS.reduce((a, m) => a + m.p, 0);
  const todayPts = MISSIONS.filter((m) => done.has(m.id)).reduce((a, m) => a + m.p, 0);
  const pct = Math.round((todayPts / total) * 100);
  const { pts, g, streak } = stats(days);
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
        {AYAT_TB[verse.ref] && <p className="mt-2 font-serif text-[15px] italic leading-relaxed text-slate-800">“{AYAT_TB[verse.ref]}”</p>}
        <p className={`text-[11px] font-bold ${AYAT_TB[verse.ref] ? "mt-1.5" : "mt-2"}`} style={{ color: EMERALD }}>{AYAT_TB[verse.ref] ? "— " : ""}{verse.ref} (TB)</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{verse.r}</p>
      </Card>

      <div className="space-y-3">
        {MISSIONS.map(({ id, t, d, p, icon: Icon }) => {
          const on = done.has(id);
          const isNext = !on && MISSIONS.find((m) => !done.has(m.id))?.id === id;
          return (
            <button key={id} onClick={() => toggle(id)}
              aria-pressed={on} className={`flex w-full items-center gap-4 rounded-[2rem] bg-white p-4 text-left shadow-[0_8px_30px_rgba(16,24,40,0.06)] transition-transform active:scale-[0.99] ${isNext ? "ring-2 ring-emerald-500/40" : ""}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors"
                style={{ background: on ? EMERALD : "#ECFDF3" }}>
                <Icon size={22} color={on ? "#fff" : EMERALD} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-extrabold transition-colors ${on ? "text-slate-400 line-through" : "text-slate-900"}`}>{t}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{d}</span>
                <span className="mt-1 block text-xs font-bold" style={{ color: EMERALD }}>+{p} poin · {id === 4 ? "dampaknya dihitung di tab Beranda" : `hemat ±${IMPACT_G[id]} g CO₂e`}</span>
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

const TITLES = { home: "Beranda", sim: "Simulator Jejak", missions: "Misi Harian", map: "Peta Ekologi" };
const HygieneTab = memo(DigitalHygiene);
const SimulatorTab = memo(Simulator);
const MapTab = memo(EcoMap);
const MissionsTab = memo(Missions);

/* ---------- APP SHELL ---------- */
const TABS = [
  { key: "home", label: "Beranda", icon: Home },
  { key: "sim", label: "Simulasi", icon: TreePine },
  { key: "missions", label: "Misi", icon: ListChecks },
  { key: "map", label: "Peta Ekologi", icon: MapPin },
];

const AppHeader = memo(function AppHeader({ title, grams, pct }) {
  return (
    <header className="mb-5 flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo size={40} />
        <div className="min-w-0">
          <h1 className="flex items-end leading-none" aria-label="MyWORLD">
            <span className="bg-gradient-to-r from-emerald-600 to-cyan-500 bg-clip-text pb-1 pr-1 text-[0.95rem] font-normal tracking-normal text-transparent"
              style={{ fontFamily: "'Pacifico', 'Dancing Script', cursive" }}>MyWORLD</span>
            <span aria-hidden="true" className="mb-[0.45rem] ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "radial-gradient(circle at 35% 35%, #FFD84D, #FB923C)" }} />
          </h1>
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
      <nav className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-full border border-white/70 bg-white/70 p-2 shadow-[0_12px_40px_rgba(16,24,40,0.14)] backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1">
          {TABS.map(({ key, label, icon: Icon }) => {
            const on = tab === key;
            return (
              <button key={key} onClick={() => onChange(key)} aria-current={on ? "page" : undefined}
                className="flex flex-col items-center gap-1 rounded-full py-2.5 transition-all"
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
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-6 text-sm leading-relaxed text-slate-600">
            <h2 className="text-lg font-extrabold text-slate-900">Tentang MyWORLD</h2>
            <p className="mt-1">Aplikasi kecil untuk merawat ciptaan lewat kebiasaan harian, dari kotak masuk sampai meja makan.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Privasi</h3>
            <p>Mode Gmail hanya membaca pengirim, subjek, dan ukuran email promosi dan sosial yang berusia lebih dari 30 hari. Isi pesan tidak dibaca. Tidak ada server MyWORLD yang menyimpan datamu. Misi, poin, dan statistik hanya tersimpan di browser perangkat ini, dan hilang bila data browser dihapus. Akses Gmail bisa dicabut kapan saja lewat pengaturan keamanan akun Google.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Sumber dan batas angka</h3>
            <p>Semua angka adalah estimasi edukatif untuk menumbuhkan kesadaran, bukan audit karbon. Faktor emisi memakai rata-rata yang lazim dipakai: sekitar 4 g CO₂e per email standar (Mike Berners-Lee), serta kisaran emisi listrik dan transportasi dari rujukan umum seperti IPCC dan IEA. Hasil nyata berbeda untuk tiap orang.</p>
            <p className="mt-2">Data cuaca dan kualitas udara berasal dari Open-Meteo.com (lisensi CC BY 4.0). Angkanya hasil model, bukan sensor resmi. Nama tempat berasal dari OpenStreetMap (Nominatim), © kontributor OpenStreetMap. Koordinat lokasimu dikirim ke Open-Meteo dan OpenStreetMap hanya untuk cuaca dan nama tempat.</p>
            <h3 className="mt-4 font-extrabold text-slate-900">Pemrosesan Lokal</h3>
            <p>Tanpa sambungan Gmail, data diproses di perangkatmu tanpa mengirim apa pun ke server. Pemindaian berkas di perangkat (foto ganda, unduhan, cache) belum bisa dilakukan dari browser dan masuk rencana pengembangan versi Android. Titik pada Peta Ekologi adalah simulasi edukatif wilayah Tapanuli Utara, bukan data sensor atau instansi resmi.</p>
            <p className="mt-4 text-xs text-slate-500">Kutipan ayat memakai Alkitab Terjemahan Baru (TB), © Lembaga Alkitab Indonesia.</p>
            <button onClick={() => onClose()} className="mt-5 w-full rounded-full py-3.5 text-base font-extrabold text-white" style={{ background: EMERALD }}>Tutup</button>
          </div>
        </div>
  );
}

export default function App() {
  // Tab aktif disimpan di URL hash, jadi saat halaman di-refresh tetap di tab yang sama
  const [tab, setTabState] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return TABS.some((t) => t.key === h) ? h : "home";
  });
  const setTab = useCallback((k) => {
    setTabState(k);
    try { window.history.replaceState(null, "", `#${k}`); } catch (e) { /* abaikan */ }
  }, []);
  const [hyg, setHyg] = useState(loadHyg);
  const [days, setDays] = useState(loadDays);
  const { today, msLeft } = useClock();
  const [userPos, setUserPos] = useState(null);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { /* ditolak atau gagal: tetap memakai koordinat bawaan */ },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, []);
  const [about, setAbout] = useState(false);
  // Muat font Nunito dari Google Fonts
  useEffect(() => {
    if (document.getElementById("nunito-font")) return;
    const link = document.createElement("link");
    link.id = "nunito-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pacifico&family=Dancing+Script:wght@600;700&display=swap";
    document.head.appendChild(link);
  }, []);
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
    return { pct: Math.round((got / total) * 100), missionG: stats(days).g };
  }, [days, today]);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-slate-900" style={{ fontFamily: "'Nunito', sans-serif" }}>

      <div className="mx-auto max-w-md px-4 pb-36 pt-6">
        <AppHeader title={TITLES[tab]} grams={Math.max(0, hyg.g) + missionG} pct={pct} />

        <main>
          <div hidden={tab !== "home"} className="space-y-4">
            <WeatherCard pos={userPos} onNavigate={setTab} />
            <HygieneTab freedKb={hyg.kb} savedG={hyg.g} onSaved={handleSaved} />
          </div>
          <div hidden={tab !== "sim"}><SimulatorTab /></div>
          <div hidden={tab !== "map"}><MapTab active={tab === "map"} userPos={userPos} /></div>
          <div hidden={tab !== "missions"}><MissionsTab days={days} setDays={setDays} today={today} msLeft={msLeft} /></div>
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
