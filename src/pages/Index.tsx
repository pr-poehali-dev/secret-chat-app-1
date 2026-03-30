import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

const CHAT_URL   = "https://functions.poehali.dev/bf1bcf72-1610-4761-87b0-400e0c3a9757";
const UPLOAD_URL = "https://functions.poehali.dev/06905f05-8fd9-428b-8c7e-2d4368d57513";
const POLL_INTERVAL = 3000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: number;
  from_id: string;
  to_id: string;
  text: string | null;
  ts: number;
  media_url?: string | null;
  media_type?: string | null;
}

interface Contact { id: string; }
type Tab = "chats" | "contacts" | "profile" | "settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId(): string {
  const n = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 9)}`;
}
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function playBeep() {
  try {
    interface W extends Window { webkitAudioContext: typeof AudioContext; }
    const AC = window.AudioContext || (window as unknown as W).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 660; osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
  } catch (e) { void e; }
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.2, speed: Math.random() * 0.25 + 0.04,
      opacity: Math.random(), delta: (Math.random() - 0.5) * 0.015,
    }));
    const digits = Array.from({ length: 25 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      speed: Math.random() * 1.2 + 0.4, char: Math.floor(Math.random() * 10).toString(),
      opacity: Math.random() * 0.12 + 0.02, timer: 0,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        s.opacity += s.delta; if (s.opacity > 1 || s.opacity < 0) s.delta *= -1;
        s.y += s.speed; if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,255,${Math.abs(s.opacity) * 0.5})`; ctx.fill();
      });
      digits.forEach((d) => {
        d.timer++; if (d.timer > 55) { d.char = Math.floor(Math.random() * 10).toString(); d.timer = 0; }
        d.y += d.speed; if (d.y > canvas.height) { d.y = 0; d.x = Math.random() * canvas.width; }
        ctx.font = "10px 'Share Tech Mono'"; ctx.fillStyle = `rgba(0,255,128,${d.opacity})`;
        ctx.fillText(d.char, d.x, d.y);
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

// ─── Notify ───────────────────────────────────────────────────────────────────
function NotifyFlash({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="cyber-glass border border-cyan-400/60 px-4 py-3 rounded text-cyan-300 text-sm font-mono flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.3)]">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />{text}
      </div>
    </div>
  );
}

// ─── Media bubble ─────────────────────────────────────────────────────────────
function MediaBubble({ url, type }: { url: string; type: string }) {
  const [open, setOpen] = useState(false);
  if (type === "video") {
    return (
      <video
        src={url} controls
        className="max-w-full rounded-lg border border-cyan-500/20 mt-1"
        style={{ maxHeight: 260 }}
      />
    );
  }
  return (
    <>
      <img
        src={url} alt="media" onClick={() => setOpen(true)}
        className="max-w-full rounded-lg border border-cyan-500/20 mt-1 cursor-zoom-in object-cover"
        style={{ maxHeight: 260 }}
      />
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <img src={url} alt="full" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const [myId] = useState<string>(() => {
    const s = localStorage.getItem("secret_chat_id");
    if (s) return s;
    const id = generateId(); localStorage.setItem("secret_chat_id", id); return id;
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    try { return JSON.parse(localStorage.getItem("secret_chat_contacts") || "[]"); } catch { return []; }
  });

  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const lastTs = useRef<Record<string, number>>({});

  const [activeChat, setActiveChat]   = useState<string | null>(null);
  const [inputText, setInputText]     = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tab, setTab]                 = useState<Tab>("chats");
  const [notify, setNotify]           = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sending, setSending]         = useState(false);
  const [lastSeen, setLastSeen]       = useState<Record<string, number>>({});
  // media attachment state
  const [attachFile, setAttachFile]   = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const activeChatRef   = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  const saveContacts = useCallback((c: Contact[]) => {
    setContacts(c); localStorage.setItem("secret_chat_contacts", JSON.stringify(c));
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeChat, messages]);

  // ── Polling ──────────────────────────────────────────────────────────────────
  const pollContact = useCallback(async (contactId: string) => {
    const since = lastTs.current[contactId] ?? 0;
    try {
      const res = await fetch(`${CHAT_URL}?from_id=${encodeURIComponent(myId)}&to_id=${encodeURIComponent(contactId)}&since=${since}`);
      if (!res.ok) return;
      const raw = await res.json();
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const incoming: Message[] = data.messages || [];
      if (!incoming.length) return;
      const maxTs = Math.max(...incoming.map((m) => m.ts));
      lastTs.current[contactId] = maxTs;
      setMessages((prev) => {
        const existing = prev[contactId] || [];
        const ids = new Set(existing.map((m) => m.id));
        const newOnes = incoming.filter((m) => !ids.has(m.id));
        if (!newOnes.length) return prev;
        const newFromOther = newOnes.filter((m) => m.from_id !== myId);
        if (newFromOther.length > 0 && activeChatRef.current !== contactId) {
          playBeep();
          setNotify(`📨 Новое сообщение от ${contactId}`);
          setLastSeen((p) => ({ ...p, [contactId]: (p[contactId] || 0) + newFromOther.length }));
        }
        return { ...prev, [contactId]: [...existing, ...newOnes].sort((a, b) => a.ts - b.ts) };
      });
    } catch (e) { void e; }
  }, [myId]);

  useEffect(() => {
    if (!contacts.length) return;
    const run = () => contacts.forEach((c) => pollContact(c.id));
    run();
    const t = setInterval(run, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [contacts, pollContact]);

  useEffect(() => { if (activeChat) setLastSeen((p) => ({ ...p, [activeChat]: 0 })); }, [activeChat]);

  // ── File pick ─────────────────────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachFile(file);
    const url = URL.createObjectURL(file);
    setAttachPreview(url);
    e.target.value = "";
  };

  const clearAttach = () => {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachFile(null); setAttachPreview(null);
  };

  // ── Add contact ───────────────────────────────────────────────────────────────
  const addContact = (rawId: string) => {
    const clean = rawId.replace(/\D/g, "");
    if (clean.length !== 9) { setNotify("⚠ ID должен содержать 9 цифр"); return; }
    const fmt = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;
    if (fmt === myId) { setNotify("⚠ Нельзя добавить себя"); return; }
    if (contacts.find((c) => c.id === fmt)) { setActiveChat(fmt); setTab("chats"); return; }
    saveContacts([...contacts, { id: fmt }]);
    setSearchInput(""); setActiveChat(fmt); setTab("chats");
    setNotify(`✓ Контакт ${fmt} добавлен`);
  };

  const deleteContact = (id: string) => {
    saveContacts(contacts.filter((c) => c.id !== id));
    if (activeChat === id) setActiveChat(null);
    setNotify("Контакт удалён");
  };

  // ── Send ──────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!inputText.trim() && !attachFile) || !activeChat || sending) return;
    setSending(true);

    let mediaUrl: string | null = null;
    let mediaType: string | null = null;

    // upload file first
    if (attachFile) {
      setUploading(true);
      try {
        const b64 = await fileToBase64(attachFile);
        const res = await fetch(UPLOAD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: attachFile.name, content_type: attachFile.type, data: b64 }),
        });
        if (!res.ok) { setNotify("⚠ Ошибка загрузки файла"); setSending(false); setUploading(false); return; }
        const raw = await res.json();
        const d = typeof raw === "string" ? JSON.parse(raw) : raw;
        mediaUrl = d.url; mediaType = d.media_type;
      } catch (e) {
        void e; setNotify("⚠ Ошибка загрузки файла"); setSending(false); setUploading(false); return;
      }
      setUploading(false);
      clearAttach();
    }

    const text = inputText.trim();
    setInputText("");

    const optimistic: Message = {
      id: Date.now(), from_id: myId, to_id: activeChat,
      text: text || null, ts: Date.now(), media_url: mediaUrl, media_type: mediaType,
    };
    setMessages((prev) => ({ ...prev, [activeChat]: [...(prev[activeChat] || []), optimistic] }));

    try {
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_id: myId, to_id: activeChat, text, media_url: mediaUrl, media_type: mediaType }),
      });
      if (!res.ok) {
        setNotify("⚠ Ошибка отправки");
        setMessages((prev) => ({ ...prev, [activeChat]: (prev[activeChat] || []).filter((m) => m.id !== optimistic.id) }));
      } else {
        const raw = await res.json();
        const d = typeof raw === "string" ? JSON.parse(raw) : raw;
        setMessages((prev) => ({
          ...prev,
          [activeChat]: (prev[activeChat] || []).map((m) =>
            m.id === optimistic.id ? { ...m, id: d.id, ts: d.created_at_ms } : m
          ),
        }));
        if (!lastTs.current[activeChat] || d.created_at_ms > lastTs.current[activeChat])
          lastTs.current[activeChat] = d.created_at_ms;
      }
    } catch (e) { void e; setNotify("⚠ Нет соединения"); }
    setSending(false);
  };

  const copyId = () => { navigator.clipboard.writeText(myId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const chatMessages = activeChat ? (messages[activeChat] || []) : [];
  const totalUnread  = Object.values(lastSeen).reduce((a, b) => a + b, 0);

  return (
    <div className="relative min-h-screen bg-[#020812] overflow-hidden font-rajdhani">
      <StarField />
      {notify && <NotifyFlash text={notify} onDone={() => setNotify(null)} />}

      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex h-screen">

        {/* ── Sidebar ── */}
        <aside className={`${sidebarOpen ? "w-72" : "w-0 overflow-hidden"} transition-all duration-300 flex flex-col cyber-glass border-r border-cyan-500/20 shrink-0`}>

          <div className="flex items-center gap-3 px-4 py-4 border-b border-cyan-500/20">
            <div className="w-8 h-8 rounded border border-cyan-400/60 flex items-center justify-center bg-cyan-500/10">
              <Icon name="Zap" size={16} className="text-cyan-400" />
            </div>
            <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">SECRET CHAT</span>
            {totalUnread > 0 && <span className="ml-auto w-5 h-5 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">{totalUnread}</span>}
          </div>

          <div className="px-4 py-3 border-b border-cyan-500/10">
            <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest mb-1">Мой ID</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-300 text-sm tracking-wider flex-1">{myId}</span>
              <button onClick={copyId} className={`p-1.5 rounded border transition-all duration-200 ${copied ? "border-green-400/60 bg-green-400/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:border-cyan-400/60 hover:bg-cyan-400/10"}`}>
                <Icon name={copied ? "Check" : "Copy"} size={12} />
              </button>
            </div>
          </div>

          <div className="flex border-b border-cyan-500/20">
            {(["chats", "contacts", "profile", "settings"] as Tab[]).map((t) => {
              const icons: Record<Tab, string> = { chats: "MessageSquare", contacts: "Users", profile: "User", settings: "Settings" };
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[9px] font-mono uppercase tracking-wider transition-all duration-200 ${tab === t ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5" : "text-cyan-600 hover:text-cyan-400 border-b-2 border-transparent"}`}>
                  <Icon name={icons[t]} size={14} />{t}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll">
            {tab === "chats" && (
              <div>
                <div className="p-3 border-b border-cyan-500/10">
                  <div className="flex gap-2">
                    <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addContact(searchInput)}
                      placeholder="XXX-XXX-XXX или 9 цифр"
                      className="flex-1 bg-black/30 border border-cyan-500/20 rounded px-3 py-1.5 text-cyan-300 text-xs font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/60 focus:bg-cyan-400/5 transition-all" />
                    <button onClick={() => addContact(searchInput)} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400 transition-all text-xs font-mono">+</button>
                  </div>
                </div>
                {contacts.length === 0 ? (
                  <div className="p-6 text-center text-cyan-700 text-xs font-mono">
                    <Icon name="MessageSquareDashed" size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Нет чатов</p><p className="text-[10px] mt-1 opacity-60">Введи ID выше</p>
                  </div>
                ) : contacts.map((c) => {
                  const msgs = messages[c.id] || [];
                  const last = msgs[msgs.length - 1];
                  const unread = lastSeen[c.id] || 0;
                  return (
                    <button key={c.id}
                      onClick={() => { setActiveChat(c.id); setLastSeen((p) => ({ ...p, [c.id]: 0 })); if (window.innerWidth < 768) setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-cyan-500/10 transition-all duration-200 text-left ${activeChat === c.id ? "bg-cyan-400/10 border-l-2 border-l-cyan-400" : "hover:bg-cyan-400/5"}`}>
                      <div className="relative w-9 h-9 rounded-full border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center shrink-0">
                        <Icon name="User" size={16} className="text-cyan-400" />
                        {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">{unread}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-cyan-300 text-xs font-mono">{c.id}</span>
                          {last && <span className="text-cyan-700 text-[9px] font-mono">{formatTime(last.ts)}</span>}
                        </div>
                        {last && (
                          <p className="text-cyan-600 text-[10px] truncate mt-0.5">
                            {last.from_id === myId ? "Ты: " : ""}
                            {last.media_url && !last.text ? (last.media_type === "video" ? "🎬 Видео" : "🖼 Фото") : last.text}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === "contacts" && (
              <div>
                <div className="p-3 border-b border-cyan-500/10">
                  <div className="flex gap-2">
                    <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addContact(searchInput)}
                      placeholder="Добавить контакт по ID"
                      className="flex-1 bg-black/30 border border-cyan-500/20 rounded px-3 py-1.5 text-cyan-300 text-xs font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/60 transition-all" />
                    <button onClick={() => addContact(searchInput)} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400 transition-all text-xs font-mono">
                      <Icon name="UserPlus" size={14} />
                    </button>
                  </div>
                </div>
                {contacts.length === 0 ? (
                  <div className="p-6 text-center text-cyan-700 text-xs font-mono">
                    <Icon name="Users" size={32} className="mx-auto mb-2 opacity-30" /><p>Контактов пока нет</p>
                  </div>
                ) : contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/10 hover:bg-cyan-400/5 transition-all">
                    <div className="w-9 h-9 rounded-full border border-violet-500/40 bg-violet-500/10 flex items-center justify-center">
                      <Icon name="User" size={16} className="text-violet-400" />
                    </div>
                    <span className="flex-1 text-cyan-300 text-xs font-mono">{c.id}</span>
                    <div className="flex gap-1">
                      <button onClick={() => { setActiveChat(c.id); setTab("chats"); }} className="p-1.5 rounded border border-cyan-500/20 text-cyan-500 hover:text-cyan-300 hover:border-cyan-400/40 transition-all"><Icon name="MessageSquare" size={12} /></button>
                      <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded border border-red-500/20 text-red-500 hover:text-red-300 hover:border-red-400/40 transition-all"><Icon name="Trash2" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "profile" && (
              <div className="p-4 space-y-4">
                <div className="cyber-glass-inner rounded-lg p-4 border border-cyan-500/20">
                  <div className="flex flex-col items-center gap-3 mb-4">
                    <div className="w-16 h-16 rounded-full border-2 border-cyan-400/60 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,255,0.2)]">
                      <Icon name="User" size={28} className="text-cyan-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest mb-1">Ваш уникальный ID</p>
                      <p className="font-mono text-cyan-300 text-lg tracking-wider">{myId}</p>
                    </div>
                  </div>
                  <button onClick={copyId} className={`w-full py-2 rounded border font-mono text-xs tracking-wider transition-all duration-200 ${copied ? "border-green-400/60 bg-green-400/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:border-cyan-400/60 hover:bg-cyan-400/10"}`}>
                    <Icon name={copied ? "Check" : "Copy"} size={14} className="inline mr-2" />
                    {copied ? "Скопировано!" : "Копировать ID"}
                  </button>
                </div>
                <div className="cyber-glass-inner rounded-lg p-3 border border-cyan-500/10">
                  <p className="text-[10px] text-cyan-500/50 font-mono uppercase tracking-widest mb-2">Статистика</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2 bg-black/20 rounded">
                      <p className="text-cyan-400 text-xl font-mono font-bold">{contacts.length}</p>
                      <p className="text-cyan-700 text-[10px] font-mono">контактов</p>
                    </div>
                    <div className="text-center p-2 bg-black/20 rounded">
                      <p className="text-cyan-400 text-xl font-mono font-bold">{Object.values(messages).reduce((a, b) => a + b.length, 0)}</p>
                      <p className="text-cyan-700 text-[10px] font-mono">сообщений</p>
                    </div>
                  </div>
                </div>
                <div className="cyber-glass-inner rounded-lg p-3 border border-cyan-500/10">
                  <p className="text-[10px] text-cyan-500/50 font-mono uppercase tracking-widest mb-1">Сервер</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-xs font-mono">Подключено · каждые 3с</span>
                  </div>
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="p-4 space-y-3">
                <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest">Управление данными</p>
                <div className="cyber-glass-inner rounded-lg border border-cyan-500/10 overflow-hidden">
                  <button onClick={() => { if (confirm("Удалить все контакты?")) { saveContacts([]); setActiveChat(null); setMessages({}); setNotify("Контакты удалены"); } }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-cyan-400 hover:bg-cyan-400/5 transition-all border-b border-cyan-500/10 text-xs font-mono">
                    <Icon name="UserX" size={14} />Удалить контакты
                  </button>
                  <button onClick={() => { if (confirm("Сбросить всё?")) { localStorage.clear(); window.location.reload(); } }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/5 transition-all text-xs font-mono">
                    <Icon name="RotateCcw" size={14} />Сбросить всё
                  </button>
                </div>
                <div className="cyber-glass-inner rounded-lg border border-cyan-500/10 p-4">
                  <p className="text-[10px] text-cyan-500/50 font-mono uppercase tracking-widest mb-2">О приложении</p>
                  <p className="text-cyan-600 text-xs font-mono leading-relaxed">Secret Chat v2.1<br />Фото и видео до 20 МБ<br />Обновление каждые 3 секунды</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat Area ── */}
        <main className="flex-1 flex flex-col min-w-0">

          <div className="cyber-glass border-b border-cyan-500/20 px-4 py-3 flex items-center gap-3 shrink-0">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded border border-cyan-500/20 text-cyan-500 hover:text-cyan-300 hover:border-cyan-400/40 transition-all">
              <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeftOpen"} size={16} />
            </button>
            {activeChat ? (
              <>
                <div className="w-8 h-8 rounded-full border border-violet-500/60 bg-violet-500/10 flex items-center justify-center">
                  <Icon name="User" size={15} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-cyan-300 text-sm font-mono">{activeChat}</p>
                  <p className="text-[10px] text-green-400/70 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />онлайн
                  </p>
                </div>
                <div className="ml-auto">
                  <button onClick={() => deleteContact(activeChat)} className="p-2 rounded border border-red-500/20 text-red-500/60 hover:text-red-400 hover:border-red-400/40 transition-all">
                    <Icon name="UserMinus" size={14} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400/40 animate-pulse" />
                <span className="text-cyan-500/60 text-sm font-mono">Выберите чат</span>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scroll px-4 py-4 space-y-3">
            {!activeChat ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="w-20 h-20 rounded-full border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center shadow-[0_0_40px_rgba(0,255,255,0.08)]">
                  <Icon name="MessageSquare" size={36} className="text-cyan-500/40" />
                </div>
                <div>
                  <p className="text-cyan-500/50 font-mono text-sm">Добро пожаловать в SECRET CHAT</p>
                  <p className="text-cyan-700 font-mono text-xs mt-1">Поделись своим ID — и начни переписку</p>
                </div>
                <div className="border border-cyan-500/20 rounded px-5 py-3 bg-cyan-500/5 flex flex-col items-center gap-2">
                  <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest">Твой ID</p>
                  <p className="font-mono text-cyan-300 text-base tracking-wider">{myId}</p>
                  <button onClick={copyId} className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-500 hover:text-cyan-300 transition-all">
                    <Icon name={copied ? "Check" : "Copy"} size={11} />{copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                <Icon name="MessageSquareDashed" size={40} className="text-cyan-700/50" />
                <p className="text-cyan-700 font-mono text-sm">Нет сообщений</p>
                <p className="text-cyan-800 font-mono text-xs">Напиши первым!</p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const fromMe = msg.from_id === myId;
                return (
                  <div key={msg.id} className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[70%]">
                      <div className={`px-4 py-2.5 rounded-lg text-sm font-mono leading-relaxed ${fromMe
                        ? "bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 shadow-[0_0_10px_rgba(0,255,255,0.08)] rounded-br-sm"
                        : "bg-violet-500/10 border border-violet-500/30 text-violet-200 shadow-[0_0_10px_rgba(139,92,246,0.08)] rounded-bl-sm"
                      }`}>
                        {msg.media_url && msg.media_type && (
                          <MediaBubble url={msg.media_url} type={msg.media_type} />
                        )}
                        {msg.text && <p className={msg.media_url ? "mt-2" : ""}>{msg.text}</p>}
                      </div>
                      <p className={`text-[9px] font-mono text-cyan-700 mt-0.5 ${fromMe ? "text-right" : "text-left"}`}>
                        {formatTime(msg.ts)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {activeChat && (
            <div className="cyber-glass border-t border-cyan-500/20 px-4 py-3 shrink-0">
              {/* Attach preview */}
              {attachPreview && attachFile && (
                <div className="mb-2 flex items-start gap-2 p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                  {attachFile.type.startsWith("video/") ? (
                    <video src={attachPreview} className="w-20 h-14 object-cover rounded border border-cyan-500/20" />
                  ) : (
                    <img src={attachPreview} alt="preview" className="w-20 h-14 object-cover rounded border border-cyan-500/20" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-cyan-400 text-xs font-mono truncate">{attachFile.name}</p>
                    <p className="text-cyan-700 text-[10px] font-mono">{(attachFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={clearAttach} className="p-1 text-red-500 hover:text-red-300 transition-all shrink-0">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              )}

              <div className="flex gap-2 items-end">
                {/* Attach button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  onChange={handleFilePick}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-cyan-500 hover:text-cyan-300 hover:border-cyan-400/40 transition-all flex items-center justify-center shrink-0"
                >
                  <Icon name="Paperclip" size={16} />
                </button>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={attachFile ? "Подпись к файлу (необязательно)..." : "Введи сообщение... (Enter для отправки)"}
                  rows={1}
                  className="flex-1 bg-black/30 border border-cyan-500/20 rounded-lg px-4 py-2.5 text-cyan-200 text-sm font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/50 focus:bg-cyan-400/5 transition-all resize-none leading-relaxed"
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                />

                <button
                  onClick={sendMessage}
                  disabled={(!inputText.trim() && !attachFile) || sending}
                  className="w-10 h-10 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400/70 hover:shadow-[0_0_16px_rgba(0,255,255,0.25)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                >
                  <Icon name={uploading ? "Upload" : sending ? "Loader" : "Send"} size={16} className={(uploading || sending) ? "animate-pulse" : ""} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
