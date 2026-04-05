import { useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';

function extractCsvLine(errorText: string | undefined, label: string): string[] {
  if (!errorText) {
    return [];
  }

  const match = errorText.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function CompileErrorPanel({ compileError }: { compileError: string }) {
  const missingAssets = extractCsvLine(compileError, 'Missing assets');
  const writtenAssets = extractCsvLine(compileError, 'Assets written');

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-xs leading-6 text-rose-700">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">Compile error</div>

      {missingAssets.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">Missing assets</div>
          <div className="flex flex-wrap gap-2">
            {missingAssets.map((asset) => (
              <div key={asset} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] text-rose-700">
                {asset}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {writtenAssets.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">Assets written</div>
          <div className="flex flex-wrap gap-2">
            {writtenAssets.map((asset) => (
              <div key={asset} className="rounded-full border border-rose-100 bg-white px-3 py-1 text-[11px] text-rose-700">
                {asset}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <pre className="whitespace-pre-wrap break-words font-sans">{compileError}</pre>
    </div>
  );
}

export function PdfViewer() {
  const pdfBase64 = useAppStore((state) => state.ui.preview.pdfBase64);
  const status = useAppStore((state) => state.ui.preview.status);
  const compileError = useAppStore((state) => state.ui.preview.compileError);

  const pdfSrc = useMemo(() => {
    if (!pdfBase64) {
      return null;
    }

    return `data:application/pdf;base64,${pdfBase64}`;
  }, [pdfBase64]);

  if (!pdfSrc) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white px-8 text-center text-sm leading-7 text-slate-500">
        <div>{status === 'compiling' ? 'Compiling PDF preview…' : 'No preview yet.'}</div>
        {status === 'error' && compileError ? <div className="mt-4 max-w-full"><CompileErrorPanel compileError={compileError} /></div> : null}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-slate-300 bg-white shadow-[0_20px_54px_rgba(15,23,42,0.12)]">
      {status === 'error' && compileError ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
          <CompileErrorPanel compileError={compileError} />
        </div>
      ) : null}
      <iframe title="PDF Preview" src={pdfSrc} className="h-full min-h-[760px] w-full bg-white" />
    </div>
  );
}
