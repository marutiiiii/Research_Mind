// Tiny in-memory store shared between the landing page and the workspace.
// Stores the backend upload result needed to display and query the paper.
interface PaperEntry {
  filename: string;
  file_id: string;
  file_url: string;
  total_pages: number;
  pages?: { page: number; text: string }[];
}

let current: PaperEntry | null = null;

export const paperStore = {
  set(entry: PaperEntry) { current = entry; },
  get(): PaperEntry | null { return current; },
  clear() { current = null; },
};
