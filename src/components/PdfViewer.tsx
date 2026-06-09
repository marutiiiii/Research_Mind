import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// pdfjs-dist v4 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfViewerProps {
  url: string;
  zoom: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onTotalPages: (total: number) => void;
}

export default function PdfViewer({ url, zoom, currentPage, onPageChange, onTotalPages }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const scrollingToPage = useRef(false);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageImages([]);

    const loadPdf = async () => {
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (!cancelled) {
          setPdf(doc);
          onTotalPages(doc.numPages);
        }
      } catch (err: any) {
        console.error("Failed to load PDF:", err);
        if (!cancelled) {
          setError(`Failed to load PDF: ${err?.message || err}`);
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  // Render pages to images when pdf loads or zoom changes
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    const renderPages = async () => {
      setLoading(true);
      const images: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;

        const page = await pdf.getPage(i);
        const scale = zoom * 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        images.push(canvas.toDataURL("image/png"));
      }

      if (!cancelled) {
        setPageImages(images);
        setLoading(false);
      }
    };

    renderPages();
    return () => { cancelled = true; };
  }, [pdf, zoom]);

  // Scroll tracking → update currentPage
  const handleScroll = useCallback(() => {
    if (scrollingToPage.current) return;
    const container = containerRef.current;
    if (!container) return;

    const wrappers = container.querySelectorAll<HTMLDivElement>("[data-page]");
    const scrollMid = container.scrollTop + container.clientHeight / 3;

    for (let i = wrappers.length - 1; i >= 0; i--) {
      if (wrappers[i].offsetTop <= scrollMid) {
        onPageChange(i + 1);
        break;
      }
    }
  }, [onPageChange]);

  // Scroll to specific page
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageImages.length === 0) return;

    const target = container.querySelector<HTMLDivElement>(`[data-page="${currentPage}"]`);
    if (target) {
      scrollingToPage.current = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { scrollingToPage.current = false; }, 600);
    }
  }, [currentPage]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Loading PDF…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-center text-sm text-coral">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto px-4 py-4 scrollbar-thin"
      style={{ background: "oklch(0.14 0.01 265)" }}
    >
      {pageImages.map((src, i) => (
        <div
          key={i}
          data-page={i + 1}
          className="mx-auto mb-4 overflow-hidden rounded"
          style={{
            maxWidth: "100%",
            width: "fit-content",
            boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
          }}
        >
          <img
            src={src}
            alt={`Page ${i + 1}`}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        </div>
      ))}
    </div>
  );
}
