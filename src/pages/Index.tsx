import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: number;
}

interface Contact {
  id: string;
  unread: number;
  lastMessage?: string;
  lastTime?: number;
}

type Tab = "chats" | "contacts" | "profile" | "settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId(): string {
  const n = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 9)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function playBeep() {
  try {
    interface WindowWithWebkit extends Window { webkitAudioContext: typeof AudioContext; }
    const AudioCtx = window.AudioContext || (window as unknown as WindowWithWebkit).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { void e; }
}

// ─── Stars Canvas ─────────────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.2,
      speed: Math.random() * 0.3 + 0.05,
      opacity: Math.random(),
      delta: (Math.random() - 0.5) * 0.02,
    }));

    const digits = Array.from({ length: 30 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      speed: Math.random() * 1.5 + 0.5,
      char: Math.floor(Math.random() * 10).toString(),
      opacity: Math.random() * 0.15 + 0.03,
      timer: 0,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      stars.forEach((s) => {
        s.opacity += s.delta;
        if (s.opacity > 1 || s.opacity < 0) s.delta *= -1;
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 255, ${Math.abs(s.opacity) * 0.6})`;
        ctx.fill();
      });

      digits.forEach((d) => {
        d.timer++;
        if (d.timer > 60) { d.char = Math.floor(Math.random() * 10).toString(); d.timer = 0; }
        d.y += d.speed;
        if (d.y > canvas.height) { d.y = 0; d.x = Math.random() * canvas.width; }
        ctx.font = "10px 'Share Tech Mono'";
        ctx.fillStyle = `rgba(0, 255, 128, ${d.opacity})`;
        ctx.fillText(d.char, d.x, d.y);
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

// ─── Notification Flash ───────────────────────────────────────────────────────
function NotifyFlash({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="cyber-glass border border-cyan-400/60 px-4 py-3 rounded text-cyan-300 text-sm font-mono flex items-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.3)]">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        {text}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const [myId] = useState<string>(() => {
    const saved = localStorage.getItem("secret_chat_id");
    if (saved) return saved;
    const newId = generateId();
    localStorage.setItem("secret_chat_id", newId);
    return newId;
  });

  const [contacts, setContacts] = useState<Contact[]>(() => {
    try { return JSON.parse(localStorage.getItem("secret_chat_contacts") || "[]"); } catch { return []; }
  });

  const [messages, setMessages] = useState<Record<string, Message[]>>(() => {
    try { return JSON.parse(localStorage.getItem("secret_chat_messages") || "{}"); } catch { return {}; }
  });

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tab, setTab] = useState<Tab>("chats");
  const [notify, setNotify] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const saveContacts = useCallback((c: Contact[]) => {
    setContacts(c);
    localStorage.setItem("secret_chat_contacts", JSON.stringify(c));
  }, []);

  const saveMessages = useCallback((m: Record<string, Message[]>) => {
    setMessages(m);
    localStorage.setItem("secret_chat_messages", JSON.stringify(m));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat, messages]);

  const addContact = (rawId: string) => {
    const clean = rawId.replace(/\D/g, "");
    if (clean.length !== 9) { setNotify("⚠ ID должен содержать 9 цифр"); return; }
    const formatted = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;
    if (formatted === myId) { setNotify("⚠ Нельзя добавить себя"); return; }
    if (contacts.find((c) => c.id === formatted)) { setNotify("Контакт уже добавлен"); setActiveChat(formatted); setTab("chats"); return; }
    const newContact: Contact = { id: formatted, unread: 0 };
    saveContacts([...contacts, newContact]);
    setSearchInput("");
    setActiveChat(formatted);
    setTab("chats");
    setNotify(`✓ Контакт ${formatted} добавлен`);
  };

  const deleteContact = (id: string) => {
    saveContacts(contacts.filter((c) => c.id !== id));
    if (activeChat === id) setActiveChat(null);
    setNotify(`Контакт удалён`);
  };

  const sendMessage = () => {
    if (!inputText.trim() || !activeChat) return;
    const msg: Message = { id: Date.now().toString(), text: inputText.trim(), fromMe: true, timestamp: Date.now() };
    const chatMsgs = [...(messages[activeChat] || []), msg];
    const newMessages = { ...messages, [activeChat]: chatMsgs };
    saveMessages(newMessages);

    const lastMsg = inputText.trim();
    setInputText("");

    const updatedContacts = contacts.map((c) =>
      c.id === activeChat ? { ...c, lastMessage: lastMsg, lastTime: Date.now(), unread: 0 } : c
    );
    saveContacts(updatedContacts);

    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        text: `Привет! Я получил твоё сообщение: "${lastMsg}"`,
        fromMe: false,
        timestamp: Date.now(),
      };
      const updatedMsgs = [...(newMessages[activeChat] || []), reply];
      const finalMessages = { ...newMessages, [activeChat]: updatedMsgs };
      saveMessages(finalMessages);

      const finalContacts = updatedContacts.map((c) =>
        c.id === activeChat
          ? { ...c, lastMessage: reply.text, lastTime: Date.now(), unread: 0 }
          : c
      );
      saveContacts(finalContacts);
      playBeep();
      setNotify(`📨 Новое сообщение от ${activeChat}`);
    }, 1000);
  };

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const chatMessages = activeChat ? (messages[activeChat] || []) : [];

  return (
    <div className="relative min-h-screen bg-[#020812] overflow-hidden font-rajdhani">
      <StarField />

      {notify && <NotifyFlash text={notify} onDone={() => setNotify(null)} />}

      {/* Glow overlays */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex h-screen">

        {/* ── Sidebar ── */}
        <aside className={`${sidebarOpen ? "w-72" : "w-0 overflow-hidden"} transition-all duration-300 flex flex-col cyber-glass border-r border-cyan-500/20 shrink-0`}>

          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-cyan-500/20">
            <div className="w-8 h-8 rounded border border-cyan-400/60 flex items-center justify-center bg-cyan-500/10">
              <Icon name="Zap" size={16} className="text-cyan-400" />
            </div>
            <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">SECRET CHAT</span>
          </div>

          {/* My ID badge */}
          <div className="px-4 py-3 border-b border-cyan-500/10">
            <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest mb-1">Мой ID</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-300 text-sm tracking-wider flex-1">{myId}</span>
              <button onClick={copyId} className={`p-1.5 rounded border transition-all duration-200 ${copied ? "border-green-400/60 bg-green-400/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:border-cyan-400/60 hover:bg-cyan-400/10"}`}>
                <Icon name={copied ? "Check" : "Copy"} size={12} />
              </button>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex border-b border-cyan-500/20">
            {(["chats", "contacts", "profile", "settings"] as Tab[]).map((t) => {
              const icons: Record<Tab, string> = { chats: "MessageSquare", contacts: "Users", profile: "User", settings: "Settings" };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[9px] font-mono uppercase tracking-wider transition-all duration-200 ${tab === t ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5" : "text-cyan-600 hover:text-cyan-400 border-b-2 border-transparent"}`}
                >
                  <Icon name={icons[t]} size={14} />
                  {t}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto custom-scroll">

            {tab === "chats" && (
              <div>
                <div className="p-3 border-b border-cyan-500/10">
                  <div className="flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addContact(searchInput)}
                      placeholder="XXX-XXX-XXX или 9 цифр"
                      className="flex-1 bg-black/30 border border-cyan-500/20 rounded px-3 py-1.5 text-cyan-300 text-xs font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/60 focus:bg-cyan-400/5 transition-all"
                    />
                    <button onClick={() => addContact(searchInput)} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400 transition-all text-xs font-mono">
                      +
                    </button>
                  </div>
                </div>

                {contacts.length === 0 ? (
                  <div className="p-6 text-center text-cyan-700 text-xs font-mono">
                    <Icon name="MessageSquareDashed" size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Нет чатов</p>
                    <p className="text-[10px] mt-1 opacity-60">Введи ID выше</p>
                  </div>
                ) : (
                  contacts.map((c) => {
                    const msgs = messages[c.id] || [];
                    const last = msgs[msgs.length - 1];
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setActiveChat(c.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-cyan-500/10 transition-all duration-200 text-left ${activeChat === c.id ? "bg-cyan-400/10 border-l-2 border-l-cyan-400" : "hover:bg-cyan-400/5"}`}
                      >
                        <div className="w-9 h-9 rounded-full border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center shrink-0">
                          <Icon name="User" size={16} className="text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-300 text-xs font-mono">{c.id}</span>
                            {last && <span className="text-cyan-700 text-[9px] font-mono">{formatTime(last.timestamp)}</span>}
                          </div>
                          {last && <p className="text-cyan-600 text-[10px] truncate mt-0.5">{last.fromMe ? "Ты: " : ""}{last.text}</p>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {tab === "contacts" && (
              <div>
                <div className="p-3 border-b border-cyan-500/10">
                  <div className="flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addContact(searchInput)}
                      placeholder="Добавить контакт по ID"
                      className="flex-1 bg-black/30 border border-cyan-500/20 rounded px-3 py-1.5 text-cyan-300 text-xs font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/60 transition-all"
                    />
                    <button onClick={() => addContact(searchInput)} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400 transition-all text-xs font-mono">
                      <Icon name="UserPlus" size={14} />
                    </button>
                  </div>
                </div>
                {contacts.length === 0 ? (
                  <div className="p-6 text-center text-cyan-700 text-xs font-mono">
                    <Icon name="Users" size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Контактов пока нет</p>
                  </div>
                ) : (
                  contacts.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/10 hover:bg-cyan-400/5 transition-all">
                      <div className="w-9 h-9 rounded-full border border-violet-500/40 bg-violet-500/10 flex items-center justify-center">
                        <Icon name="User" size={16} className="text-violet-400" />
                      </div>
                      <span className="flex-1 text-cyan-300 text-xs font-mono">{c.id}</span>
                      <div className="flex gap-1">
                        <button onClick={() => { setActiveChat(c.id); setTab("chats"); }} className="p-1.5 rounded border border-cyan-500/20 text-cyan-500 hover:text-cyan-300 hover:border-cyan-400/40 transition-all">
                          <Icon name="MessageSquare" size={12} />
                        </button>
                        <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded border border-red-500/20 text-red-500 hover:text-red-300 hover:border-red-400/40 transition-all">
                          <Icon name="Trash2" size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
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
                      <p className="text-cyan-400 text-xl font-mono font-bold">
                        {Object.values(messages).reduce((a, b) => a + b.length, 0)}
                      </p>
                      <p className="text-cyan-700 text-[10px] font-mono">сообщений</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="p-4 space-y-3">
                <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest">Управление данными</p>
                <div className="cyber-glass-inner rounded-lg border border-cyan-500/10 overflow-hidden">
                  <button
                    onClick={() => {
                      if (confirm("Очистить историю всех сообщений?")) {
                        saveMessages({});
                        setNotify("История очищена");
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-cyan-400 hover:bg-cyan-400/5 transition-all border-b border-cyan-500/10 text-xs font-mono"
                  >
                    <Icon name="Trash2" size={14} />
                    Очистить историю
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Удалить все контакты?")) {
                        saveContacts([]);
                        setActiveChat(null);
                        setNotify("Контакты удалены");
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-cyan-400 hover:bg-cyan-400/5 transition-all border-b border-cyan-500/10 text-xs font-mono"
                  >
                    <Icon name="UserX" size={14} />
                    Удалить контакты
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Сбросить всё и получить новый ID?")) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/5 transition-all text-xs font-mono"
                  >
                    <Icon name="RotateCcw" size={14} />
                    Сбросить всё
                  </button>
                </div>
                <div className="cyber-glass-inner rounded-lg border border-cyan-500/10 p-4">
                  <p className="text-[10px] text-cyan-500/50 font-mono uppercase tracking-widest mb-2">О приложении</p>
                  <p className="text-cyan-600 text-xs font-mono leading-relaxed">Secret Chat v1.0<br/>Шифрованный мессенджер<br/>Данные хранятся локально</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Chat Area ── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Header */}
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
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    онлайн
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
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
                <div className="w-20 h-20 rounded-full border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center shadow-[0_0_40px_rgba(0,255,255,0.1)]">
                  <Icon name="MessageSquare" size={36} className="text-cyan-500/40" />
                </div>
                <div>
                  <p className="text-cyan-500/50 font-mono text-sm">Добро пожаловать в SECRET CHAT</p>
                  <p className="text-cyan-700 font-mono text-xs mt-1">Добавь контакт по ID и начни переписку</p>
                </div>
                <div className="border border-cyan-500/20 rounded px-4 py-2 bg-cyan-500/5">
                  <p className="text-[10px] text-cyan-500/60 font-mono uppercase tracking-widest mb-1">Твой ID</p>
                  <p className="font-mono text-cyan-300 text-base tracking-wider">{myId}</p>
                </div>
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                <Icon name="MessageSquareDashed" size={40} className="text-cyan-700/50" />
                <p className="text-cyan-700 font-mono text-sm">Нет сообщений</p>
                <p className="text-cyan-800 font-mono text-xs">Напиши первым!</p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[70%]">
                    <div className={`px-4 py-2.5 rounded-lg text-sm font-mono leading-relaxed ${
                      msg.fromMe
                        ? "bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 shadow-[0_0_12px_rgba(0,255,255,0.1)] rounded-br-sm"
                        : "bg-violet-500/10 border border-violet-500/30 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.1)] rounded-bl-sm"
                    }`}>
                      {msg.text}
                    </div>
                    <p className={`text-[9px] font-mono text-cyan-700 mt-0.5 ${msg.fromMe ? "text-right" : "text-left"}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {activeChat && (
            <div className="cyber-glass border-t border-cyan-500/20 px-4 py-3 shrink-0">
              <div className="flex gap-3 items-end">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Введи сообщение... (Enter для отправки)"
                  rows={1}
                  className="flex-1 bg-black/30 border border-cyan-500/20 rounded-lg px-4 py-2.5 text-cyan-200 text-sm font-mono placeholder:text-cyan-700 focus:outline-none focus:border-cyan-400/50 focus:bg-cyan-400/5 transition-all resize-none leading-relaxed"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim()}
                  className="w-11 h-11 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-400/20 hover:border-cyan-400/70 hover:shadow-[0_0_16px_rgba(0,255,255,0.3)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                >
                  <Icon name="Send" size={18} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}