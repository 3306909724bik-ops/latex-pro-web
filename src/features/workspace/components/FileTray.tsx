import { useMemo, useState } from 'react';
import { removeFileCommand } from '../commands/removeFileCommand';
import { useAppStore } from '../../../store/useAppStore';
import type { FileBucket } from '../../../store/types';

interface FileTrayProps {
  bucket: FileBucket;
  title: string;
  open: boolean;
}

function prettySize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function isImageAnalysis(parsedText?: string): boolean {
  return typeof parsedText === 'string' && parsedText.startsWith('[Image analysis:');
}

function extractImageAnalysisField(parsedText: string | undefined, label: string): string {
  if (!parsedText) {
    return '';
  }

  const match = parsedText.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function getFileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(lower)) {
    return '🖼️';
  }
  if (/\.pdf$/i.test(lower)) {
    return '📄';
  }
  if (/\.(doc|docx)$/i.test(lower)) {
    return '📝';
  }
  if (/\.(xls|xlsx|csv)$/i.test(lower)) {
    return '📊';
  }
  if (/\.(json|txt|md|tex)$/i.test(lower)) {
    return '📃';
  }
  return '📁';
}

export function FileTray({ bucket, title, open }: FileTrayProps) {
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [focusedNoteFileId, setFocusedNoteFileId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const fileIds = useAppStore((state) => state.files.idsByBucket[bucket]);
  const filesById = useAppStore((state) => state.files.byId);
  const actions = useAppStore((state) => state.actions);

  const files = useMemo(
    () => fileIds.map((fileId) => filesById[fileId]).filter(Boolean),
    [fileIds, filesById],
  );

  const editingFile = editingFileId ? filesById[editingFileId] : null;
  const expandedFile = expandedFileId ? filesById[expandedFileId] : null;

  const openEditor = (fileId: string, currentNote: string) => {
    setEditingFileId(fileId);
    setDraftNote(currentNote);
  };

  const closeEditor = () => {
    setEditingFileId(null);
    setDraftNote('');
  };

  const closeExpanded = () => {
    setExpandedFileId(null);
  };

  const saveNote = () => {
    if (!editingFileId) {
      return;
    }

    actions.setFileNote(editingFileId, draftNote.trim());
    closeEditor();
  };

  return (
    <>
      {open ? (
        <div className="pointer-events-auto absolute left-[calc(100%+8px)] top-0 z-40 h-full w-[760px] max-w-[calc(100vw-560px)] transition-all duration-300 ease-out">
          <button
            type="button"
            onClick={() => {
              actions.setExpandedBucket(null);
              actions.setTrayOpen(bucket, false);
            }}
            className="absolute right-full top-1/2 z-10 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-slate-200 border-r-0 bg-white text-sm font-semibold text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition hover:bg-slate-50"
            title="Close tray"
          >
            ←
          </button>

          <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.14)]">
            <button
              type="button"
              onClick={() => {
                actions.setExpandedBucket(null);
                actions.setTrayOpen(bucket, false);
              }}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50"
              title="Close tray"
            >
              ×
            </button>

            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 py-2 pt-2">
              {files.length === 0 ? (
                <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm leading-7 text-slate-500">
                  No files here yet.
                </div>
              ) : (
                <div className="flex h-full min-w-max items-start gap-3 pr-2">
                  {files.map((file) => (
                    <div key={file.id} className="w-[128px] shrink-0 rounded-[16px] border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void removeFileCommand(file.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50"
                          title="Remove file"
                        >
                          ×
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedFileId(file.id)}
                        className="mt-1 flex w-full flex-col items-center text-center"
                      >
                        <div className="text-[1.6rem] leading-none">{getFileIcon(file.name)}</div>
                        <div className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-4 text-slate-800 break-words">
                          {file.name}
                        </div>
                        <div className="mt-1 text-[8px] text-slate-400">{prettySize(file.size)}</div>
                      </button>

                      <div className="mt-2">
                        <textarea
                          value={file.note}
                          onChange={(event) => actions.setFileNote(file.id, event.target.value)}
                          onFocus={() => setFocusedNoteFileId(file.id)}
                          onBlur={() => setFocusedNoteFileId((current) => (current === file.id ? null : current))}
                          rows={focusedNoteFileId === file.id ? 2 : 1}
                          placeholder="Note..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[10px] leading-4 text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {expandedFile ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/30 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">File detail</div>
                <div className="mt-1 truncate text-base font-semibold text-slate-900">{expandedFile.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {prettySize(expandedFile.size)} • {expandedFile.mimeType || 'unknown mime'} • {expandedFile.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditor(expandedFile.id, expandedFile.note)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Edit note
                </button>
                <button
                  type="button"
                  onClick={closeExpanded}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-0 overflow-y-auto border-r border-slate-200 px-5 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Parsed content</div>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-700">
                  {expandedFile.parsedText || expandedFile.parseError || 'No parsed content yet.'}
                </pre>
              </div>

              <div className="min-h-0 overflow-y-auto px-5 py-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Note</div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                    {expandedFile.note || 'No note yet.'}
                  </div>
                </div>

                {expandedFile.objectUrl && expandedFile.mimeType.toLowerCase().startsWith('image/') ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Image preview</div>
                    <img
                      src={expandedFile.objectUrl}
                      alt={expandedFile.name}
                      className="mt-3 max-h-[360px] w-full rounded-2xl border border-slate-200 bg-white object-contain"
                    />
                  </div>
                ) : null}

                {expandedFile.parseError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-700">
                    {expandedFile.parseError}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingFile ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">File note</div>
                <div className="mt-1 text-base font-semibold text-slate-900">{editingFile.name}</div>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              rows={6}
              placeholder="Describe what this file means for AI: experiment batch, temperature, source, role, caveat, style sample, etc."
              className="mt-4 w-full rounded-[24px] border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNote}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
