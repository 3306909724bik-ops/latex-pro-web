import type { FileBucket, RootState } from '../../../store/types';

interface PromptFileContext {
  id: string;
  bucket: FileBucket;
  name: string;
  mimeType: string;
  note: string;
  parsedText: string;
}

function collectWorkspaceFiles(state: RootState): PromptFileContext[] {
  return (['requirement', 'results', 'reference'] as const).flatMap((bucket) =>
    state.files.idsByBucket[bucket]
      .map((fileId) => state.files.byId[fileId])
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
      .map((file) => ({
        id: file.id,
        bucket,
        name: file.name,
        mimeType: file.mimeType,
        note: file.note,
        parsedText: file.parsedText ?? '',
      })),
  );
}

function isLikelyImageAnalysis(file: PromptFileContext): boolean {
  return file.mimeType.toLowerCase().startsWith('image/') && file.parsedText.startsWith('[Image');
}

function extractSuggestedCaption(parsedText: string): string {
  const match = parsedText.match(/Suggested caption:\n([^\n]+)/i);
  return match?.[1]?.trim() || '';
}

function extractSuggestedSection(parsedText: string): string {
  const match = parsedText.match(/Suggested section:\s*([^\n]+)/i);
  return match?.[1]?.trim() || '';
}

function extractShouldInsert(parsedText: string): boolean {
  return /Should insert into report:\s*yes/i.test(parsedText);
}

function formatFigureCandidateBlock(file: PromptFileContext): string {
  return [
    `fileId: ${file.id}`,
    `bucket: ${file.bucket}`,
    `name: ${file.name}`,
    `suggestedSection: ${extractSuggestedSection(file.parsedText) || '(unspecified)'}`,
    `shouldInsertIntoReport: ${extractShouldInsert(file.parsedText) ? 'yes' : 'maybe'}`,
    `suggestedCaption: ${extractSuggestedCaption(file.parsedText) || '(none)'}`,
  ].join('\n');
}

function formatFileBlock(file: PromptFileContext): string {
  return [
    `fileId: ${file.id}`,
    `bucket: ${file.bucket}`,
    `name: ${file.name}`,
    `mimeType: ${file.mimeType}`,
    `note: ${file.note || '(none)'}`,
    'content:',
    file.parsedText || '(empty)',
  ].join('\n');
}

export function getGlobalPromptReferencedFileIds(state: RootState): string[] {
  return collectWorkspaceFiles(state).map((file) => file.id);
}

export function buildGlobalDocumentPrompt(state: RootState, userPrompt: string): string {
  const files = collectWorkspaceFiles(state);
  const fileContext = files.length
    ? files.map(formatFileBlock).join('\n\n-----\n\n')
    : 'No workspace files are available.';
  const figureCandidates = files.filter(isLikelyImageAnalysis);
  const figureCandidateContext = figureCandidates.length
    ? figureCandidates.map(formatFigureCandidateBlock).join('\n\n-----\n\n')
    : 'No analyzed image candidates are available.';

  const templateContext = [
    'Template requirements:',
    '- Use an article document structure suitable for scholarly reporting.',
    '- Golden Standard defaults: letterpaper, 1in margin, onehalfspacing.',
    '- Required packages in downstream LaTeX build: amsmath, amssymb, graphicx, booktabs, hyperref.',
  ].join('\n');

  const outputContract = [
    'Return strict JSON with this exact top-level shape:',
    '{',
    '  "meta": {',
    '    "title": string,',
    '    "subtitle"?: string,',
    '    "authors": string[],',
    '    "abstract"?: string',
    '  },',
    '  "sections": [',
    '    {',
    '      "key": string,',
    '      "title": string,',
    '      "level": 1 | 2,',
    '      "content": string,',
    '      "linkedFileIds": string[],',
    '      "blocks"?: [',
    '        {',
    '          "type": "table",',
    '          "title"?: string,',
    '          "columns": string[],',
    '          "rows": string[][],',
    '          "note"?: string',
    '        },',
    '        {',
    '          "type": "chart",',
    '          "chartType": "bar" | "line" | "pie" | "scatter",',
    '          "title"?: string,',
    '          "x": string[],',
    '          "series": [{ "label": string, "values": number[] }],',
    '          "yLabel"?: string,',
    '          "note"?: string',
    '        },',
    '        {',
    '          "type": "image",',
    '          "assetFileId": string,',
    '          "title"?: string,',
    '          "caption"?: string,',
    '          "widthPercent"?: number,',
    '          "placement"?: "htbp" | "t" | "b" | "p"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    'Do not wrap the JSON in markdown fences.',
    'Generate a full report draft, not a mere outline.',
    'Write normal paragraph prose into content.',
    'If a section needs a table, emit a structured table block instead of raw LaTeX tabular syntax.',
    'If a section needs a chart, emit a structured chart block instead of raw LaTeX/TikZ/ASCII art.',
    'If a results/reference image is clearly useful, emit a structured image block that references the real uploaded fileId via assetFileId.',
    'Allowed chart types for now: bar, line, pie, scatter.',
    'When workspace image analysis is available, use it to decide whether a figure should be inserted and to draft a caption.',
    'Prefer image blocks for analyzed figure candidates marked shouldInsertIntoReport: yes.',
    'Do not output fragile raw LaTeX environments inside content.',
  ].join('\n');

  return [
    'System role: You are an expert academic writing assistant.',
    'Your job is to draft a complete, coherent scholarly report from the provided workspace materials.',
    'Prioritize clarity, formal tone, evidence-grounded writing, and complete section prose.',
    '',
    templateContext,
    '',
    outputContract,
    '',
    'User request:',
    userPrompt || '(empty user request)',
    '',
    'Analyzed figure candidates:',
    figureCandidateContext,
    '',
    'Workspace files:',
    fileContext,
  ].join('\n');
}
