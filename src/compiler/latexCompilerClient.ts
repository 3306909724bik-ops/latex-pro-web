export interface CompileLatexAsset {
  name: string;
  mimeType?: string;
  base64: string;
}

export interface CompileLatexRequest {
  latex: string;
  assets?: CompileLatexAsset[];
  signal?: AbortSignal;
}

export interface CompileLatexSuccessResponse {
  pdf_base64: string;
}

export interface LatexCompilerErrorDetails {
  status?: number;
  statusText?: string;
  responseBody?: unknown;
  cause?: unknown;
}

export class LatexCompilerError extends Error {
  public readonly status?: number;
  public readonly statusText?: string;
  public readonly responseBody?: unknown;
  public readonly cause?: unknown;

  constructor(message: string, details: LatexCompilerErrorDetails = {}) {
    super(message);
    this.name = 'LatexCompilerError';
    this.status = details.status;
    this.statusText = details.statusText;
    this.responseBody = details.responseBody;
    this.cause = details.cause;
  }
}

export const LATEX_COMPILER_ENDPOINT =
  'https://latex-compiler-433903666419.us-central1.run.app/api/compile';

function isCompileLatexSuccessResponse(value: unknown): value is CompileLatexSuccessResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CompileLatexSuccessResponse>;
  return typeof candidate.pdf_base64 === 'string' && candidate.pdf_base64.length > 0;
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatCompilerDetailObject(payload: Record<string, unknown>): string {
  const lines: string[] = [];

  if (typeof payload.message === 'string' && payload.message.trim()) {
    lines.push(payload.message.trim());
  }

  if (Array.isArray(payload.assets_written) && payload.assets_written.length > 0) {
    lines.push(`Assets written: ${payload.assets_written.map(String).join(', ')}`);
  }

  if (Array.isArray(payload.missing_assets) && payload.missing_assets.length > 0) {
    lines.push(`Missing assets: ${payload.missing_assets.map(String).join(', ')}`);
  }

  if (typeof payload.log === 'string' && payload.log.trim()) {
    lines.push(`Log:\n${payload.log.trim()}`);
  }

  return lines.join('\n\n').trim();
}

function extractCompilerMessage(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload.trim() || null;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.detail && typeof candidate.detail === 'object') {
    const formatted = formatCompilerDetailObject(candidate.detail as Record<string, unknown>);
    if (formatted) {
      return formatted;
    }
  }

  const keysToTry = ['error', 'message', 'detail', 'details', 'stderr', 'stdout', 'log'];

  for (const key of keysToTry) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return JSON.stringify(payload);
}

function buildCompilerRequestBody({ latex, assets }: Pick<CompileLatexRequest, 'latex' | 'assets'>): string {
  return JSON.stringify({
    latex,
    ...(assets && assets.length > 0 ? { assets } : {}),
  });
}

function addAssetAwareCompilerHint(message: string, assets?: CompileLatexAsset[]): string {
  if (!assets || assets.length === 0) {
    return message;
  }

  const lowered = message.toLowerCase();
  const looksLikeMissingAsset =
    lowered.includes('file not found') ||
    lowered.includes('cannot find') ||
    lowered.includes('no such file') ||
    lowered.includes('unable to load picture') ||
    lowered.includes('error reading image file') ||
    lowered.includes('missing assets:') ||
    lowered.includes('! package pdftex.def error');

  if (!looksLikeMissingAsset) {
    return message;
  }

  return `${message}

Hint: the frontend already sent ${assets.length} compile asset(s). If the referenced figure file is still missing during LaTeX compile, the backend probably has not written assets[] into the temp compile directory yet, or LaTeX is referencing a different asset filename than the one that was written.`;
}

export async function compileLatex({ latex, assets, signal }: CompileLatexRequest): Promise<CompileLatexSuccessResponse> {
  if (typeof latex !== 'string' || latex.trim().length === 0) {
    throw new LatexCompilerError('LaTeX source must be a non-empty string.');
  }

  if (assets && !Array.isArray(assets)) {
    throw new LatexCompilerError('LaTeX assets must be an array when provided.');
  }

  let response: Response;

  try {
    response = await fetch(LATEX_COMPILER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: buildCompilerRequestBody({ latex, assets }),
      signal,
    });
  } catch (error) {
    throw new LatexCompilerError('Failed to reach the LaTeX compiler service.', {
      cause: error,
    });
  }

  const payload = await safeReadJson(response);

  if (!response.ok) {
    const compilerMessage = extractCompilerMessage(payload);
    const finalMessage = compilerMessage
      ? addAssetAwareCompilerHint(
          `LaTeX compiler request failed (${response.status} ${response.statusText}): ${compilerMessage}`,
          assets,
        )
      : `LaTeX compiler request failed (${response.status} ${response.statusText}).`;

    throw new LatexCompilerError(finalMessage, {
      status: response.status,
      statusText: response.statusText,
      responseBody: payload,
    });
  }

  if (!isCompileLatexSuccessResponse(payload)) {
    throw new LatexCompilerError('LaTeX compiler returned an unexpected response shape.', {
      status: response.status,
      statusText: response.statusText,
      responseBody: payload,
    });
  }

  return payload;
}
