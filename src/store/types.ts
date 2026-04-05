export type FileBucket = 'requirement' | 'results' | 'reference';

export type FileLifecycleStatus =
  | 'uploading'
  | 'uploaded'
  | 'parsing'
  | 'ready'
  | 'error';

export type FileTextStatus = 'idle' | 'extracting' | 'ready' | 'error';

export interface WorkspaceFile {
  id: string;
  bucket: FileBucket;
  name: string;
  mimeType: string;
  size: number;
  source: 'upload';
  status: FileLifecycleStatus;
  createdAt: number;
  updatedAt: number;
  objectUrl?: string;
  rawTextStatus: FileTextStatus;
  parsedText?: string;
  parseError?: string;
  note: string;
  tags?: string[];
  pageCount?: number;
  checksum?: string;
}

export interface FilesState {
  byId: Record<string, WorkspaceFile>;
  idsByBucket: Record<FileBucket, string[]>;
}

export interface DocumentTemplateConfig {
  id: 'golden-standard';
  pageSize: 'letterpaper';
  margin: '1in';
  lineSpacing: '1.5';
}

export interface DocumentMeta {
  title: string;
  subtitle?: string;
  authors: string[];
  abstract?: string;
  template: DocumentTemplateConfig;
  lastCompiledAt?: number;
}

export type SectionStatus = 'idle' | 'generating' | 'editing' | 'error';

export interface DocumentTableBlock {
  id: string;
  type: 'table';
  title?: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface DocumentChartSeries {
  label: string;
  values: number[];
}

export interface DocumentChartBlock {
  id: string;
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  title?: string;
  x: string[];
  series: DocumentChartSeries[];
  yLabel?: string;
  note?: string;
}

export interface DocumentImageBlock {
  id: string;
  type: 'image';
  assetFileId: string;
  title?: string;
  caption?: string;
  widthPercent?: number;
  placement?: 'htbp' | 't' | 'b' | 'p';
}

export type DocumentBlock = DocumentTableBlock | DocumentChartBlock | DocumentImageBlock;

export interface DocumentSection {
  id: string;
  key: string;
  title: string;
  level: 1 | 2;
  content: string;
  blocks?: DocumentBlock[];
  summary?: string;
  status: SectionStatus;
  updatedAt: number;
  linkedFileIds: string[];
  localInstruction?: string;
}

export interface DocumentState {
  meta: DocumentMeta;
  sectionsById: Record<string, DocumentSection>;
  sectionOrder: string[];
}

export type ChatScope = { type: 'global' } | { type: 'section'; sectionId: string };

export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMessageStatus = 'streaming' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  scope: ChatScope;
  role: ChatRole;
  content: string;
  createdAt: number;
  status?: ChatMessageStatus;
  error?: string;
  referencedFileIds?: string[];
}

export interface ChatState {
  globalMessageIds: string[];
  sectionMessageIds: Record<string, string[]>;
  messagesById: Record<string, ChatMessage>;
}

export type SnapshotReason = 'ai-generate' | 'ai-edit' | 'manual-save' | 'undo-base';

export interface SectionSnapshot {
  id: string;
  sectionId: string;
  content: string;
  blocks?: DocumentBlock[];
  createdAt: number;
  reason: SnapshotReason;
}

export interface SnapshotsState {
  bySectionId: Record<string, SectionSnapshot[]>;
}

export interface UploadHintState {
  resultsFirstUploadHintVisible: boolean;
  resultsFirstUploadHintDismissedForever: boolean;
  resultsFirstUploadHintHasShownOnce: boolean;
  resultsFirstUploadHintShownAt?: number;
}

export type PreviewStatus = 'idle' | 'compiling' | 'ready' | 'error';

export interface PreviewState {
  status: PreviewStatus;
  pdfBase64?: string;
  compileError?: string;
  needsRefresh: boolean;
  zoom: number;
  currentPage: number;
}

export interface UIState {
  workspace: {
    trayOpenByBucket: Record<FileBucket, boolean>;
    expandedBucket: FileBucket | null;
  };
  hints: UploadHintState;
  preview: PreviewState;
}

export interface WorkspaceSnapshot {
  files: FilesState;
  document: DocumentState;
  chat: ChatState;
  snapshots: SnapshotsState;
  ui: UIState;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: WorkspaceSnapshot;
}

export interface WorkspacesState {
  currentWorkspaceId: string;
  order: string[];
  byId: Record<string, WorkspaceRecord>;
}

export interface IncomingFilePayload {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  objectUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface GeneratedDocumentPayload {
  meta?: Partial<DocumentMeta>;
  sections: DocumentSection[];
  sectionOrder?: string[];
}

export interface AppActions {
  addUploadedFiles: (bucket: FileBucket, files: IncomingFilePayload[]) => void;
  setFileStatus: (fileId: string, status: FileLifecycleStatus, parseError?: string) => void;
  setFileParsedText: (fileId: string, parsedText: string) => void;
  setFileNote: (fileId: string, note: string) => void;
  removeFile: (fileId: string) => void;

  setDocumentMeta: (patch: Partial<DocumentMeta>) => void;
  replaceDocumentFromAI: (payload: GeneratedDocumentPayload) => void;
  updateSectionMeta: (
    sectionId: string,
    patch: Partial<Pick<DocumentSection, 'title' | 'key' | 'level' | 'linkedFileIds'>>,
  ) => void;
  updateSectionContent: (sectionId: string, content: string) => void;
  updateSectionBlocks: (sectionId: string, blocks: DocumentBlock[]) => void;
  updateSectionStatus: (sectionId: string, status: SectionStatus) => void;
  reorderSections: (sectionIds: string[]) => void;
  addSection: (section: DocumentSection) => void;
  removeSection: (sectionId: string) => void;

  addChatMessage: (message: ChatMessage) => void;
  updateChatMessage: (messageId: string, patch: Partial<ChatMessage>) => void;

  pushSectionSnapshot: (sectionId: string, snapshot: SectionSnapshot) => void;
  undoSection: (sectionId: string) => void;
  clearSectionSnapshots: (sectionId: string) => void;

  setExpandedBucket: (bucket: FileBucket | null) => void;
  setTrayOpen: (bucket: FileBucket, open: boolean) => void;
  showResultsFirstUploadHint: (shownAt?: number) => void;
  dismissResultsFirstUploadHint: (forever?: boolean) => void;
  setPreviewState: (patch: Partial<PreviewState>) => void;

  createWorkspace: (name: string) => void;
  switchWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => void;
  deleteWorkspace: (workspaceId: string) => void;
  resetWorkspace: () => void;
}

export interface RootState {
  files: FilesState;
  document: DocumentState;
  chat: ChatState;
  snapshots: SnapshotsState;
  ui: UIState;
  workspaces: WorkspacesState;
  actions: AppActions;
}
