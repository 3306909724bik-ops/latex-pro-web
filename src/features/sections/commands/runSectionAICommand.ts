import { buildSectionPrompt, getSectionPromptReferencedFileIds } from '../../../domain/ai/promptBuilders/buildSectionPrompt';
import { getBrowserOpenAIConfig, requestOpenAIJson } from '../../../domain/ai/openaiClient';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { useAppStore } from '../../../store/useAppStore';
import type { RootState } from '../../../store/types';
import { normalizeDocumentBlocks } from '../../../domain/document/structuredBlocks';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function shortenContent(content: string): string {
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return content.length > 220 ? `${content.slice(0, 220)}...` : content;
  }

  return paragraphs.slice(0, Math.max(1, Math.ceil(paragraphs.length * 0.6))).join('\n\n');
}

function expandContent(content: string, sectionTitle: string, isChinese: boolean): string {
  return isChinese
    ? [
        content,
        `进一步而言，本节“${sectionTitle}”仍可继续补充更明确的论证细节、材料解释与结构衔接，以便与整篇报告保持一致的学术表达。`,
      ].join('\n\n')
    : [
        content,
        `In addition, this ${sectionTitle} section can be expanded with more explicit reasoning, evidence interpretation, and smoother transitions so that it aligns better with the rest of the report.`,
      ].join('\n\n');
}

function rewriteSectionFallback(sectionTitle: string, sectionContent: string, userPrompt: string): { content: string; blocks: [] } {
  const lowered = userPrompt.toLowerCase();
  const isChinese = /[\u4e00-\u9fff]/.test(userPrompt);
  const wantsDelete = /删除|删掉|remove|delete/.test(lowered);
  const wantsShorter = /缩短|精简|简短|shorter|shorten/.test(lowered);
  const wantsExpand = /扩写|展开|更长|longer|expand/.test(lowered);
  const wantsEnglish = /英文|英语|english/.test(lowered);
  const wantsChinese = /中文|汉语|chinese/.test(lowered);
  const wantsFormal = /正式|学术|academic|formal|polish/.test(lowered);

  if (wantsDelete) {
    return { content: '', blocks: [] };
  }

  let nextContent = sectionContent;

  if (wantsShorter) {
    nextContent = shortenContent(nextContent);
  }

  if (wantsExpand) {
    nextContent = expandContent(nextContent, sectionTitle, isChinese);
  }

  if (wantsEnglish) {
    return {
      content: [
        `This section (${sectionTitle}) has been rewritten in a shorter English fallback form according to the latest instruction.`,
        nextContent.replace(/\s+/g, ' ').trim(),
      ].join('\n\n'),
      blocks: [],
    };
  }

  if (wantsChinese) {
    return {
      content: [`本节（${sectionTitle}）已根据最新指令转换为中文 fallback 版本。`, nextContent.replace(/\s+/g, ' ').trim()].join(
        '\n\n',
      ),
      blocks: [],
    };
  }

  if (wantsFormal) {
    return {
      content: isChinese
        ? `本节“${sectionTitle}”已按照更正式、更学术的表达方向进行整理。\n\n${nextContent}`
        : `This section (${sectionTitle}) has been revised toward a more formal academic register.\n\n${nextContent}`,
      blocks: [],
    };
  }

  return { content: nextContent, blocks: [] };
}

async function requestSectionRewrite(
  state: RootState,
  sectionId: string,
  userPrompt: string,
): Promise<{ content: string; blocks: ReturnType<typeof normalizeDocumentBlocks> }> {
  const prompt = buildSectionPrompt(state, sectionId, userPrompt);

  if (!getBrowserOpenAIConfig()) {
    throw new Error('Full AI access is locked or the backend proxy is not configured. Unlock the demo and check the server env.');
  }

  const response = await requestOpenAIJson<{ content: string; blocks?: unknown[] }>(
    [
      'You are revising one section in an academic report workbench.',
      'Return only valid JSON with the final section prose and optional structured blocks.',
      'Do not add markdown fences.',
      'Do not echo the instruction as a preface.',
      'Use structured table/chart/image blocks instead of raw LaTeX when needed.',
      'If a linked uploaded image should appear in the section, return an image block with the real assetFileId.',
      'Prefer analyzed figure candidates marked shouldInsertIntoReport: yes.',
    ].join(' '),
    prompt,
  );

  return {
    content: typeof response.content === 'string' ? response.content : '',
    blocks: normalizeDocumentBlocks(response.blocks),
  };
}

export async function runSectionAICommand(sectionId: string, userPrompt: string): Promise<string> {
  const initialState = useAppStore.getState();
  const section = initialState.document.sectionsById[sectionId];

  if (!section) {
    throw new Error(`Section ${sectionId} not found.`);
  }

  const userMessageId = generateId('chat');
  const assistantMessageId = generateId('chat');

  initialState.actions.addChatMessage({
    id: userMessageId,
    scope: { type: 'section', sectionId },
    role: 'user',
    content: userPrompt,
    createdAt: Date.now(),
    status: 'done',
    referencedFileIds: getSectionPromptReferencedFileIds(initialState, sectionId),
  });

  initialState.actions.addChatMessage({
    id: assistantMessageId,
    scope: { type: 'section', sectionId },
    role: 'assistant',
    content: `Applying AI update to ${section.title}...`,
    createdAt: Date.now(),
    status: 'streaming',
  });

  initialState.actions.pushSectionSnapshot(sectionId, {
    id: generateId('snapshot'),
    sectionId,
    content: section.content,
    blocks: section.blocks,
    createdAt: Date.now(),
    reason: 'ai-edit',
  });

  initialState.actions.updateSectionStatus(sectionId, 'generating');

  try {
    const next = await requestSectionRewrite(useAppStore.getState(), sectionId, userPrompt);

    useAppStore.getState().actions.updateSectionContent(sectionId, next.content);
    useAppStore.getState().actions.updateSectionBlocks(sectionId, next.blocks);
    useAppStore.getState().actions.updateSectionStatus(sectionId, 'idle');
    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: `Updated ${section.title}.${next.blocks.length > 0 ? ` Structured blocks: ${next.blocks.length}.` : ''}`,
      status: 'done',
      referencedFileIds: getSectionPromptReferencedFileIds(useAppStore.getState(), sectionId),
    });

    try {
      await scheduleCompilePreviewCommand();
    } catch {
      // Keep section update successful even if preview compile fails.
    }

    return next.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rewrite section.';
    const fallback = rewriteSectionFallback(section.title, section.content, userPrompt);

    useAppStore.getState().actions.updateSectionContent(sectionId, fallback.content);
    useAppStore.getState().actions.updateSectionBlocks(sectionId, fallback.blocks);
    useAppStore.getState().actions.updateSectionStatus(sectionId, 'error');
    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: message,
      status: 'error',
      error: message,
      referencedFileIds: getSectionPromptReferencedFileIds(useAppStore.getState(), sectionId),
    });

    throw error;
  }
}

