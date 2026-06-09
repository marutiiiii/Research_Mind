import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight,
  Send, Bot, Sparkles, Copy, Highlighter, Trash2, HelpCircle, Atom, BookOpen, Mic, MicOff,
} from "lucide-react";
import { paperStore } from "@/lib/paperStore";
import { queryPaper, explainSelection, summarizePaper, checkModelHealth, type ChatMessage, type HealthResult } from "@/lib/api";
import PdfViewer from "@/components/PdfViewer";

export const Route = createFileRoute("/app")({
  component: Workspace,
});

type Msg = {
  id: string;
  from: "user" | "ai";
  text: string;
  sources?: number[];
};

const WELCOME: Msg = {
  id: "w",
  from: "ai",
  text: "Hello! I've loaded your paper. Ask me anything — select text from the paper on the left to ask about a specific part, or type your question below.",
};

function Workspace() {
  const navigate = useNavigate();
  const paper = paperStore.get();
  const filename = paper?.filename ?? "Research Paper";
  const fileId = paper?.file_id ?? "";
  const fileUrl = paper?.file_url ?? "";
  const totalPages = paper?.total_pages ?? 0;

  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState<"eli5" | "expert">("eli5");
  const [zoom, setZoom] = useState(1);
  const [popup, setPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHealth, setModelHealth] = useState<HealthResult>({ status: "downloading", model: "", model_ready: false });
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const pages = paper?.pages ?? [];
  const [currentPage, setCurrentPage] = useState(1);

  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage((p) => Math.min(totalPages || 1, p + 1));

  const chatEnd = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // scroll chat to bottom
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // If no paper loaded, redirect to home
  useEffect(() => {
    if (!fileId) navigate({ to: "/" });
  }, [fileId, navigate]);

  // Poll model health every 5s until ready
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const poll = async () => {
      const h = await checkModelHealth();
      setModelHealth(h);
      if (h.status === "ready") clearInterval(timer);
    };
    poll();
    timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, []);

  // text selection popup inside the PDF area
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const target = e.target as Node | null;
      if (!text || !pdfRef.current || !target || !pdfRef.current.contains(target)) {
        if (!text) setPopup(null);
        return;
      }
      const range = sel!.getRangeAt(0).getBoundingClientRect();
      const containerRect = pdfRef.current.getBoundingClientRect();
      setPopup({
        x: range.left - containerRect.left + range.width / 2,
        y: range.top - containerRect.top - 8,
        text,
      });
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

  // Build chat history for the API from existing messages
  const buildHistory = (): ChatMessage[] =>
    messages
      .filter((m) => m.id !== "w")
      .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text }));

  const formatError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("exceeded"))
      return "⚡ API quota exceeded. The free tier limit was hit — please wait a minute and try again, or upgrade your Gemini API plan.";
    if (msg.includes("404")) {
      if (msg.toLowerCase().includes("model")) return "Model is still downloading or not found. Please wait a moment and try again.";
      return "Paper not found in memory. Please re-upload your PDF.";
    }
    return msg;
  };

  const modelReady = modelHealth.status === "ready";

  // ── Voice Input (Speech-to-Text) ─────────────────────────────────
  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    let finalTranscript = input; // preserve existing text

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + transcript;
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") setError(`Voice error: ${e.error}`);
      setListening(false);
    };

    recognition.start();
    setListening(true);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || !fileId || !modelReady) return;
    setError(null);
    const userMsg: Msg = { id: crypto.randomUUID(), from: "user", text: t };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    try {
      const result = await queryPaper(fileId, t, mode, buildHistory());
      const aiMsg: Msg = {
        id: crypto.randomUUID(),
        from: "ai",
        text: result.answer,
        sources: result.sources,
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setTyping(false);
    }
  };

  const askAiAboutSelection = async () => {
    if (!popup || !fileId) return;
    const selected = popup.text;
    setPopup(null);
    window.getSelection()?.removeAllRanges();
    setError(null);

    // Show user message immediately
    const userMsg: Msg = { id: crypto.randomUUID(), from: "user", text: `Explain this: "${selected}"` };
    setMessages((m) => [...m, userMsg]);
    setTyping(true);

    try {
      const result = await explainSelection(fileId, selected, mode);
      const aiMsg: Msg = {
        id: crypto.randomUUID(),
        from: "ai",
        text: result.answer,
        sources: result.sources,
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setTyping(false);
    }
  };

  const getSummary = async () => {
    if (!fileId) return;
    setError(null);
    const userMsg: Msg = { id: crypto.randomUUID(), from: "user", text: "Give me a structured summary of this paper." };
    setMessages((m) => [...m, userMsg]);
    setTyping(true);
    try {
      const result = await summarizePaper(fileId, mode);
      const aiMsg: Msg = { id: crypto.randomUUID(), from: "ai", text: result.summary };
      setMessages((m) => [...m, aiMsg]);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setTyping(false);
    }
  };

  const copySel = async () => {
    if (!popup) return;
    try { await navigator.clipboard.writeText(popup.text); } catch {}
    setPopup(null);
  };

  const highlight = () => {
    if (!popup) return;
    setHighlights((h) => Array.from(new Set([...h, popup.text])));
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const clearChat = () => {
    setMessages([WELCOME]);
    setError(null);
  };

  return (
    <div className="grain relative flex h-screen flex-col overflow-hidden bg-background">
      {/* split */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* LEFT — PDF / READER */}
        <section className="relative flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          {/* top bar */}
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-4 py-2.5 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => navigate({ to: "/" })}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
                <Atom className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <span className="truncate font-display text-sm">{filename}</span>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:inline">
                {totalPages > 0 ? `${totalPages} pages` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
                <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs bg-primary text-primary-foreground font-semibold shadow">
                  <BookOpen className="h-3.5 w-3.5" /> PDF View
                </div>
              </div>
              <IconBtn onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}><ZoomOut className="h-4 w-4" /></IconBtn>
              <span className="min-w-10 text-center font-mono text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <IconBtn onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}><ZoomIn className="h-4 w-4" /></IconBtn>
            </div>
          </div>

          {/* paper area */}
          <div ref={pdfRef} className="relative flex-1 overflow-hidden bg-[oklch(0.12_0.02_265)]">
            {fileUrl ? (
              <PdfViewer
                url={fileUrl}
                zoom={zoom}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onTotalPages={(total) => {
                  /* totalPages from upload is already set, but sync if needed */
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                No PDF loaded.
              </div>
            )}

            {popup && (
              <div
                className="absolute z-30 -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-surface-2/95 p-1 shadow-2xl backdrop-blur animate-fade-up font-sans"
                style={{ left: popup.x, top: popup.y }}
              >
                <div className="flex items-center gap-0.5 font-mono text-[11px] uppercase tracking-wider">
                  <PopBtn onClick={askAiAboutSelection} className="bg-primary/20 text-primary font-bold hover:bg-primary hover:text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /> Ask AI</PopBtn>
                  <PopBtn onClick={copySel}><Copy className="h-3.5 w-3.5" /> Copy</PopBtn>
                  <PopBtn onClick={highlight} className="text-gold"><Highlighter className="h-3.5 w-3.5" /> Highlight</PopBtn>
                </div>
              </div>
            )}
          </div>

          {/* bottom bar */}
          <div className="flex items-center justify-center gap-2 border-t border-border bg-surface/60 px-4 py-2 backdrop-blur font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <IconBtn onClick={prevPage}><ChevronLeft className="h-4 w-4" /></IconBtn>
            <span>page {currentPage} {totalPages > 0 ? `of ${totalPages}` : ""}</span>
            <IconBtn onClick={nextPage}><ChevronRight className="h-4 w-4" /></IconBtn>
          </div>
        </section>

        {/* divider handle */}
        <div className="hidden w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent lg:block" aria-hidden>
          <div className="sticky top-1/2 -ml-1.5 h-12 w-3 rounded-full border border-white/10 bg-surface-2" />
        </div>

        {/* RIGHT — Chat */}
        <section className="flex min-h-0 flex-1 flex-col bg-surface/40">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <span className="relative grid h-7 w-7 place-items-center rounded-md bg-mint/15">
                <Bot className="h-4 w-4 text-mint" strokeWidth={1.5} />
                <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${modelReady ? "bg-mint animate-pulse-dot" : "bg-amber-400 animate-pulse"}`} />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-sm">ResearchMind AI</span>
                <span className={`font-mono text-[10px] uppercase tracking-widest ${
                  modelReady ? "text-mint" :
                  modelHealth.status === "offline" ? "text-coral" :
                  "text-amber-400"
                }`}>
                  {modelReady ? "online · ready" :
                   modelHealth.status === "offline" ? "api offline" :
                   `loading model…`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Summary shortcut */}
              <button
                onClick={getSummary}
                disabled={typing || !modelReady}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-mint disabled:opacity-40"
              >
                <BookOpen className="h-3 w-3" /> Summary
              </button>
              <button
                onClick={clearChat}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-coral"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>

          {/* messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 scrollbar-thin">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {messages.map((m) =>
                m.from === "ai" ? (
                  <div key={m.id} className="flex items-start gap-2.5 animate-fade-up">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {m.text}
                      </div>
                      {m.sources && m.sources.length > 0 && (
                        <p className="pl-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Sources: page{m.sources.length > 1 ? "s" : ""} {m.sources.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-end animate-fade-up">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
                      {m.text}
                    </div>
                  </div>
                )
              )}
              {typing && (
                <div className="flex items-start gap-2.5 animate-fade-up">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3.5">
                    <Dot delay="0s" /><Dot delay="0.15s" /><Dot delay="0.3s" />
                  </div>
                </div>
              )}
              {error && (
                <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-center text-xs text-coral animate-fade-up">
                  ⚠ {error}
                </p>
              )}
              <div ref={chatEnd} />
            </div>
          </div>

          {/* input */}
          <div className="border-t border-border bg-surface/60 px-4 py-3 backdrop-blur">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 transition-colors focus-within:border-primary/60"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={modelReady ? "Ask anything about this paper..." : modelHealth.status === "offline" ? "Gemini API is offline — check your API key" : "Waiting for AI model to load…"}
                disabled={typing || !modelReady}
                className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <button
                type="button"
                onClick={toggleListening}
                disabled={typing || !modelReady}
                className={`grid h-9 w-9 place-items-center rounded-full transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:scale-100 ${
                  listening
                    ? "bg-coral text-white animate-pulse shadow-[0_0_20px_oklch(0.65_0.20_25/0.7)]"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-white/10"
                }`}
                aria-label={listening ? "Stop recording" : "Voice input"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="submit"
                disabled={typing || !input.trim() || !modelReady}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_oklch(0.70_0.18_265/0.7)] disabled:opacity-40 disabled:scale-100"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* help */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {showHelp && (
          <div className="max-w-xs rounded-xl border border-border bg-surface-2/95 px-3 py-2 text-xs shadow-2xl backdrop-blur animate-fade-up">
            Select any text on the PDF to instantly ask AI about it.
          </div>
        )}
        <button
          onMouseEnter={() => setShowHelp(true)}
          onMouseLeave={() => setShowHelp(false)}
          onClick={() => setShowHelp((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-xl transition-colors hover:text-primary"
          aria-label="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/* hidden link to satisfy router import */}
      <Link to="/" className="hidden" />
    </div>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function PopBtn({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-typing" style={{ animationDelay: delay }} />;
}

function ModeToggle({ mode, setMode }: { mode: "eli5" | "expert"; setMode: (m: "eli5" | "expert") => void }) {
  return (
    <div className="relative inline-flex rounded-full border border-border bg-surface p-0.5 font-mono text-[10px] uppercase tracking-widest">
      <span
        className="absolute inset-y-0.5 w-1/2 rounded-full bg-primary transition-transform duration-300"
        style={{ transform: mode === "eli5" ? "translateX(0)" : "translateX(100%)" }}
      />
      {(["eli5", "expert"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`relative z-10 px-3 py-1.5 transition-colors ${mode === m ? "text-primary-foreground" : "text-muted-foreground"}`}
        >
          {m === "eli5" ? "ELI5" : "Expert"}
        </button>
      ))}
    </div>
  );
}


