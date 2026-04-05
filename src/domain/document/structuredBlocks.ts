import type {
  DocumentBlock,
  DocumentChartBlock,
  DocumentChartSeries,
  DocumentImageBlock,
  DocumentSection,
  DocumentTableBlock,
} from '../../store/types';

function createFallbackId(prefix: string, index: number): string {
  return `${prefix}_${Date.now()}_${index}`;
}

function normalizeTableBlock(input: unknown, index: number): DocumentTableBlock | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<DocumentTableBlock>;
  const columns = Array.isArray(candidate.columns)
    ? candidate.columns.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows
        .filter((row) => Array.isArray(row))
        .map((row) => (row as unknown[]).map((cell) => String(cell ?? '').trim()))
    : [];

  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createFallbackId('table', index),
    type: 'table',
    title: typeof candidate.title === 'string' ? candidate.title.trim() : undefined,
    columns,
    rows,
    note: typeof candidate.note === 'string' ? candidate.note.trim() : undefined,
  };
}

function normalizeSeries(input: unknown): DocumentChartSeries | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<DocumentChartSeries>;
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  const values = Array.isArray(candidate.values)
    ? candidate.values
        .map((value) => {
          const numeric = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(numeric) ? numeric : null;
        })
        .filter((value): value is number => value !== null)
    : [];

  if (!label || values.length === 0) {
    return null;
  }

  return { label, values };
}

function normalizeChartBlock(input: unknown, index: number): DocumentChartBlock | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<DocumentChartBlock>;
  const x = Array.isArray(candidate.x)
    ? candidate.x.map((value) => String(value ?? '').trim()).filter((value): value is string => Boolean(value))
    : [];
  const series = Array.isArray(candidate.series)
    ? candidate.series.map(normalizeSeries).filter((value): value is DocumentChartSeries => Boolean(value))
    : [];
  const chartType = candidate.chartType;

  if (
    (chartType !== 'bar' && chartType !== 'line' && chartType !== 'pie' && chartType !== 'scatter') ||
    x.length === 0 ||
    series.length === 0
  ) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createFallbackId('chart', index),
    type: 'chart',
    chartType,
    title: typeof candidate.title === 'string' ? candidate.title.trim() : undefined,
    x,
    series,
    yLabel: typeof candidate.yLabel === 'string' ? candidate.yLabel.trim() : undefined,
    note: typeof candidate.note === 'string' ? candidate.note.trim() : undefined,
  };
}

function normalizeImageBlock(input: unknown, index: number): DocumentImageBlock | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Partial<DocumentImageBlock>;
  const assetFileId = typeof candidate.assetFileId === 'string' ? candidate.assetFileId.trim() : '';
  if (!assetFileId) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createFallbackId('image', index),
    type: 'image',
    assetFileId,
    title: typeof candidate.title === 'string' ? candidate.title.trim() : undefined,
    caption: typeof candidate.caption === 'string' ? candidate.caption.trim() : undefined,
    widthPercent:
      typeof candidate.widthPercent === 'number' && Number.isFinite(candidate.widthPercent)
        ? Math.min(Math.max(candidate.widthPercent, 10), 100)
        : 85,
    placement:
      candidate.placement === 't' || candidate.placement === 'b' || candidate.placement === 'p' || candidate.placement === 'htbp'
        ? candidate.placement
        : 'htbp',
  };
}

export function normalizeDocumentBlocks(input: unknown): DocumentBlock[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((block, index) => {
      if (!block || typeof block !== 'object') {
        return null;
      }

      const type = (block as { type?: unknown }).type;
      if (type === 'table') {
        return normalizeTableBlock(block, index);
      }

      if (type === 'chart') {
        return normalizeChartBlock(block, index);
      }

      if (type === 'image') {
        return normalizeImageBlock(block, index);
      }

      return null;
    })
    .filter((block): block is DocumentBlock => Boolean(block));
}

export function normalizeDocumentSection(section: Partial<DocumentSection>, index: number): DocumentSection {
  const timestamp = Date.now();
  const title = typeof section.title === 'string' && section.title.trim() ? section.title.trim() : `Section ${index + 1}`;
  const id = typeof section.id === 'string' && section.id.trim() ? section.id : `section_${timestamp}_${index}`;
  const keySource = typeof section.key === 'string' && section.key.trim() ? section.key : title;

  const blocks = normalizeDocumentBlocks(section.blocks);
  const linkedFileIds = Array.isArray(section.linkedFileIds) ? section.linkedFileIds.map(String) : [];
  const imageFileIds = blocks
    .filter((block): block is DocumentImageBlock => block.type === 'image')
    .map((block) => block.assetFileId)
    .filter(Boolean);

  return {
    id,
    key: keySource.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').replace(/^-+|-+$/g, '') || `section-${index + 1}`,
    title,
    level: section.level === 2 ? 2 : 1,
    content: typeof section.content === 'string' ? section.content : '',
    blocks,
    summary: typeof section.summary === 'string' ? section.summary : undefined,
    status: 'idle',
    updatedAt: timestamp,
    linkedFileIds: Array.from(new Set([...linkedFileIds, ...imageFileIds])),
    localInstruction: typeof section.localInstruction === 'string' ? section.localInstruction : undefined,
  };
}
