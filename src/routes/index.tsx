import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useCallback } from "react";
import { Atom, FileText, ArrowRight, UploadCloud, Loader2 } from "lucide-react";
import { paperStore } from "@/lib/paperStore";
import { uploadPdf } from "@/lib/api";

export const Route = createFileRoute("/")(  {
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const open = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadPdf(file);
      paperStore.set({
        filename: result.filename,
        file_id: result.file_id,
        file_url: result.file_url,
        total_pages: result.total_pages,
        pages: result.pages,
      });
      navigate({ to: "/app" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed. Is the backend running?");
      setUploading(false);
    }
  };

  return (
    <div className="grain relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* single subtle glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-blob absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6">
        {/* logo */}
        <div className="mb-10 flex items-center gap-2.5 animate-fade-up">
          <div className="grid h-9 w-9 place-items-center rounded-xl glass">
            <Atom className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Research<span className="text-primary">Mind</span>
          </span>
        </div>

        {/* headline */}
        <h1 className="text-center font-display text-3xl font-semibold leading-snug tracking-tight md:text-4xl animate-fade-up [animation-delay:60ms]">
          Upload a paper.{" "}
          <span className="bg-gradient-to-r from-primary to-mint bg-clip-text text-transparent">
            Ask anything.
          </span>
        </h1>
        <p className="mt-3 text-center text-sm text-muted-foreground animate-fade-up [animation-delay:120ms]">
          AI-powered research paper assistant.
        </p>

        {/* upload */}
        <div className="mt-8 w-full animate-fade-up [animation-delay:180ms]">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`group relative block cursor-pointer rounded-2xl glass p-8 transition-all duration-300 ${
              dragOver ? "scale-[1.01] glow-primary" : "hover:bg-white/[0.04]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <div className="relative flex flex-col items-center gap-2.5 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                {file ? <FileText className="h-5 w-5" strokeWidth={1.5} /> : <UploadCloud className="h-5 w-5" strokeWidth={1.5} />}
              </div>
              {file ? (
                <>
                  <p className="font-display text-base">{file.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">ready to upload</p>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Drop your PDF here <span className="text-muted-foreground">or click to browse</span>
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">.pdf · max 50 mb</p>
                </>
              )}
            </div>
          </label>

          {error && (
            <p className="mt-3 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-center text-xs text-coral animate-fade-up">
              {error}
            </p>
          )}

          {file && !uploading && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={open}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:scale-[1.03] glow-primary animate-fade-up"
              >
                Open in ResearchMind
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          )}

          {uploading && (
            <div className="mt-4 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm text-muted-foreground animate-fade-up">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Processing…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
