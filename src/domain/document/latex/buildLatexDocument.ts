import type {
  DocumentBlock,
  DocumentChartBlock,
  DocumentImageBlock,
  DocumentSection,
  DocumentTableBlock,
  RootState,
  WorkspaceFile,
} from '../../../store/types';

export interface BuildLatexDocumentInput {
  meta: RootState['document']['meta'];
  sectionsById: RootState['document']['sectionsById'];
  sectionOrder: RootState['document']['sectionOrder'];
  filesById?: RootState['files']['byId'];
}

export interface LatexDocumentAssetRef {
  fileId: string;
  name: string;
  mimeType: string;
  objectUrl?: string;
}

export interface BuildLatexDocumentResult {
  latex: string;
  assets: LatexDocumentAssetRef[];
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function containsChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function renderSectionHeading(section: DocumentSection): string {
  const title = escapeLatex(section.title.trim() || 'Untitled Section');
  return section.level === 2 ? `\\subsection{${title}}` : `\\section{${title}}`;
}

function renderSectionBody(content: string): string {
  const normalized = normalizeLineEndings(content);

  if (!normalized) {
    return '';
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        return '';
      }

      return escapeLatex(trimmed);
    })
    .filter(Boolean)
    .join('\n\n');
}

function sanitizeColumnCount(table: DocumentTableBlock): number {
  const rowWidths = table.rows.map((row) => row.length);
  return Math.max(table.columns.length, ...rowWidths, 1);
}

function normalizeRow(row: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => escapeLatex(row[index] ?? ''));
}

function renderTableBlock(table: DocumentTableBlock): string {
  const columnCount = sanitizeColumnCount(table);
  const columnSpec = Array.from({ length: columnCount }, () => '>{\\raggedright\\arraybackslash}X').join(' ');
  const header = normalizeRow(table.columns, columnCount).join(' & ');
  const body = table.rows.map((row) => `${normalizeRow(row, columnCount).join(' & ')} \\\\`).join('\n');
  const caption = table.title?.trim() ? `\\caption{${escapeLatex(table.title.trim())}}` : '';
  const note = table.note?.trim()
    ? `\\vspace{0.35em}\\par\\footnotesize ${escapeLatex(table.note.trim())}`
    : '';

  return [
    '\\begin{table}[htbp]',
    '\\centering',
    '\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\renewcommand{\\arraystretch}{1.15}',
    caption,
    `\\begin{tabularx}{\\linewidth}{${columnSpec}}`,
    '\\toprule',
    `${header} \\\\`,
    '\\midrule',
    body,
    '\\bottomrule',
    '\\end{tabularx}',
    note,
    '\\end{table}',
  ]
    .filter(Boolean)
    .join('\n');
}

function toSafeCoordinateId(index: number): string {
  return `x${index}`;
}

function renderAxisChart(chart: DocumentChartBlock, mode: 'bar' | 'line' | 'scatter'): string {
  const coordinates = chart.x.map((_, index) => toSafeCoordinateId(index));
  const symbolicCoords = coordinates.join(',');
  const tickLabels = chart.x.map((label) => `{${escapeLatex(label)}}`).join(',');
  const title = chart.title?.trim() ? `title={${escapeLatex(chart.title.trim())}},` : '';
  const yLabel = chart.yLabel?.trim() ? `ylabel={${escapeLatex(chart.yLabel.trim())}},` : '';
  const note = chart.note?.trim()
    ? `\\vspace{0.35em}\\par\\footnotesize ${escapeLatex(chart.note.trim())}`
    : '';

  const plots = chart.series
    .map((series) => {
      const points = coordinates
        .map((coordinate, index) => {
          const value = Number.isFinite(series.values[index]) ? series.values[index] : 0;
          return `(${coordinate}, ${value})`;
        })
        .join(' ');

      const plotCommand =
        mode === 'bar'
          ? `\\addplot coordinates { ${points} };`
          : mode === 'line'
            ? `\\addplot+[mark=*, line width=1.1pt] coordinates { ${points} };`
            : `\\addplot+[only marks, mark=*, mark size=2.8pt] coordinates { ${points} };`;

      return [plotCommand, `\\addlegendentry{${escapeLatex(series.label)}}`].join('\n');
    })
    .join('\n');

  const modeOptions =
    mode === 'bar'
      ? ['ybar,', 'bar width=14pt,', 'nodes near coords,', 'every node near coord/.append style={font=\\scriptsize},']
      : mode === 'line'
        ? ['line width=1pt,']
        : ['scatter,', 'only marks,'];

  return [
    '\\begin{figure}[htbp]',
    '\\centering',
    '\\begin{tikzpicture}',
    '\\begin{axis}[',
    ...modeOptions,
    'width=0.92\\linewidth,',
    'height=0.42\\textheight,',
    'enlarge x limits=0.18,',
    'legend style={at={(0.5,-0.18)},anchor=north,legend columns=-1,draw=none},',
    'ylabel style={font=\\small},',
    'tick label style={font=\\small},',
    'label style={font=\\small},',
    `symbolic x coords={${symbolicCoords}},`,
    'xtick=data,',
    `xticklabels={${tickLabels}},`,
    'x tick label style={rotate=25,anchor=east},',
    'ymajorgrids=true,',
    `${title}`,
    `${yLabel}`,
    ']',
    plots,
    '\\end{axis}',
    '\\end{tikzpicture}',
    note,
    '\\end{figure}',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderPieChart(chart: DocumentChartBlock): string {
  const series = chart.series[0];
  const entries = chart.x
    .map((label, index) => {
      const value = Number.isFinite(series?.values[index]) ? series.values[index] : 0;
      return `${value}/${escapeLatex(label)}`;
    })
    .join(', ');
  const title = chart.title?.trim() ? `\\caption{${escapeLatex(chart.title.trim())}}` : '';
  const note = chart.note?.trim()
    ? `\\vspace{0.35em}\\par\\footnotesize ${escapeLatex(chart.note.trim())}`
    : '';

  return [
    '\\begin{figure}[htbp]',
    '\\centering',
    title,
    `\\pie[text=legend,radius=2.4]{${entries}}`,
    note,
    '\\end{figure}',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderChartBlock(chart: DocumentChartBlock): string {
  if (chart.chartType === 'pie') {
    return renderPieChart(chart);
  }

  if (chart.chartType === 'line') {
    return renderAxisChart(chart, 'line');
  }

  if (chart.chartType === 'scatter') {
    return renderAxisChart(chart, 'scatter');
  }

  return renderAxisChart(chart, 'bar');
}

function getFileExtension(file: Pick<WorkspaceFile, 'name' | 'mimeType'>): string | null {
  const normalizedMimeType = file.mimeType.toLowerCase();
  const normalizedName = file.name.trim().toLowerCase();

  if (normalizedMimeType === 'image/png' || normalizedName.endsWith('.png')) {
    return 'png';
  }

  if (normalizedMimeType === 'image/jpeg' || normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
    return 'jpg';
  }

  if (normalizedMimeType === 'application/pdf' || normalizedName.endsWith('.pdf')) {
    return 'pdf';
  }

  return null;
}

function sanitizeAssetBasename(value: string): string {
  return value
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildImageAssetName(image: DocumentImageBlock, file: Pick<WorkspaceFile, 'name' | 'mimeType'>): string | null {
  const extension = getFileExtension(file);
  if (!extension) {
    return null;
  }

  const base = sanitizeAssetBasename(file.name) || `image-${image.id}`;
  const safeFileId = image.assetFileId.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return `${base}-${safeFileId}.${extension}`;
}

function renderMissingImageBlock(image: DocumentImageBlock, message: string): string {
  const figureTitle = image.title?.trim() || 'Image block';
  const caption = image.caption?.trim() || 'Image asset could not be embedded into the compiled PDF.';

  return [
    `\\begin{figure}[${image.placement || 'htbp'}]`,
    '\\centering',
    `\\fbox{\\parbox{0.92\\linewidth}{\\centering\\textbf{${escapeLatex(figureTitle)}}\\\\[0.4em]\\footnotesize ${escapeLatex(message)}}}`,
    `\\caption{${escapeLatex(caption)}}`,
    '\\end{figure}',
  ].join('\n');
}

function renderImageBlock(
  image: DocumentImageBlock,
  filesById: RootState['files']['byId'] | undefined,
  assetRefs: Map<string, LatexDocumentAssetRef>,
): string {
  const file = filesById?.[image.assetFileId];

  if (!file) {
    return renderMissingImageBlock(image, `Linked asset file not found for file ID: ${image.assetFileId}.`);
  }

  if (!file.objectUrl) {
    return renderMissingImageBlock(image, `Image asset ${file.name} has no local object URL, so it cannot be sent to the compiler yet.`);
  }

  const assetName = buildImageAssetName(image, file);
  if (!assetName) {
    return renderMissingImageBlock(
      image,
      `Image asset ${file.name} is not in a PDF-safe format yet. Supported compile formats are PNG, JPG/JPEG, and PDF.`,
    );
  }

  if (!assetRefs.has(image.assetFileId)) {
    assetRefs.set(image.assetFileId, {
      fileId: image.assetFileId,
      name: assetName,
      mimeType: file.mimeType,
      objectUrl: file.objectUrl,
    });
  }

  const widthPercent = Number.isFinite(image.widthPercent) ? Math.min(Math.max(image.widthPercent ?? 85, 10), 100) : 85;
  const figureTitle = image.title?.trim();
  const captionParts = [image.caption?.trim(), figureTitle].filter(Boolean);
  const caption = captionParts.length > 0 ? `\\caption{${escapeLatex(captionParts.join(' — '))}}` : '';

  return [
    `\\begin{figure}[${image.placement || 'htbp'}]`,
    '\\centering',
    `\\includegraphics[width=${(widthPercent / 100).toFixed(2)}\\linewidth]{${assetName}}`,
    caption,
    '\\end{figure}',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderBlock(
  block: DocumentBlock,
  filesById: RootState['files']['byId'] | undefined,
  assetRefs: Map<string, LatexDocumentAssetRef>,
): string {
  if (block.type === 'table') {
    return renderTableBlock(block);
  }

  if (block.type === 'chart') {
    return renderChartBlock(block);
  }

  return renderImageBlock(block, filesById, assetRefs);
}

function renderSectionContent(
  section: DocumentSection,
  filesById: RootState['files']['byId'] | undefined,
  assetRefs: Map<string, LatexDocumentAssetRef>,
): string {
  const prose = renderSectionBody(section.content);
  const blocks = (section.blocks ?? []).map((block) => renderBlock(block, filesById, assetRefs)).filter(Boolean);

  if (!prose && blocks.length === 0) {
    return '% Section intentionally left blank';
  }

  return [prose, ...blocks].filter(Boolean).join('\n\n');
}

function renderAuthors(authors: string[]): string {
  const normalizedAuthors = authors
    .map((author) => author.trim())
    .filter(Boolean)
    .map(escapeLatex);

  return normalizedAuthors.length > 0 ? normalizedAuthors.join(' \\and ') : 'Unknown Author';
}

function renderAbstract(abstract?: string): string {
  const normalized = abstract?.trim();
  if (!normalized) {
    return '';
  }

  return ['\\begin{abstract}', escapeLatex(normalized), '\\end{abstract}'].join('\n');
}

export function buildLatexDocumentResult({ meta, sectionsById, sectionOrder, filesById }: BuildLatexDocumentInput): BuildLatexDocumentResult {
  const resolvedSections = sectionOrder
    .map((sectionId) => sectionsById[sectionId])
    .filter((section): section is DocumentSection => Boolean(section));

  const title = escapeLatex(meta.title.trim() || 'Untitled Report');
  const subtitle = meta.subtitle?.trim() ? `\\\\[0.5em]\\large ${escapeLatex(meta.subtitle.trim())}` : '';
  const authors = renderAuthors(meta.authors);
  const abstractBlock = renderAbstract(meta.abstract);
  const assetRefs = new Map<string, LatexDocumentAssetRef>();

  const renderedSections = resolvedSections
    .map((section) => [renderSectionHeading(section), renderSectionContent(section, filesById, assetRefs)].join('\n\n'))
    .join('\n\n');

  const rawTextForLanguageDetection = [
    meta.title,
    meta.subtitle,
    meta.abstract,
    ...meta.authors,
    ...resolvedSections.flatMap((section) => [section.title, section.content, ...(section.blocks ?? []).map((block) => JSON.stringify(block))]),
  ]
    .filter(Boolean)
    .join('\n');

  const requiresChineseSupport = containsChinese(rawTextForLanguageDetection);
  const hasCharts = resolvedSections.some((section) => (section.blocks ?? []).some((block) => block.type === 'chart'));
  const hasPieCharts = resolvedSections.some((section) =>
    (section.blocks ?? []).some((block) => block.type === 'chart' && block.chartType === 'pie'),
  );

  const documentParts = [
    '\\documentclass[letterpaper,11pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    ...(requiresChineseSupport
      ? ['\\usepackage[UTF8]{ctex}']
      : ['\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}']),
    '\\usepackage{setspace}',
    '\\onehalfspacing',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{booktabs}',
    '\\usepackage{array}',
    '\\usepackage{tabularx}',
    '\\usepackage[hidelinks]{hyperref}',
    ...(hasCharts ? ['\\usepackage{tikz}', '\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}'] : []),
    ...(hasPieCharts ? ['\\usepackage{pgf-pie}'] : []),
    '',
    `\\title{${title}${subtitle}}`,
    `\\author{${authors}}`,
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    abstractBlock,
    renderedSections,
    '\\end{document}',
  ];

  return {
    latex: documentParts.filter((part) => part.trim().length > 0).join('\n\n'),
    assets: Array.from(assetRefs.values()),
  };
}

export function buildLatexDocument(input: BuildLatexDocumentInput): string {
  return buildLatexDocumentResult(input).latex;
}

export default buildLatexDocument;
