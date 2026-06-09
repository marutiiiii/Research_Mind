const BASE = "http://127.0.0.1:8000/api";

// ── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean;
  file_id: string;
  filename: string;
  safe_filename: string;
  file_url: string;
  total_pages: number;
  total_chunks: number;
  preview: string;
  message: string;
  pages?: { page: number; text: string }[];
}


export interface QueryResult {
  success: boolean;
  answer: string;
  sources: number[];
  mode: string;
}

export interface ExplainResult {
  success: boolean;
  answer: string;
  selected_text: string;
  sources: number[];
  mode: string;
}

export interface SummaryResult {
  success: boolean;
  summary: string;
  mode: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── API Functions ──────────────────────────────────────────────────────

/** Upload a PDF file. Returns file_id which is needed for all other calls. */
export async function uploadPdf(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

/** Ask a question about the uploaded paper. */
export async function queryPaper(
  file_id: string,
  question: string,
  mode: "expert" | "eli5",
  chat_history: ChatMessage[] = []
): Promise<QueryResult> {
  return post("/query", { file_id, question, mode, chat_history });
}

/** Explain a selected piece of text from the PDF. */
export async function explainSelection(
  file_id: string,
  selected_text: string,
  mode: "expert" | "eli5"
): Promise<ExplainResult> {
  return post("/explain", { file_id, selected_text, mode });
}

/** Generate a structured 5-part summary of the paper. */
export async function summarizePaper(
  file_id: string,
  mode: "expert" | "eli5"
): Promise<SummaryResult> {
  return post("/summarize", { file_id, mode });
}

export interface HealthResult {
  status: "ready" | "downloading" | "offline";
  model: string;
  model_ready: boolean;
  error?: string;
}

/** Check if the Gemini API is ready. */
export async function checkModelHealth(): Promise<HealthResult> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return { status: "offline", model: "", model_ready: false };
    return res.json();
  } catch {
    return { status: "offline", model: "", model_ready: false };
  }
}
