import { buildGlobalDocumentPrompt, getGlobalPromptReferencedFileIds } from '../../../domain/ai/promptBuilders/buildGlobalDocumentPrompt';
import { requestOpenAIJson, getBrowserOpenAIConfig } from '../../../domain/ai/openaiClient';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { useAppStore } from '../../../store/useAppStore';
import type { GeneratedDocumentPayload, RootState, SnapshotReason } from '../../../store/types';
import { normalizeDocumentSection } from '../../../domain/document/structuredBlocks';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

async function requestGeneratedDocument(state: RootState, userPrompt: string): Promise<GeneratedDocumentPayload> {
  const prompt = buildGlobalDocumentPrompt(state, userPrompt);

  if (!getBrowserOpenAIConfig()) {
    throw new Error('Full AI access is locked or the backend proxy is not configured. Unlock the demo and check the server env.');
  }

  return requestOpenAIJson<GeneratedDocumentPayload>(
    [
      'You are an academic writing assistant for a desktop-first report workbench.',
      'Generate a full report, not just an outline.',
      'Return only valid JSON matching this shape:',
      '{"meta":{"title":"string","authors":["string"],"abstract":"string"},"sections":[{"id":"optional","key":"string","title":"string","level":1,"content":"string","linkedFileIds":["fileId"],"blocks":[{"type":"table","title":"string","columns":["string"],"rows":[["string"]],"note":"string"},{"type":"chart","chartType":"bar|line|pie|scatter","title":"string","x":["string"],"series":[{"label":"string","values":[1,2,3]}],"yLabel":"string"}]}],"sectionOrder":["sectionId"]}',
      'Each section must contain substantial academic prose.',
      'Use structured blocks for tables, charts, and figures instead of raw LaTeX.',
      'Image blocks must reference real uploaded files via assetFileId when appropriate.',
      'Allowed chart types for now: bar, line, pie, scatter.',
    ].join(' '),
    prompt,
  );
}

function normalizeGeneratedDocument(payload: GeneratedDocumentPayload): GeneratedDocumentPayload {
  const normalizedSections = payload.sections.map((section, index) => normalizeDocumentSection(section, index));

  return {
    meta: payload.meta,
    sections: normalizedSections,
    sectionOrder:
      payload.sectionOrder && payload.sectionOrder.length > 0
        ? payload.sectionOrder
        : normalizedSections.map((section) => section.id),
  };
}

function pushInitialSectionSnapshots(sectionIds: string[], reason: SnapshotReason): void {
  const state = useAppStore.getState();

  for (const sectionId of sectionIds) {
    const section = state.document.sectionsById[sectionId];
    if (!section) {
      continue;
    }

    state.actions.pushSectionSnapshot(sectionId, {
      id: generateId('snapshot'),
      sectionId,
      content: section.content,
      blocks: section.blocks,
      createdAt: Date.now(),
      reason,
    });
  }
}

export async function generateFullDocumentCommand(userPrompt: string): Promise<GeneratedDocumentPayload> {
  const initialState = useAppStore.getState();
  const userMessageId = generateId('chat');
  const assistantMessageId = generateId('chat');

  initialState.actions.addChatMessage({
    id: userMessageId,
    scope: { type: 'global' },
    role: 'user',
    content: userPrompt,
    createdAt: Date.now(),
    status: 'done',
  });

  initialState.actions.addChatMessage({
    id: assistantMessageId,
    scope: { type: 'global' },
    role: 'assistant',
    content: 'Generating full report...',
    createdAt: Date.now(),
    status: 'streaming',
  });

  try {
    const rawPayload = await requestGeneratedDocument(useAppStore.getState(), userPrompt);
    const payload = normalizeGeneratedDocument(rawPayload);

    useAppStore.getState().actions.replaceDocumentFromAI(payload);
    pushInitialSectionSnapshots(payload.sectionOrder ?? payload.sections.map((section) => section.id), 'ai-generate');

    const finalState = useAppStore.getState();
    const generatedTitles = payload.sections.map((section) => section.title).join(' / ');
    const blockCount = payload.sections.reduce((total, section) => total + (section.blocks?.length ?? 0), 0);

    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: `Full report generated successfully.\n\nSections: ${generatedTitles}${blockCount > 0 ? `\nStructured blocks: ${blockCount}` : ''}`,
      status: 'done',
      referencedFileIds: getGlobalPromptReferencedFileIds(finalState),
    });

    try {
      await scheduleCompilePreviewCommand();
    } catch {
      // Keep document generation successful even if preview compile fails.
    }

    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate full document.';

    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: message,
      status: 'error',
      error: message,
    });

    throw error;
  }
}
