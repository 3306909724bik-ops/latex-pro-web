import { useEffect, useMemo, useRef, useState } from 'react';
import { getStoredDemoAccessCode, verifyAndStoreDemoAccessCode, clearStoredDemoAccessCode } from '../../../domain/ai/openaiClient';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { routeGlobalAICommand } from '../commands/routeGlobalAICommand';
import { useAppStore } from '../../../store/useAppStore';

export function GlobalChatPanel() {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accessUnlocked, setAccessUnlocked] = useState(Boolean(getStoredDemoAccessCode()));
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const globalMessageIds = useAppStore((state) => state.chat.globalMessageIds);
  const messagesById = useAppStore((state) => state.chat.messagesById);
  const filesById = useAppStore((state) => state.files.byId);
  const previewStatus = useAppStore((state) => state.ui.preview.status);
  const previewNeedsRefresh = useAppStore((state) => state.ui.preview.needsRefresh);

  const messages = useMemo(
    () => globalMessageIds.map((messageId) => messagesById[messageId]).filter(Boolean),
    [globalMessageIds, messagesById],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });

    bottomAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length]);

  const handleUnlock = async () => {
    const code = window.prompt('Enter demo access code')?.trim();
    if (!code) {
      return;
    }

    try {
      await verifyAndStoreDemoAccessCode(code);
      setAccessUnlocked(true);
      window.alert('Full demo access unlocked.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to unlock demo access.');
    }
  };

  const handleGenerate = async () => {
    const prompt = input.trim();
    if (!prompt || submitting) {
      return;
    }

    if (!accessUnlocked) {
      window.alert('Full AI features are locked in the public demo. Use your access code to continue.');
      return;
    }

    setSubmitting(true);
    try {
      await routeGlobalAICommand(prompt);
      setInput('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 flex h-[560px] min-h-[560px] max-h-[560px] flex-col rounded-3xl border-[4px] border-[#111827] bg-white p-6 text-slate-900 shadow-lg pointer-events-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[#111827]">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1477ff]/15 text-base font-semibold text-[#1477ff]">
            AI
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#111827]">AI 指令输入</p>
            <p className="text-xs text-slate-500">告诉 AI 你要整篇报告如何生成或修改</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${accessUnlocked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
            {accessUnlocked ? 'Full demo unlocked' : 'Public demo mode'}
          </div>
          <button
            type="button"
            onClick={() => {
              if (accessUnlocked) {
                clearStoredDemoAccessCode();
                setAccessUnlocked(false);
                return;
              }

              void handleUnlock();
            }}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${accessUnlocked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'}`}
          >
            {accessUnlocked ? 'Lock' : 'Unlock'}
          </button>
          <span className="text-xs font-medium text-[#111827]">{previewStatus}</span>
        </div>
      </div>

      <div ref={scrollContainerRef} className="mt-5 min-h-[220px] flex-[2] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm leading-7 text-slate-500">
            在这里告诉 AI：生成完整报告、调整结构、澄清 requirement，或继续多轮追问。
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                    isUser
                      ? 'ml-auto max-w-[80%] border-[#111827] bg-[#111827] text-white'
                      : message.status === 'error'
                        ? 'max-w-[84%] border-rose-200 bg-rose-50 text-rose-700'
                        : 'max-w-[84%] border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">
                    {isUser ? 'User' : 'AI'}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>

                  {message.referencedFileIds && message.referencedFileIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
                      {message.referencedFileIds
                        .map((fileId) => filesById[fileId])
                        .filter(Boolean)
                        .map((file) => (
                          <span
                            key={`${message.id}_${file.id}`}
                            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                              isUser ? 'bg-white/10 text-white/80' : 'border border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {file.bucket} · {file.name}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={bottomAnchorRef} />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-4 pointer-events-auto">
        {!accessUnlocked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Public demo mode is active. Unlock with your resume access code to enable full AI generation and document rewriting.
          </div>
        ) : null}
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={accessUnlocked ? '例如：请基于上传的 requirement、results 和 reference，直接生成完整学术报告，并优先整合实验结果。' : 'Public demo mode: enter your access code to unlock full AI generation.'}
          className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-800 placeholder:text-slate-400 focus:border-[#4b5563] focus:outline-none focus:ring-2 focus:ring-[#4b5563]/30"
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void scheduleCompilePreviewCommand()}
            disabled={previewStatus === 'compiling'}
            className="rounded-2xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewStatus === 'compiling' ? 'Compiling…' : previewNeedsRefresh ? 'Recompile Preview' : 'Compile Preview'}
          </button>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={submitting || !input.trim()}
            className="rounded-2xl border border-[#111827] px-6 py-2 text-sm font-semibold text-[#111827] hover:bg-[#111827]/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Applying...' : accessUnlocked ? 'Apply Instruction' : 'Unlock to Use AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
