import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GlobalChatPanel } from '../features/chat/components/GlobalChatPanel';
import { PdfViewer } from '../features/preview/components/PdfViewer';
import { SectionCard } from '../features/sections/components/SectionCard';
import { UploadBucketCard } from '../features/workspace/components/UploadBucketCard';
import { buildLatexDocument } from '../domain/document/latex/buildLatexDocument';
import { useAppStore } from '../store/useAppStore';

type DragHandle = 'left' | 'right' | null;

const HANDLE_WIDTH = 16;
const MIN_LEFT_PX = 220;
const MIN_CENTER_PX = 420;
const MIN_RIGHT_PX = 360;

function WorkspaceSidebar() {
  const { workspaceOrder, workspaceById, currentWorkspaceId, actions } = useAppStore(
    useShallow((state) => ({
      workspaceOrder: state.workspaces.order,
      workspaceById: state.workspaces.byId,
      currentWorkspaceId: state.workspaces.currentWorkspaceId,
      actions: state.actions,
    })),
  );
  const [workspaceChooserOpen, setWorkspaceChooserOpen] = useState(false);

  const workspaces = useMemo(
    () => workspaceOrder.map((id) => workspaceById[id]).filter(Boolean),
    [workspaceById, workspaceOrder],
  );
  const currentWorkspace = workspaceById[currentWorkspaceId];

  const handleCreateWorkspace = () => {
    const name = window.prompt('New workspace name?', `Workspace ${workspaces.length + 1}`)?.trim();
    if (!name) {
      return;
    }
    actions.createWorkspace(name);
  };

  const handleRenameWorkspace = (workspaceId: string, currentName: string) => {
    const name = window.prompt('Rename workspace', currentName)?.trim();
    if (!name || name === currentName) {
      return;
    }
    actions.renameWorkspace(workspaceId, name);
  };

  const handleDeleteWorkspace = (workspaceId: string, name: string) => {
    if (workspaces.length <= 1) {
      window.alert('At least one workspace must remain.');
      return;
    }
    if (!window.confirm(`Delete workspace "${name}"?`)) {
      return;
    }
    actions.deleteWorkspace(workspaceId);
  };

  return (
    <aside className="flex min-h-full flex-col gap-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[clamp(11px,0.95vw,14px)] font-semibold uppercase tracking-[0.25em] text-slate-700">Workspace</div>
          <button
            type="button"
            onClick={handleCreateWorkspace}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            New
          </button>
        </div>

        <button
          type="button"
          onClick={() => setWorkspaceChooserOpen((current) => !current)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
        >
          <div className="min-w-0">
            <div className="truncate text-[clamp(11px,0.95vw,14px)] font-semibold text-slate-800">{currentWorkspace?.name || 'Current workspace'}</div>
            <div className="mt-1 text-[clamp(9px,0.75vw,11px)] text-slate-400">{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}</div>
          </div>
          <div className="text-sm text-slate-500">{workspaceChooserOpen ? '▲' : '▼'}</div>
        </button>

        {workspaceChooserOpen ? (
          <div className="mt-3 space-y-2">
            {workspaces.map((workspace) => {
              const active = workspace.id === currentWorkspaceId;
              return (
                <div
                  key={workspace.id}
                  className={`rounded-2xl border px-3 py-3 ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      actions.switchWorkspace(workspace.id);
                      setWorkspaceChooserOpen(false);
                    }}
                    className="w-full text-left"
                  >
                    <div className="truncate text-sm font-semibold">{workspace.name}</div>
                    <div className={`mt-1 text-[11px] ${active ? 'text-white/70' : 'text-slate-400'}`}>
                      {active ? 'Current workspace' : 'Switch to this workspace'}
                    </div>
                  </button>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRenameWorkspace(workspace.id, workspace.name)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium ${active ? 'border-white/20 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkspace(workspace.id, workspace.name)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium ${active ? 'border-rose-300/30 bg-rose-400/10 text-rose-100' : 'border-rose-200 bg-white text-rose-600'}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 pb-2">
        <UploadBucketCard bucket="requirement" title="Requirement Manual" acceptedLabel="PDF / DOC / DOCX / TXT / CSV / JSON / PNG / JPG" />
        <UploadBucketCard bucket="results" title="Results / Data" acceptedLabel="PDF / DOC / DOCX / TXT / CSV / JSON / PNG / JPG" />
        <UploadBucketCard bucket="reference" title="Reference Style" acceptedLabel="PDF / DOC / DOCX / TXT / CSV / JSON / PNG / JPG" />
      </section>
    </aside>
  );
}

function PaperMetaStrip() {
  const meta = useAppStore((state) => state.document.meta);
  const actions = useAppStore((state) => state.actions);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="grid gap-3">
        <div className="grid grid-cols-[1.3fr_1fr_180px] gap-3">
          <input
            value={meta.title}
            onChange={(event) => actions.setDocumentMeta({ title: event.target.value })}
            placeholder="Paper title"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <input
            value={meta.authors.join(', ')}
            onChange={(event) =>
              actions.setDocumentMeta({
                authors: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Authors"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            {new Date().toLocaleDateString()}
          </div>
        </div>

        <input
          value={meta.subtitle ?? ''}
          onChange={(event) => actions.setDocumentMeta({ subtitle: event.target.value })}
          placeholder="Subtitle / course / project line"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />

        <textarea
          value={meta.abstract ?? ''}
          onChange={(event) => actions.setDocumentMeta({ abstract: event.target.value })}
          placeholder="Abstract"
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
      </div>
    </section>
  );
}

function LatexSourcePanel() {
  const meta = useAppStore((state) => state.document.meta);
  const sectionsById = useAppStore((state) => state.document.sectionsById);
  const sectionOrder = useAppStore((state) => state.document.sectionOrder);
  const filesById = useAppStore((state) => state.files.byId);

  const latexSource = useMemo(
    () =>
      buildLatexDocument({
        meta,
        sectionsById,
        sectionOrder,
        filesById,
      }),
    [filesById, meta, sectionOrder, sectionsById],
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">LaTeX Source</div>
          <div className="mt-1 text-xs text-slate-500">Live generated code from the current document state</div>
        </div>
      </div>

      <textarea
        readOnly
        value={latexSource}
        rows={18}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-6 text-slate-700 outline-none"
      />
    </section>
  );
}

function MainStudio() {
  const sectionOrder = useAppStore((state) => state.document.sectionOrder);
  const sectionsById = useAppStore((state) => state.document.sectionsById);
  const actions = useAppStore((state) => state.actions);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const sections = useMemo(
    () => sectionOrder.map((sectionId) => sectionsById[sectionId]).filter(Boolean),
    [sectionOrder, sectionsById],
  );

  const handleCreateSection = () => {
    const title = newSectionTitle.trim();
    if (!title) {
      return;
    }

    const timestamp = Date.now();
    const slug = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-').replace(/^-+|-+$/g, '') || `section-${timestamp}`;

    actions.addSection({
      id: `section_${timestamp}`,
      key: slug,
      title,
      level: 1,
      content: '',
      blocks: [],
      status: 'idle',
      updatedAt: timestamp,
      linkedFileIds: [],
    });

    setNewSectionTitle('');
    setShowAddModal(false);
  };

  return (
    <>
      <main className="flex min-h-full flex-col gap-4 pb-2">
        <div className="flex-[0_0_auto] overflow-hidden">
          <GlobalChatPanel />
        </div>

        <PaperMetaStrip />

        <section className="flex min-h-[280px] flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
            <p className="font-semibold uppercase tracking-[0.25em] text-slate-400">Sections</p>
            <span>{sections.length} sections</span>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mb-4 w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            + Add Section
          </button>

          <div className="flex-1">
            {sections.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center text-sm leading-7 text-slate-500">
                Full-report generation will populate editable sections here.
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                {sections.map((section) => (
                  <SectionCard key={section.id} sectionId={section.id} />
                ))}
              </div>
            )}
          </div>
        </section>

        <LatexSourcePanel />
      </main>

      {showAddModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/20 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">New Section</div>
                <div className="mt-1 text-base font-semibold text-slate-900">Create section title</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setNewSectionTitle('');
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <input
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleCreateSection();
                }
              }}
              placeholder="e.g. Related Work"
              className="mt-4 w-full rounded-[20px] border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setNewSectionTitle('');
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSection}
                disabled={!newSectionTitle.trim()}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Section
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PdfPreviewPane() {
  const preview = useAppStore((state) => state.ui.preview);
  const lastCompiledAt = useAppStore((state) => state.document.meta.lastCompiledAt);

  return (
    <aside className="flex min-h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-700">Preview</div>
          <div className="mt-1 text-xs text-slate-500">Compiled PDF</div>
        </div>
        <div className="flex items-center gap-2">
          {preview.needsRefresh ? (
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">outdated</div>
          ) : null}
          <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">{preview.status}</div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {preview.needsRefresh
              ? 'Document changed since last successful compile.'
              : lastCompiledAt
                ? `Last compiled: ${new Date(lastCompiledAt).toLocaleString()}`
                : 'No successful compile yet.'}
          </span>
          {preview.compileError ? <span className="font-medium text-rose-600">Compile error present</span> : null}
        </div>
        {preview.compileError ? <div className="mt-2 line-clamp-3 text-rose-600">{preview.compileError}</div> : null}
      </div>

      <div className="min-h-0 flex-1 rounded-2xl bg-slate-100 p-4">
        <PdfViewer />
      </div>
    </aside>
  );
}

function ResizeHandle({ active, onMouseDown }: { active: boolean; onMouseDown: () => void }) {
  return (
    <button
      type="button"
      aria-label="Resize panel"
      onMouseDown={onMouseDown}
      className="group relative z-50 flex h-auto w-[16px] shrink-0 cursor-col-resize items-center justify-center self-stretch border-0 bg-transparent px-0"
    >
      <span
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300 transition ${
          active ? 'bg-slate-700' : 'group-hover:bg-slate-500'
        }`}
      />
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 h-16 w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300 bg-white shadow-sm transition ${
          active ? 'border-slate-700 bg-slate-800' : 'group-hover:border-slate-400 group-hover:bg-slate-100'
        }`}
      />
    </button>
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftPercent, setLeftPercent] = useState(13);
  const [centerPercent, setCenterPercent] = useState(43.5);
  const [activeHandle, setActiveHandle] = useState<DragHandle>(null);

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const totalWidth = bounds.width - HANDLE_WIDTH * 2;
      if (totalWidth <= 0) {
        return;
      }

      const minLeft = (MIN_LEFT_PX / totalWidth) * 100;
      const minCenter = (MIN_CENTER_PX / totalWidth) * 100;
      const minRight = (MIN_RIGHT_PX / totalWidth) * 100;
      const cursorX = event.clientX - bounds.left;

      if (activeHandle === 'left') {
        const proposedLeft = ((cursorX - HANDLE_WIDTH / 2) / totalWidth) * 100;
        const maxLeft = 100 - minCenter - minRight;
        const nextLeft = Math.min(Math.max(proposedLeft, minLeft), maxLeft);
        const maxCenter = 100 - nextLeft - minRight;
        const nextCenter = Math.min(Math.max(centerPercent, minCenter), maxCenter);
        setLeftPercent(nextLeft);
        setCenterPercent(nextCenter);
        return;
      }

      const leftWidthPx = (leftPercent / 100) * totalWidth;
      const proposedCenter = ((cursorX - leftWidthPx - HANDLE_WIDTH * 1.5) / totalWidth) * 100;
      const maxCenter = 100 - leftPercent - minRight;
      const nextCenter = Math.min(Math.max(proposedCenter, minCenter), maxCenter);
      setCenterPercent(nextCenter);
    };

    const handleMouseUp = () => setActiveHandle(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, centerPercent, leftPercent]);

  const rightPercent = Math.max(100 - leftPercent - centerPercent, 0);

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-slate-100 text-slate-900">
      <div ref={containerRef} className="flex min-h-screen w-full items-stretch gap-0 px-3 py-3">
        <div style={{ width: `${leftPercent}%` }} className="relative shrink-0 overflow-visible pr-1">
          <WorkspaceSidebar />
        </div>

        <ResizeHandle active={activeHandle === 'left'} onMouseDown={() => setActiveHandle('left')} />

        <div style={{ width: `${centerPercent}%` }} className="relative shrink-0 overflow-visible px-1">
          <MainStudio />
        </div>

        <ResizeHandle active={activeHandle === 'right'} onMouseDown={() => setActiveHandle('right')} />

        <div style={{ width: `${rightPercent}%` }} className="relative shrink-0 overflow-visible pl-1">
          <PdfPreviewPane />
        </div>
      </div>
    </div>
  );
}
