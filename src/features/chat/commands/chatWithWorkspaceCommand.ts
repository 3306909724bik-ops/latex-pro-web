import { getBrowserOpenAIConfig, requestOpenAIText } from '../../../domain/ai/openaiClient';
import { useAppStore } from '../../../store/useAppStore';
import type { DocumentSection, WorkspaceFile } from '../../../store/types';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function summarizeFile(file: WorkspaceFile): string {
  const preview = (file.parsedText || '').replace(/\s+/g, ' ').trim();
  const clippedPreview = preview.length > 220 ? `${preview.slice(0, 220)}...` : preview;
  return [
    `- [${file.bucket}] ${file.name}`,
    file.note ? `  note: ${file.note}` : '',
    clippedPreview ? `  preview: ${clippedPreview}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function summarizeSection(section: DocumentSection): string {
  const preview = section.content.replace(/\s+/g, ' ').trim();
  const clippedPreview = preview.length > 280 ? `${preview.slice(0, 280)}...` : preview;
  return [`- ${section.title}`, clippedPreview ? `  content: ${clippedPreview}` : ''].filter(Boolean).join('\n');
}

function getConversationReferencedFileIds(): string[] {
  const state = useAppStore.getState();
  return (['requirement', 'results', 'reference'] as const).flatMap((bucket) => state.files.idsByBucket[bucket]);
}

function buildConversationPrompt(userPrompt: string): string {
  const state = useAppStore.getState();
  const files = (['requirement', 'results', 'reference'] as const).flatMap((bucket) =>
    state.files.idsByBucket[bucket]
      .map((fileId) => state.files.byId[fileId])
      .filter((file): file is WorkspaceFile => Boolean(file)),
  );

  const sections = state.document.sectionOrder
    .map((sectionId) => state.document.sectionsById[sectionId])
    .filter((section): section is DocumentSection => Boolean(section));

  return [
    'The user is chatting inside an AI-driven academic report workbench.',
    'This turn is conversational only. Do not generate or rewrite the document unless the user explicitly asks you to.',
    'Be concise, useful, discussion-oriented, and keep the reply short.',
    '',
    'Current document meta:',
    JSON.stringify(state.document.meta),
    '',
    'Current sections:',
    sections.length > 0 ? sections.map(summarizeSection).join('\n\n') : 'No sections yet.',
    '',
    'Uploaded files:',
    files.length > 0 ? files.map(summarizeFile).join('\n\n') : 'No uploaded files yet.',
    '',
    `User message: ${userPrompt}`,
    '',
    'Respond as a collaborator. If the user seems to be greeting, clarifying, or discussing strategy, answer naturally instead of generating a report.',
  ].join('\n');
}

export async function chatWithWorkspaceCommand(userPrompt: string): Promise<void> {
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
    content: 'Thinking...',
    createdAt: Date.now(),
    status: 'streaming',
  });

  try {
    const content = getBrowserOpenAIConfig()
      ? await requestOpenAIText(
          'You are a helpful academic report copilot. This turn is chat-only unless the user explicitly asks to generate or edit the document. Keep replies very short: ideally 1-3 sentences, and avoid long bullet lists unless absolutely necessary.',
          buildConversationPrompt(userPrompt),
        )
      : '我在这。当前 public demo 里完整 AI 功能需要先 Unlock。解锁后你可以直接继续生成整篇报告，或者指定某一节进行修改。';

    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content,
      status: 'done',
      referencedFileIds: getConversationReferencedFileIds(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to answer conversational turn.';
    useAppStore.getState().actions.updateChatMessage(assistantMessageId, {
      content: message,
      status: 'error',
      error: message,
    });
    throw error;
  }
}
