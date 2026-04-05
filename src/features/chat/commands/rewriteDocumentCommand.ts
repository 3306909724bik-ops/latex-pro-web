import { requestOpenAIJson, getBrowserOpenAIConfig } from '../../../domain/ai/openaiClient';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { useAppStore } from '../../../store/useAppStore';
import type { DocumentSection, RootState } from '../../../store/types';
import { normalizeDocumentBlocks } from '../../../domain/document/structuredBlocks';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function isChinesePrompt(prompt: string): boolean {
  return /[\u4e00-\u9fff]/.test(prompt);
}

function extractPlainSummary(content: string, maxLength = 220): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function shortenContent(content: string): string {
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return content.length > 220 ? `${content.slice(0, 220)}...` : content;
  }

  const kept = paragraphs.slice(0, Math.max(1, Math.ceil(paragraphs.length * 0.6)));
  return kept.join('\n\n');
}

function makeEnglishRewrite(section: DocumentSection): string {
  const summary = extractPlainSummary(section.content, 260);
  return [
    `This section addresses ${section.title.toLowerCase()} within the current report.`,
    `The main point can be summarized as follows: ${summary}`,
    'In the next revision stage, this section should be refined with more precise evidence, smoother academic phrasing, and tighter alignment with the uploaded requirements and results.',
  ].join('\n\n');
}

function makeChineseRewrite(section: DocumentSection): string {
  const summary = extractPlainSummary(section.content, 180);
  return [
    `本节围绕“${section.title}”展开，当前需要在整篇报告框架下保持更一致的中文学术表达。`,
    `就现有内容而言，可以先概括为：${summary}`,
    '后续迭代中，本节应继续结合上传材料，对论证逻辑、术语表达和证据整合进行细化与收束。',
  ].join('\n\n');
}

function getRewriteReferencedFileIds(state: RootState): string[] {
  return (['requirement', 'results', 'reference'] as const).flatMap((bucket) => state.files.idsByBucket[bucket]);
}

function buildRewriteDocumentPrompt(state: RootState, userPrompt: string): string {
  const files = (['requirement', 'results', 'reference'] as const).flatMap((bucket) =>
    state.files.idsByBucket[bucket]
      .map((fileId) => state.files.byId[fileId])
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
      .map((file) => ({
        id: file.id,
        bucket,
        name: file.name,
        note: file.note,
        parsedText: file.parsedText ?? '',
      })),
  );

  const sections = state.document.sectionOrder
    .map((sectionId) => state.document.sectionsById[sectionId])
    .filter((section): section is DocumentSection => Boolean(section))
    .map((section) => ({
      id: section.id,
      key: section.key,
      title: section.title,
      content: section.content,
      blocks: section.blocks ?? [],
      linkedFileIds: section.linkedFileIds,
    }));

  return JSON.stringify({
    instruction: userPrompt,
    documentMeta: state.document.meta,
    files,
    sections,
    requiredOutput: {
      sections: [{ id: 'same id', content: 'rewritten content only', blocks: [{ type: 'table or chart' }] }],
    },
    constraints: [
      'Rewrite the current document in place.',
      'Do not create or remove sections unless explicitly instructed.',
      'Preserve section ids exactly.',
      'Return only valid JSON.',
      'Do not echo the instruction verbatim inside section prose.',
      'Use structured blocks for tables/charts instead of raw LaTeX.',
    ],
  });
}

function applyFallbackRewrite(state: RootState, userPrompt: string): DocumentSection[] {
  const prompt = userPrompt.toLowerCase();
  const wantsEnglish = /english|英文|英语/.test(prompt);
  const wantsChinese = /chinese|中文|汉语/.test(prompt);
  const wantsShorter = /shorter|shorten|简短|缩短|精简|更短/.test(prompt);

  return state.document.sectionOrder
    .map((sectionId) => state.document.sectionsById[sectionId])
    .filter((section): section is DocumentSection => Boolean(section))
    .map((section) => {
      let nextContent = section.content;

      if (wantsShorter) {
        nextContent = shortenContent(nextContent);
      }

      if (wantsEnglish) {
        nextContent = makeEnglishRewrite({ ...section, content: nextContent });
      } else if (wantsChinese) {
        nextContent = makeChineseRewrite({ ...section, content: nextContent });
      } else if (!wantsShorter) {
        const isChinese = isChinesePrompt(userPrompt);
        nextContent = isChinese
          ? [
              `根据全局指令“${userPrompt}”，本节已按整篇文稿的一致风格进行重新组织。`,
              nextContent,
              '后续可继续通过 section-level AI 对本节单独做扩写、压缩、润色或翻译。',
            ].join('\n\n')
          : [
              `This section has been globally revised according to the instruction: ${userPrompt}.`,
              nextContent,
              'Further local refinements can still be applied through the section-level AI controls.',
            ].join('\n\n');
      }

      return {
        ...section,
        content: nextContent,
        updatedAt: Date.now(),
        status: 'idle',
      };
    });
}

export async function rewriteDocumentCommand(userPrompt: string): Promise<void> {
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
    content: 'Revising current document...',
    createdAt: Date.now(),
    status: 'streaming',
  });

  try {
    const currentState = useAppStore.getState();
    if (!getBrowserOpenAIConfig()) {
      throw new Error('Full AI access is locked or the backend proxy is not configured. Unlock the demo and check the server env.');
    }

    const aiPayload = await requestOpenAIJson<{ sections: Array<{ id: string; content: string; blocks?: unknown[] }> }>(
      [
        'You revise an existing academic report in place.',
        'Preserve the same section ids and overall structure.',
        'Rewrite section bodies and optional structured blocks only.',
        'Return only valid JSON in the requested schema.',
        'Never paste the user instruction into the report body unless it belongs as actual prose.',
        'Use structured blocks for tables/charts instead of raw LaTeX.',
      ].join(' '),
      buildRewriteDocumentPrompt(currentState, userPrompt),
    );

    const rewrittenById = new Map(
      aiPayload.sections.map((section) => [section.id, { content: section.content, blocks: normalizeDocumentBlocks(section.blocks) }]),
    );
    const nextSections = currentState.document.sectionOrder
      .map((sectionId) => currentState.document.sectionsById[sectionId])
      .filter((section): section is DocumentSection => Boolean(section))
      .map((section) => ({
        ...section,
        content: rewrittenById.get(section.id)?.content?.trim() || section.content,
        blocks: rewrittenById.get(section.id)?.blocks ?? section.blocks ?? [],
        updatedAt: Date.now(),
        status: 'idle',
      }));

    for (const section of nextSections) {
      const existing = currentState.document.sectionsById[section.id];
      if (!existing) {
        continue;
      }

      currentState.actions.pushSectionSnapshot(section.id, {
        id: generateId('snapshot'),
        sectionId: section.id,
        content: existing.content,
        blocks: existing.blocks,
        createdAt: Date.now(),
        reason: 'ai-edit',
      });

      currentState.actions.updateSectionContent(section.id, section.content);
      currentState.actions.updateSectionBlocks(section.id, section.blocks ?? []);
      currentState.actions.updateSectionStatus(section.id, 'idle');
    }

    const blockCount = nextSections.reduce((total, section) => total + (section.blocks?.length ?? 0), 0);

    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: `The current report has been revised in place.${blockCount > 0 ? ` Structured blocks now present: ${blockCount}.` : ''}`,
      status: 'done',
      referencedFileIds: getRewriteReferencedFileIds(currentState),
    });

    try {
      await scheduleCompilePreviewCommand();
    } catch {
      // keep rewrite success even if compile fails
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rewrite current document.';

    const fallbackSections = applyFallbackRewrite(useAppStore.getState(), userPrompt);
    if (fallbackSections.length > 0) {
      for (const section of fallbackSections) {
        const existing = useAppStore.getState().document.sectionsById[section.id];
        if (!existing) {
          continue;
        }

        useAppStore.getState().actions.pushSectionSnapshot(section.id, {
          id: generateId('snapshot'),
          sectionId: section.id,
          content: existing.content,
          blocks: existing.blocks,
          createdAt: Date.now(),
          reason: 'ai-edit',
        });
        useAppStore.getState().actions.updateSectionContent(section.id, section.content);
        useAppStore.getState().actions.updateSectionBlocks(section.id, section.blocks ?? []);
        useAppStore.getState().actions.updateSectionStatus(section.id, 'idle');
      }

      useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
        content: `${message} Falling back to local rewrite heuristics.`,
        status: 'done',
        referencedFileIds: getRewriteReferencedFileIds(useAppStore.getState()),
      });
      return;
    }

    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: message,
      status: 'error',
      error: message,
    });
    throw error;
  }
}
