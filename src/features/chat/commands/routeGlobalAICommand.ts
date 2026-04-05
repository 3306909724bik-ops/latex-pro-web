import { generateFullDocumentCommand } from './generateFullDocumentCommand';
import { rewriteDocumentCommand } from './rewriteDocumentCommand';
import { chatWithWorkspaceCommand } from './chatWithWorkspaceCommand';
import { runSectionAICommand } from '../../sections/commands/runSectionAICommand';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { getSectionPromptReferencedFileIds } from '../../../domain/ai/promptBuilders/buildSectionPrompt';
import { useAppStore } from '../../../store/useAppStore';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

type RoutedIntent =
  | { type: 'chat' }
  | { type: 'generate' }
  | { type: 'rewrite-document' }
  | { type: 'delete-section'; sectionId: string; sectionTitle: string }
  | { type: 'rewrite-section'; sectionId: string; sectionTitle: string };

function findSectionMatch(prompt: string): { sectionId: string; sectionTitle: string } | null {
  const lowered = prompt.toLowerCase();
  const state = useAppStore.getState();

  for (const sectionId of state.document.sectionOrder) {
    const section = state.document.sectionsById[sectionId];
    if (!section) {
      continue;
    }

    const candidates = [section.title, section.key];
    if (section.key === 'introduction') {
      candidates.push('intro', 'introduction');
    }
    if (section.key === 'methodology') {
      candidates.push('methods', 'method', 'methodology');
    }
    if (section.key === 'results-analysis') {
      candidates.push('results', 'analysis', 'results and analysis');
    }
    if (section.key === 'discussion') {
      candidates.push('discussion');
    }
    if (section.key === 'conclusion') {
      candidates.push('conclusion', 'summary');
    }

    if (candidates.some((candidate) => candidate && lowered.includes(candidate.toLowerCase()))) {
      return { sectionId: section.id, sectionTitle: section.title };
    }
  }

  return null;
}

function isGenerateIntent(prompt: string): boolean {
  return /重新生成|生成报告|生成论文|生成一篇|写一篇报告|写一篇论文|写个报告|写个论文|写一份报告|写一版报告|帮我写报告|帮我写一篇|帮我写个|直接写报告|直接给我写|起草报告|起草一篇|new report|new paper|from scratch|regenerate|generate a report|generate full report|draft a report|write a report|write the report/.test(
    prompt.toLowerCase(),
  );
}

function isRewriteIntent(prompt: string): boolean {
  return /全文|整体|全篇|整篇|润色|改写|翻译|英文|英语|中文|shorten the report|shorten whole|translate the whole|rewrite the whole|translate the document|rewrite document|revise the report|polish the report|change the whole/.test(
    prompt.toLowerCase(),
  );
}

function isDeleteIntent(prompt: string): boolean {
  return /删除|删掉|remove|delete/.test(prompt.toLowerCase());
}

function isConversationalIntent(prompt: string): boolean {
  const lowered = prompt.toLowerCase().trim();
  if (!lowered) {
    return true;
  }

  if (/^(hi|hello|hey|你好|您好|嗨|在吗|在不在|hello there)[!.?？。]*$/.test(lowered)) {
    return true;
  }

  if (/^(what|why|how|能不能|可以吗|为什么|怎么|啥意思|什么意思|你觉得|讨论一下|先聊聊|先说说)/.test(lowered)) {
    return true;
  }

  if (lowered.length <= 12 && !isGenerateIntent(lowered) && !isRewriteIntent(lowered) && !isDeleteIntent(lowered)) {
    return true;
  }

  return false;
}

function looksLikeGenerationFollowUp(prompt: string): boolean {
  const lowered = prompt.toLowerCase().trim();
  const state = useAppStore.getState();
  const lastGlobalAssistantMessage = [...state.chat.globalMessageIds]
    .reverse()
    .map((messageId) => state.chat.messagesById[messageId])
    .find((message) => message?.role === 'assistant');

  const askedForClarification = /报告语言|language|标准结构|字数|页数|按老师要求|帮我按这个大纲写完整报告|先告诉我/.test(
    lastGlobalAssistantMessage?.content ?? '',
  );

  const shortConfirmation = /^(中文|英文|英语|按老师要求|按标准结构|随便你|就按这个|可以|行|好的|好)[，,。.!！?？\s\w-]*$/.test(
    lowered,
  );

  return askedForClarification && shortConfirmation;
}

function routePrompt(prompt: string): RoutedIntent {
  const matchedSection = findSectionMatch(prompt);
  const deleteIntent = isDeleteIntent(prompt);
  const generateIntent = isGenerateIntent(prompt);
  const rewriteIntent = isRewriteIntent(prompt);
  const conversationalIntent = isConversationalIntent(prompt);
  const hasDocument = useAppStore.getState().document.sectionOrder.length > 0;

  if (!hasDocument) {
    if (generateIntent || rewriteIntent || looksLikeGenerationFollowUp(prompt)) {
      return { type: 'generate' };
    }

    return { type: 'chat' };
  }

  if (matchedSection && deleteIntent) {
    return {
      type: 'delete-section',
      sectionId: matchedSection.sectionId,
      sectionTitle: matchedSection.sectionTitle,
    };
  }

  if (generateIntent) {
    return { type: 'generate' };
  }

  if (matchedSection && !rewriteIntent && !conversationalIntent) {
    return {
      type: 'rewrite-section',
      sectionId: matchedSection.sectionId,
      sectionTitle: matchedSection.sectionTitle,
    };
  }

  if (rewriteIntent) {
    return { type: 'rewrite-document' };
  }

  if (matchedSection && !conversationalIntent) {
    return {
      type: 'rewrite-section',
      sectionId: matchedSection.sectionId,
      sectionTitle: matchedSection.sectionTitle,
    };
  }

  return { type: 'chat' };
}

export async function routeGlobalAICommand(userPrompt: string): Promise<void> {
  const routedIntent = routePrompt(userPrompt);

  if (routedIntent.type === 'chat') {
    await chatWithWorkspaceCommand(userPrompt);
    return;
  }

  if (routedIntent.type === 'generate') {
    await generateFullDocumentCommand(userPrompt);
    return;
  }

  if (routedIntent.type === 'rewrite-document') {
    await rewriteDocumentCommand(userPrompt);
    return;
  }

  const state = useAppStore.getState();
  const userMessageId = generateId('chat');
  const assistantMessageId = generateId('chat');

  state.actions.addChatMessage({
    id: userMessageId,
    scope: { type: 'global' },
    role: 'user',
    content: userPrompt,
    createdAt: Date.now(),
    status: 'done',
  });

  state.actions.addChatMessage({
    id: assistantMessageId,
    scope: { type: 'global' },
    role: 'assistant',
    content:
      routedIntent.type === 'delete-section'
        ? `Removing section: ${routedIntent.sectionTitle}`
        : `Routing request to section: ${routedIntent.sectionTitle}`,
    createdAt: Date.now(),
    status: 'streaming',
  });

  try {
    if (routedIntent.type === 'delete-section') {
      const currentState = useAppStore.getState();
      currentState.actions.removeSection(routedIntent.sectionId);
      try {
        await scheduleCompilePreviewCommand();
      } catch {
        // no-op
      }
      useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
        content: `Removed section: ${routedIntent.sectionTitle}`,
        status: 'done',
        referencedFileIds: getSectionPromptReferencedFileIds(currentState, routedIntent.sectionId),
      });
      return;
    }

    await runSectionAICommand(routedIntent.sectionId, userPrompt);
    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: `Updated section: ${routedIntent.sectionTitle}`,
      status: 'done',
      referencedFileIds: getSectionPromptReferencedFileIds(useAppStore.getState(), routedIntent.sectionId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update section from global AI.';
    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: message,
      status: 'error',
      error: message,
    });
    throw error;
  }
}
