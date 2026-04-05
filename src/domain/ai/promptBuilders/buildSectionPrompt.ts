import type { FileBucket, RootState } from '../../../store/types';

interface SectionPromptFileContext {
  id: string;
  bucket: FileBucket;
  name: string;
  mimeType: string;
  note: string;
  parsedText: string;
}

function toSectionPromptFileContext(file: NonNullable<RootState['files']['byId'][string]>): SectionPromptFileContext {
  return {
    id: file.id,
    bucket: file.bucket,
    name: file.name,
    mimeType: file.mimeType,
    note: file.note,
    parsedText: file.parsedText ?? '',
  };
}

function isWorkspaceImageFile(file: NonNullable<RootState['files']['byId'][string]>): boolean {
  return file.mimeType.toLowerCase().startsWith('image/');
}

function isLikelyImageAnalysis(file: SectionPromptFileContext): boolean {
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

function collectSectionFiles(state: RootState, sectionId: string): SectionPromptFileContext[] {
  const section = state.document.sectionsById[sectionId];
  if (!section) {
    return [];
  }

  const linkedFiles = section.linkedFileIds
    .map((fileId) => state.files.byId[fileId])
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  const supplementalResultImages = state.files.idsByBucket.results
    .map((fileId) => state.files.byId[fileId])
    .filter((file): file is NonNullable<typeof file> => Boolean(file) && isWorkspaceImageFile(file));

  const supplementalReferenceImages = state.files.idsByBucket.reference
    .map((fileId) => state.files.byId[fileId])
    .filter((file): file is NonNullable<typeof file> => Boolean(file) && isWorkspaceImageFile(file));

  return Array.from(new Map([...linkedFiles, ...supplementalResultImages, ...supplementalReferenceImages].map((file) => [file.id, file])).values()).map(
    toSectionPromptFileContext,
  );
}

function formatSectionFileBlock(file: SectionPromptFileContext): string {
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

function formatFigureCandidateBlock(file: SectionPromptFileContext): string {
  return [
    `fileId: ${file.id}`,
    `bucket: ${file.bucket}`,
    `name: ${file.name}`,
    `suggestedSection: ${extractSuggestedSection(file.parsedText) || '(unspecified)'}`,
    `shouldInsertIntoReport: ${extractShouldInsert(file.parsedText) ? 'yes' : 'maybe'}`,
    `suggestedCaption: ${extractSuggestedCaption(file.parsedText) || '(none)'}`,
  ].join('\n');
}

export function getSectionPromptReferencedFileIds(state: RootState, sectionId: string): string[] {
  return collectSectionFiles(state, sectionId).map((file) => file.id);
}

export function buildSectionPrompt(state: RootState, sectionId: string, userPrompt: string): string {
  const section = state.document.sectionsById[sectionId];
  if (!section) {
    throw new Error(`Section ${sectionId} not found.`);
  }

  const files = collectSectionFiles(state, sectionId);
  const fileContext = files.map(formatSectionFileBlock).join('\n\n-----\n\n');
  const figureCandidateContext = files.filter(isLikelyImageAnalysis).map(formatFigureCandidateBlock).join('\n\n-----\n\n');

  return [
    'System role: You are revising exactly one section inside an academic report.',
    'Revise only the requested section body and structured blocks. Preserve academic tone, precision, and coherence with the larger document.',
    'Return only valid JSON with this exact shape:',
    '{ "content": string, "blocks"?: [{ "type": "table" | "chart" | "image", ... }] }',
    'Use structured table/chart/image blocks instead of raw LaTeX when tabular, statistical, or figure visuals are needed.',
    'Allowed chart types for now: bar, line, pie, scatter.',
    'If linked file context includes image analysis and the figure should appear in this section, emit an image block with the real assetFileId.',
    'Prefer analyzed figure candidates marked shouldInsertIntoReport: yes.',
    'Do not add markdown fences.',
    '',
    `Document title: ${state.document.meta.title || 'Untitled Report'}`,
    `Section key: ${section.key}`,
    `Section title: ${section.title}`,
    '',
    'Current section content:',
    section.content || '(empty)',
    '',
    'Current structured blocks:',
    JSON.stringify(section.blocks ?? [], null, 2),
    '',
    'User instruction:',
    userPrompt || '(empty instruction)',
    '',
    'Analyzed figure candidates:',
    figureCandidateContext || 'No analyzed figure candidates available.',
    '',
    'Linked file context:',
    fileContext || 'No linked files available.',
  ].join('\n');
}
