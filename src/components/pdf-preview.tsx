"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2 } from "lucide-react";

type PdfPreviewProps = {
  url: string;
};

export function PdfPreview({ url }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const pdfDocumentRef = useRef<Awaited<ReturnType<typeof loadPdfDocument>> | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPages, setRenderedPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(Math.floor(element.getBoundingClientRect().width) - 24, 0);
      setContainerWidth(nextWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setPageCount(0);
      setRenderedPages(0);
      canvasRefs.current = [];

      const previousDocument = pdfDocumentRef.current;
      pdfDocumentRef.current = null;
      await previousDocument?.destroy().catch(() => undefined);

      try {
        const document = await loadPdfDocument(url);
        if (cancelled) {
          await document.destroy().catch(() => undefined);
          return;
        }

        pdfDocumentRef.current = document;
        setPageCount(document.numPages);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "PDF 文档加载失败");
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const pdfDocument = pdfDocumentRef.current;
      if (!pdfDocument || pageCount === 0 || containerWidth === 0) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        for (let index = 0; index < pageCount; index += 1) {
          if (cancelled) {
            return;
          }

          const page = await pdfDocument.getPage(index + 1);
          const rawViewport = page.getViewport({ scale: 1 });
          const cssWidth = Math.max(containerWidth, 240);
          const outputScale =
            typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
          const scale = Math.max((cssWidth * outputScale) / rawViewport.width, 0.6);
          const viewport = page.getViewport({ scale });
          const canvas = canvasRefs.current[index];

          if (!canvas) {
            continue;
          }

          const context = canvas.getContext("2d");
          if (!context) {
            continue;
          }

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = `${viewport.height / outputScale}px`;
          canvas.style.display = "block";
          canvas.style.maxWidth = "100%";

          const renderTask = page.render({
            canvas,
            canvasContext: context,
            viewport,
          });

          await renderTask.promise;

          if (cancelled) {
            return;
          }

          setRenderedPages((current) => (current >= index + 1 ? current : index + 1));

          if (index === 0) {
            setIsLoading(false);
          }

          if (index < pageCount - 1) {
            await new Promise((resolve) => {
              setTimeout(resolve, index < 2 ? 0 : 16);
            });
          }
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "PDF 文档渲染失败");
          setIsLoading(false);
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [containerWidth, pageCount]);

  return (
    <div
      data-pdf-preview-container
      ref={containerRef}
      className="relative h-[72vh] min-h-[72vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3 md:h-[78vh] md:min-h-[78vh]"
    >
      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在加载 PDF 预览...</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-700">
            {error}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {renderedPages > 0 && renderedPages < pageCount ? (
            <div className="sticky top-0 z-10 flex justify-end">
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-sm backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>已加载 {renderedPages}/{pageCount} 页，剩余页面继续加载中</span>
              </div>
            </div>
          ) : null}
          {Array.from({ length: pageCount }).map((_, index) => (
            <div
              key={`${url}-${index + 1}`}
              className="mx-auto w-full max-w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
            >
              <canvas
                ref={(node) => {
                  canvasRefs.current[index] = node;
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

const loadPdfJsModule = async () => {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
      }

      return pdfjs;
    });
  }

  return pdfjsModulePromise;
};

const loadPdfDocument = async (url: string): Promise<PdfDocumentProxy> => {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("PDF 文件读取失败");
  }

  const data = await response.arrayBuffer();
  const pdfjs = await loadPdfJsModule();
  const loadingTask = pdfjs.getDocument({
    data,
  });

  return loadingTask.promise as Promise<PdfDocumentProxy>;
};
