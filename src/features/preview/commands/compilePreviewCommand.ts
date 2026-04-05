import { type CompileLatexAsset, compileLatex } from '../../../compiler/latexCompilerClient';
import { buildLatexDocumentResult } from '../../../domain/document/latex/buildLatexDocument';
import { useAppStore } from '../../../store/useAppStore';

let compileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestScheduledCompile: Promise<string | null> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function objectUrlToCompileAsset(name: string, mimeType: string | undefined, objectUrl: string): Promise<CompileLatexAsset> {
  const response = await fetch(objectUrl);
  if (!response.ok) {
    throw new Error(`Failed to read local asset blob for ${name}.`);
  }

  const buffer = await response.arrayBuffer();
  return {
    name,
    mimeType,
    base64: arrayBufferToBase64(buffer),
  };
}

async function collectCompileAssets(): Promise<CompileLatexAsset[]> {
  const { document, files } = useAppStore.getState();
  const { assets } = buildLatexDocumentResult({
    meta: document.meta,
    sectionsById: document.sectionsById,
    sectionOrder: document.sectionOrder,
    filesById: files.byId,
  });

  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.objectUrl) {
        throw new Error(`Image asset ${asset.name} has no object URL.`);
      }

      return objectUrlToCompileAsset(asset.name, asset.mimeType, asset.objectUrl);
    }),
  );
}

export async function compilePreviewCommand(): Promise<string | null> {
  const { document, files, actions } = useAppStore.getState();

  actions.setPreviewState({
    status: 'compiling',
    compileError: undefined,
  });

  try {
    const { latex } = buildLatexDocumentResult({
      meta: document.meta,
      sectionsById: document.sectionsById,
      sectionOrder: document.sectionOrder,
      filesById: files.byId,
    });
    const assets = await collectCompileAssets();

    const response = await compileLatex({ latex, assets });

    useAppStore.getState().actions.setDocumentMeta({
      lastCompiledAt: Date.now(),
    });

    useAppStore.getState().actions.setPreviewState({
      status: 'ready',
      pdfBase64: response.pdf_base64,
      compileError: undefined,
      needsRefresh: false,
    });

    return response.pdf_base64;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compile preview.';

    useAppStore.getState().actions.setPreviewState({
      status: 'error',
      compileError: message,
      needsRefresh: true,
    });

    throw error;
  }
}

export function scheduleCompilePreviewCommand(delayMs = 700): Promise<string | null> {
  if (compileDebounceTimer) {
    clearTimeout(compileDebounceTimer);
  }

  latestScheduledCompile = new Promise((resolve, reject) => {
    compileDebounceTimer = setTimeout(() => {
      compilePreviewCommand().then(resolve).catch(reject);
    }, delayMs);
  });

  return latestScheduledCompile;
}
