import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";

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
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedCount, setRenderedCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const scrollingToPage = useRef(false);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRenderedCount(0);
    setTotalPages(0);

    const loadPdf = async () => {
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (!cancelled) {
          setPdf(doc);
          setTotalPages(doc.numPages);
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

  // Render pages with canvas + text layer when pdf loads or zoom changes
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    const renderPages = async () => {
      setLoading(true);
      setRenderedCount(0);

      const pagesContainer = pagesRef.current;
      if (!pagesContainer) return;

      // Clear previous content
      pagesContainer.innerHTML = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;

        const page = await pdf.getPage(i);
        const scale = zoom * 1.5;
        const viewport = page.getViewport({ scale });

        // Create page wrapper
        const pageWrapper = document.createElement("div");
        pageWrapper.setAttribute("data-page", String(i));
        pageWrapper.className = "pdf-page-wrapper";
        pageWrapper.style.width = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;

        // Create canvas for rendering
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "pdf-page-canvas";
        const ctx = canvas.getContext("2d")!;

        // Render canvas
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        pageWrapper.appendChild(canvas);

        // Create text layer container
        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        // Set the --scale-factor CSS variable that pdfjs TextLayer needs
        textLayerDiv.style.setProperty("--scale-factor", String(scale));
        pageWrapper.appendChild(textLayerDiv);

        // Render text layer using pdfjs TextLayer API
        const textContent = await page.getTextContent();
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });

        await textLayer.render();

        pagesContainer.appendChild(pageWrapper);

        if (!cancelled) {
          setRenderedCount(i);
          // Hide the loading overlay once the first page is rendered
          if (i === 1) {
            setLoading(false);
          }
        }
      }

      if (!cancelled) {
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
    if (!container || renderedCount === 0) return;

    const target = container.querySelector<HTMLDivElement>(`[data-page="${currentPage}"]`);
    if (target) {
      scrollingToPage.current = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { scrollingToPage.current = false; }, 600);
    }
  }, [currentPage]);

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
    <>
      <style>{`
        .pdf-page-wrapper {
          position: relative;
          margin: 0 auto 16px auto;
          max-width: 100%;
          overflow: hidden;
          border-radius: 4px;
          box-shadow: 0 2px 20px rgba(0,0,0,0.4);
        }
        .pdf-page-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
        .textLayer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          opacity: 0.25;
          line-height: 1;
          pointer-events: all;
        }
        .textLayer span,
        .textLayer br {
          color: transparent;
          position: absolute;
          white-space: pre;
          transform-origin: 0% 0%;
          pointer-events: all;
        }
        .textLayer span::selection {
          background: rgba(0, 100, 255, 0.4);
        }
        .textLayer span::-moz-selection {
          background: rgba(0, 100, 255, 0.4);
        }
        .textLayer .endOfContent {
          display: block;
          position: absolute;
          left: 0;
          top: 100%;
          right: 0;
          bottom: 0;
          z-index: -1;
          cursor: default;
          user-select: none;
        }
        .textLayer .endOfContent.active {
          top: 0;
        }
      `}</style>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 scrollbar-thin"
        style={{ background: "oklch(0.14 0.01 265)" }}
      >
        {/* Loading overlay — shown on top, doesn't remove the pagesRef container */}
        {loading && renderedCount === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Loading PDF…
              </span>
            </div>
          </div>
        )}
        <div ref={pagesRef} />
        {renderedCount > 0 && renderedCount < totalPages && (
          <div className="flex items-center justify-center py-2">
            <span className="font-mono text-xs text-muted-foreground">
              Rendering page {renderedCount} of {totalPages}…
            </span>
          </div>
        )}
      </div>
    </>
  );
}
