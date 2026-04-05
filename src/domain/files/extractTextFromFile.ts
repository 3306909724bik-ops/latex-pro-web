import { analyzeImageFile } from './analyzeImageFile';

function normalizeExtractedText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isTextLikeFile(file: File, fileName: string, mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('csv') ||
    fileName.endsWith('.tex') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.json')
  );
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) {
      pages.push(`[Page ${pageNumber}]\n${pageText}`);
    }
  }

  if (pages.length === 0) {
    return `[PDF uploaded: ${file.name}]\nNo extractable text was found. The PDF may be scanned, image-only, or protected.`;
  }

  return normalizeExtractedText(pages.join('\n\n'));
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  const warningText = result.messages.length
    ? `\n\n[DOCX extraction notes]\n${result.messages.map((message) => `- ${message.message}`).join('\n')}`
    : '';

  const extracted = normalizeExtractedText(result.value);
  if (!extracted) {
    return `[DOCX uploaded: ${file.name}]\nNo readable text was extracted.${warningText}`.trim();
  }

  return `${extracted}${warningText}`.trim();
}

export async function extractTextFromFile(file: File): Promise<string> {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  if (isTextLikeFile(file, fileName, mimeType)) {
    return normalizeExtractedText(await file.text());
  }

  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName)) {
    return normalizeExtractedText(await analyzeImageFile(file));
  }

  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractPdfText(file);
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    return extractDocxText(file);
  }

  if (mimeType === 'application/msword' || fileName.endsWith('.doc')) {
    return `[DOC uploaded: ${file.name}]\nLegacy .doc extraction is not wired yet. Please resave as .docx or paste plain text for full AI context.`;
  }

  return `[Binary file uploaded: ${file.name}]\nMIME type: ${file.type || 'unknown'}\nSize: ${file.size} bytes\nNo text extractor is currently available for this format.`;
}
