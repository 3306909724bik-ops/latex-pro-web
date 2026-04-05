import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadFilesCommand } from '../commands/uploadFilesCommand';
import { FileTray } from './FileTray';
import { useAppStore } from '../../../store/useAppStore';
import type { FileBucket } from '../../../store/types';

interface UploadBucketCardProps {
  bucket: FileBucket;
  title: string;
  acceptedLabel: string;
}

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp';

const ACCENT_CLASS: Record<FileBucket, string> = {
  requirement: 'border-indigo-400',
  results: 'border-emerald-400',
  reference: 'border-amber-400',
};

export function UploadBucketCard({ bucket, title, acceptedLabel }: UploadBucketCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const trayOpen = useAppStore((state) => state.ui.workspace.trayOpenByBucket[bucket]);
  const expandedBucket = useAppStore((state) => state.ui.workspace.expandedBucket);
  const fileIds = useAppStore((state) => state.files.idsByBucket[bucket]);
  const filesById = useAppStore((state) => state.files.byId);
  const hintState = useAppStore((state) => state.ui.hints);
  const actions = useAppStore((state) => state.actions);

  const files = useMemo(
    () => fileIds.map((fileId) => filesById[fileId]).filter(Boolean),
    [fileIds, filesById],
  );

  const isExpanded = trayOpen && expandedBucket === bucket;
  const showResultsHint =
    bucket === 'results' &&
    hintState.resultsFirstUploadHintVisible &&
    !hintState.resultsFirstUploadHintDismissedForever;

  useEffect(() => {
    if (!showResultsHint) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      useAppStore.getState().actions.dismissResultsFirstUploadHint(false);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [showResultsHint]);

  const handleFiles = async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) {
      return;
    }

    await uploadFilesCommand(bucket, filesArray);
  };

  const handleInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      await handleFiles(event.target.files);
      event.target.value = '';
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    if (event.dataTransfer.files?.length) {
      await handleFiles(event.dataTransfer.files);
    }
  };

  const toggleTray = () => {
    const nextOpen = !isExpanded;
    actions.setExpandedBucket(nextOpen ? bucket : null);
    actions.setTrayOpen(bucket, nextOpen);
  };

  return (
    <div className="relative overflow-visible">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => void handleDrop(event)}
        className={`group relative aspect-square rounded-2xl border-2 border-dashed ${ACCENT_CLASS[bucket]} bg-white/90 px-4 py-4 text-sm text-slate-700 transition hover:bg-white ${
          dragActive ? 'bg-slate-50' : ''
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleInputChange}
        />

        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold text-slate-500 sm:text-[11px]">
              {files.length} file{files.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-full break-words text-[clamp(11px,1vw,15px)] font-semibold uppercase tracking-[0.22em] text-slate-700 leading-tight">
              {title}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1 text-[clamp(10px,0.85vw,12px)] text-slate-500">
              <button
                className="rounded-full border border-slate-300 px-4 py-1 text-[clamp(10px,0.85vw,12px)] font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                Upload
              </button>
              <span className="text-[11px] tracking-[0.2em] text-slate-400">/ drag</span>
            </div>

          </div>

          <p className="mt-3 text-center text-[clamp(9px,0.75vw,11px)] uppercase tracking-[0.14em] text-slate-400 leading-tight">{acceptedLabel}</p>
        </div>

        {files.length > 0 && !isExpanded ? (
          <button
            type="button"
            onClick={toggleTray}
            className="absolute -right-3 top-1/2 z-30 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-2xl border border-slate-300 border-l-0 bg-white text-sm font-semibold text-slate-500 shadow-sm transition hover:bg-slate-100"
            title="Open tray"
          >
            →
          </button>
        ) : null}

        {bucket === 'results' && showResultsHint ? (
          <div className="absolute left-full top-6 z-20 ml-3 w-56 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
            <p className="font-semibold text-slate-700">可以把我展开给数据备注哦</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => actions.dismissResultsFirstUploadHint(false)}
                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                知道了
              </button>
              <button
                type="button"
                onClick={() => actions.dismissResultsFirstUploadHint(true)}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
              >
                不再显示
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <FileTray bucket={bucket} title={title} open={isExpanded} />
    </div>
  );
}
