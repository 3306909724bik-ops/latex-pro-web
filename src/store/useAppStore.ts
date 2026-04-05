import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AppActions,
  ChatMessage,
  DocumentBlock,
  DocumentMeta,
  DocumentSection,
  FileBucket,
  FileLifecycleStatus,
  FilesState,
  GeneratedDocumentPayload,
  IncomingFilePayload,
  PreviewState,
  RootState,
  SectionSnapshot,
  SectionStatus,
  UIState,
} from './types';

const DEFAULT_DOCUMENT_META: DocumentMeta = {
  title: '',
  subtitle: '',
  authors: [],
  abstract: '',
  template: {
    id: 'golden-standard',
    pageSize: 'letterpaper',
    margin: '1in',
    lineSpacing: '1.5',
  },
};

const createInitialFilesState = (): FilesState => ({
  byId: {},
  idsByBucket: {
    requirement: [],
    results: [],
    reference: [],
  },
});

const createInitialUIState = (): UIState => ({
  workspace: {
    trayOpenByBucket: {
      requirement: false,
      results: false,
      reference: false,
    },
    expandedBucket: null,
  },
  hints: {
    resultsFirstUploadHintVisible: false,
    resultsFirstUploadHintDismissedForever: false,
    resultsFirstUploadHintHasShownOnce: false,
    resultsFirstUploadHintShownAt: undefined,
  },
  preview: {
    status: 'idle',
    pdfBase64: undefined,
    compileError: undefined,
    needsRefresh: false,
    zoom: 1,
    currentPage: 1,
  },
});

function createWorkspaceSnapshotFromSlices(state: Pick<RootState, 'files' | 'document' | 'chat' | 'snapshots' | 'ui'>) {
  return {
    files: state.files,
    document: state.document,
    chat: state.chat,
    snapshots: state.snapshots,
    ui: state.ui,
  };
}

function createDefaultWorkspaceRecord(name = 'Workspace 1') {
  const timestamp = Date.now();
  return {
    id: `workspace_${timestamp}`,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshot: {
      files: createInitialFilesState(),
      document: {
        meta: DEFAULT_DOCUMENT_META,
        sectionsById: {},
        sectionOrder: [],
      },
      chat: {
        globalMessageIds: [],
        sectionMessageIds: {},
        messagesById: {},
      },
      snapshots: {
        bySectionId: {},
      },
      ui: createInitialUIState(),
    },
  };
}

const createInitialState = () => {
  const defaultWorkspace = createDefaultWorkspaceRecord();

  return {
    ...defaultWorkspace.snapshot,
    workspaces: {
      currentWorkspaceId: defaultWorkspace.id,
      order: [defaultWorkspace.id],
      byId: {
        [defaultWorkspace.id]: defaultWorkspace,
      },
    },
  };
};

function createPersistedStateSlice(state: RootState) {
  const sanitizedUi: UIState = {
    ...state.ui,
    workspace: {
      trayOpenByBucket: {
        requirement: false,
        results: false,
        reference: false,
      },
      expandedBucket: null,
    },
    preview: {
      ...state.ui.preview,
      status: state.ui.preview.status === 'ready' ? 'ready' : 'idle',
    },
  };

  const currentSnapshot = createWorkspaceSnapshotFromSlices({
    files: {
      byId: Object.fromEntries(
        Object.entries(state.files.byId).map(([fileId, file]) => [
          fileId,
          {
            ...file,
            objectUrl: undefined,
          },
        ]),
      ),
      idsByBucket: state.files.idsByBucket,
    },
    document: state.document,
    chat: state.chat,
    snapshots: state.snapshots,
    ui: sanitizedUi,
  });

  return {
    ...currentSnapshot,
    workspaces: {
      ...state.workspaces,
      byId: {
        ...state.workspaces.byId,
        [state.workspaces.currentWorkspaceId]: {
          ...state.workspaces.byId[state.workspaces.currentWorkspaceId],
          updatedAt: Date.now(),
          snapshot: currentSnapshot,
        },
      },
    },
  };
}

function sanitizeBucketIds(ids: string[], byId: FilesState['byId']): string[] {
  return ids.filter((id) => Boolean(byId[id]));
}

function markPreviewDirty(ui: UIState): UIState {
  return {
    ...ui,
    preview: {
      ...ui.preview,
      needsRefresh: true,
    },
  };
}

function cloneBlocks(blocks?: DocumentBlock[]): DocumentBlock[] {
  return (blocks ?? []).map((block) => {
    if (block.type === 'table') {
      return {
        ...block,
        columns: [...block.columns],
        rows: block.rows.map((row) => [...row]),
      };
    }

    if (block.type === 'chart') {
      return {
        ...block,
        x: [...block.x],
        series: block.series.map((series) => ({ ...series, values: [...series.values] })),
      };
    }

    return { ...block };
  });
}

function upsertSectionRecord(
  sectionsById: Record<string, DocumentSection>,
  section: DocumentSection,
): Record<string, DocumentSection> {
  return {
    ...sectionsById,
    [section.id]: {
      ...section,
      blocks: cloneBlocks(section.blocks),
      linkedFileIds: reconcileSectionLinkedFileIds(section, section.blocks),
    },
  };
}

function nextSectionOrderFromPayload(payload: GeneratedDocumentPayload): string[] {
  if (payload.sectionOrder && payload.sectionOrder.length > 0) {
    return payload.sectionOrder;
  }

  return payload.sections.map((section) => section.id);
}

function applyChatScope(
  sectionMessageIds: RootState['chat']['sectionMessageIds'],
  message: ChatMessage,
): RootState['chat']['sectionMessageIds'] {
  if (message.scope.type !== 'section') {
    return sectionMessageIds;
  }

  const existing = sectionMessageIds[message.scope.sectionId] ?? [];

  return {
    ...sectionMessageIds,
    [message.scope.sectionId]: [...existing, message.id],
  };
}

function reconcileSectionLinkedFileIds(section: DocumentSection, blocks?: DocumentBlock[]): string[] {
  const nextBlocks = blocks ?? section.blocks ?? [];
  const imageFileIds = nextBlocks
    .filter((block): block is Extract<DocumentBlock, { type: 'image' }> => block.type === 'image')
    .map((block) => block.assetFileId)
    .filter(Boolean);

  return Array.from(new Set([...section.linkedFileIds.filter(Boolean), ...imageFileIds]));
}

function removeFileIdFromSections(
  sectionsById: RootState['document']['sectionsById'],
  fileId: string,
): RootState['document']['sectionsById'] {
  return Object.fromEntries(
    Object.entries(sectionsById).map(([sectionId, section]) => {
      const nextBlocks = (section.blocks ?? []).filter(
        (block) => block.type !== 'image' || block.assetFileId !== fileId,
      );

      return [
        sectionId,
        {
          ...section,
          blocks: nextBlocks,
          linkedFileIds: reconcileSectionLinkedFileIds(
            { ...section, linkedFileIds: section.linkedFileIds.filter((linkedId) => linkedId !== fileId) },
            nextBlocks,
          ),
        },
      ];
    }),
  );
}

function removeSectionIdFromChat(
  sectionMessageIds: RootState['chat']['sectionMessageIds'],
  messagesById: RootState['chat']['messagesById'],
  sectionId: string,
) {
  const messageIdsToRemove = new Set(sectionMessageIds[sectionId] ?? []);

  const nextMessagesById = Object.fromEntries(
    Object.entries(messagesById).filter(([messageId]) => !messageIdsToRemove.has(messageId)),
  );

  const { [sectionId]: _removed, ...restSectionMessageIds } = sectionMessageIds;

  return {
    sectionMessageIds: restSectionMessageIds,
    messagesById: nextMessagesById,
  };
}

const createActions = (
  set: Parameters<StateCreator<RootState>>[0],
  get: Parameters<StateCreator<RootState>>[1],
): AppActions => ({
  addUploadedFiles: (bucket: FileBucket, files: IncomingFilePayload[]) => {
    if (files.length === 0) {
      return;
    }

    set((state) => {
      const nextById = { ...state.files.byId };
      const nextBucketIds = [...state.files.idsByBucket[bucket]];
      const now = Date.now();

      for (const file of files) {
        if (nextById[file.id]) {
          continue;
        }

        nextById[file.id] = {
          id: file.id,
          bucket,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          source: 'upload',
          status: 'uploaded',
          createdAt: file.createdAt ?? now,
          updatedAt: file.updatedAt ?? now,
          objectUrl: file.objectUrl,
          rawTextStatus: 'idle',
          note: '',
        };

        nextBucketIds.push(file.id);
      }

      const shouldShowResultsHint =
        bucket === 'results' &&
        !state.ui.hints.resultsFirstUploadHintDismissedForever &&
        !state.ui.hints.resultsFirstUploadHintHasShownOnce &&
        state.files.idsByBucket.results.length === 0 &&
        nextBucketIds.length > 0;

      return {
        files: {
          byId: nextById,
          idsByBucket: {
            ...state.files.idsByBucket,
            [bucket]: nextBucketIds,
          },
        },
        ui: markPreviewDirty({
          ...state.ui,
          workspace: {
            ...state.ui.workspace,
            expandedBucket: state.ui.workspace.expandedBucket,
            trayOpenByBucket: state.ui.workspace.trayOpenByBucket,
          },
          hints: shouldShowResultsHint
            ? {
                ...state.ui.hints,
                resultsFirstUploadHintVisible: true,
                resultsFirstUploadHintHasShownOnce: true,
                resultsFirstUploadHintShownAt: now,
              }
            : state.ui.hints,
        }),
      };
    });
  },

  setFileStatus: (fileId: string, status: FileLifecycleStatus, parseError?: string) => {
    set((state) => {
      const target = state.files.byId[fileId];
      if (!target) {
        return state;
      }

      return {
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [fileId]: {
              ...target,
              status,
              rawTextStatus:
                status === 'parsing'
                  ? 'extracting'
                  : status === 'ready'
                    ? 'ready'
                    : status === 'error'
                      ? 'error'
                      : target.rawTextStatus,
              parseError,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  setFileParsedText: (fileId: string, parsedText: string) => {
    set((state) => {
      const target = state.files.byId[fileId];
      if (!target) {
        return state;
      }

      return {
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [fileId]: {
              ...target,
              parsedText,
              status: 'ready',
              rawTextStatus: 'ready',
              parseError: undefined,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  setFileNote: (fileId: string, note: string) => {
    set((state) => {
      const target = state.files.byId[fileId];
      if (!target) {
        return state;
      }

      return {
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [fileId]: {
              ...target,
              note,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  removeFile: (fileId: string) => {
    set((state) => {
      const target = state.files.byId[fileId];
      if (!target) {
        return state;
      }

      const nextById = { ...state.files.byId };
      delete nextById[fileId];

      return {
        files: {
          byId: nextById,
          idsByBucket: {
            requirement: sanitizeBucketIds(
              state.files.idsByBucket.requirement.filter((id) => id !== fileId),
              nextById,
            ),
            results: sanitizeBucketIds(
              state.files.idsByBucket.results.filter((id) => id !== fileId),
              nextById,
            ),
            reference: sanitizeBucketIds(
              state.files.idsByBucket.reference.filter((id) => id !== fileId),
              nextById,
            ),
          },
        },
        document: {
          ...state.document,
          sectionsById: removeFileIdFromSections(state.document.sectionsById, fileId),
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  setDocumentMeta: (patch: Partial<DocumentMeta>) => {
    set((state) => ({
      document: {
        ...state.document,
        meta: {
          ...state.document.meta,
          ...patch,
          template: {
            ...state.document.meta.template,
            ...patch.template,
          },
        },
      },
      ui: markPreviewDirty(state.ui),
    }));
  },

  replaceDocumentFromAI: (payload: GeneratedDocumentPayload) => {
    set((state) => {
      const nextSectionsById = payload.sections.reduce<Record<string, DocumentSection>>((accumulator, section) => {
        const nextBlocks = cloneBlocks(section.blocks);
        accumulator[section.id] = {
          ...section,
          blocks: nextBlocks,
          linkedFileIds: reconcileSectionLinkedFileIds(section, nextBlocks),
        };
        return accumulator;
      }, {});

      return {
        document: {
          meta: {
            ...state.document.meta,
            ...payload.meta,
            template: {
              ...state.document.meta.template,
              ...payload.meta?.template,
            },
          },
          sectionsById: nextSectionsById,
          sectionOrder: nextSectionOrderFromPayload(payload),
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  updateSectionMeta: (sectionId: string, patch) => {
    set((state) => {
      const target = state.document.sectionsById[sectionId];
      if (!target) {
        return state;
      }

      return {
        document: {
          ...state.document,
          sectionsById: {
            ...state.document.sectionsById,
            [sectionId]: {
              ...target,
              ...patch,
              updatedAt: Date.now(),
            },
          },
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  updateSectionContent: (sectionId: string, content: string) => {
    set((state) => {
      const target = state.document.sectionsById[sectionId];
      if (!target) {
        return state;
      }

      return {
        document: {
          ...state.document,
          sectionsById: {
            ...state.document.sectionsById,
            [sectionId]: {
              ...target,
              content,
              updatedAt: Date.now(),
            },
          },
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  updateSectionBlocks: (sectionId: string, blocks: DocumentBlock[]) => {
    set((state) => {
      const target = state.document.sectionsById[sectionId];
      if (!target) {
        return state;
      }

      const nextBlocks = cloneBlocks(blocks);

      return {
        document: {
          ...state.document,
          sectionsById: {
            ...state.document.sectionsById,
            [sectionId]: {
              ...target,
              blocks: nextBlocks,
              linkedFileIds: reconcileSectionLinkedFileIds(target, nextBlocks),
              updatedAt: Date.now(),
            },
          },
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  updateSectionStatus: (sectionId: string, status: SectionStatus) => {
    set((state) => {
      const target = state.document.sectionsById[sectionId];
      if (!target) {
        return state;
      }

      return {
        document: {
          ...state.document,
          sectionsById: {
            ...state.document.sectionsById,
            [sectionId]: {
              ...target,
              status,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  reorderSections: (sectionIds: string[]) => {
    set((state) => ({
      document: {
        ...state.document,
        sectionOrder: sectionIds.filter((id) => Boolean(state.document.sectionsById[id])),
      },
      ui: markPreviewDirty(state.ui),
    }));
  },

  addSection: (section: DocumentSection) => {
    set((state) => ({
      document: {
        ...state.document,
        sectionsById: upsertSectionRecord(state.document.sectionsById, section),
        sectionOrder: state.document.sectionOrder.includes(section.id)
          ? state.document.sectionOrder
          : [...state.document.sectionOrder, section.id],
      },
      ui: markPreviewDirty(state.ui),
    }));
  },

  removeSection: (sectionId: string) => {
    set((state) => {
      const nextSectionsById = { ...state.document.sectionsById };
      delete nextSectionsById[sectionId];

      const { sectionMessageIds, messagesById } = removeSectionIdFromChat(
        state.chat.sectionMessageIds,
        state.chat.messagesById,
        sectionId,
      );

      const { [sectionId]: _removedSnapshots, ...restSnapshots } = state.snapshots.bySectionId;

      return {
        document: {
          ...state.document,
          sectionsById: nextSectionsById,
          sectionOrder: state.document.sectionOrder.filter((id) => id !== sectionId),
        },
        chat: {
          ...state.chat,
          sectionMessageIds,
          messagesById,
        },
        snapshots: {
          bySectionId: restSnapshots,
        },
        ui: markPreviewDirty(state.ui),
      };
    });
  },

  addChatMessage: (message: ChatMessage) => {
    set((state) => ({
      chat: {
        globalMessageIds:
          message.scope.type === 'global'
            ? [...state.chat.globalMessageIds, message.id]
            : state.chat.globalMessageIds,
        sectionMessageIds: applyChatScope(state.chat.sectionMessageIds, message),
        messagesById: {
          ...state.chat.messagesById,
          [message.id]: message,
        },
      },
    }));
  },

  updateChatMessage: (messageId: string, patch: Partial<ChatMessage>) => {
    set((state) => {
      const target = state.chat.messagesById[messageId];
      if (!target) {
        return state;
      }

      return {
        chat: {
          ...state.chat,
          messagesById: {
            ...state.chat.messagesById,
            [messageId]: {
              ...target,
              ...patch,
            },
          },
        },
      };
    });
  },

  pushSectionSnapshot: (sectionId: string, snapshot: SectionSnapshot) => {
    set((state) => ({
      snapshots: {
        bySectionId: {
          ...state.snapshots.bySectionId,
          [sectionId]: [...(state.snapshots.bySectionId[sectionId] ?? []), { ...snapshot, blocks: cloneBlocks(snapshot.blocks) }],
        },
      },
    }));
  },

  undoSection: (sectionId: string) => {
    const { document, snapshots } = get();
    const targetSection = document.sectionsById[sectionId];
    const history = snapshots.bySectionId[sectionId] ?? [];

    if (!targetSection || history.length === 0) {
      return;
    }

    const previousSnapshot = history[history.length - 1];

    set((state) => ({
      document: {
        ...state.document,
        sectionsById: {
          ...state.document.sectionsById,
          [sectionId]: {
            ...state.document.sectionsById[sectionId],
            content: previousSnapshot.content,
            blocks: cloneBlocks(previousSnapshot.blocks),
            linkedFileIds: reconcileSectionLinkedFileIds(
              state.document.sectionsById[sectionId],
              previousSnapshot.blocks,
            ),
            updatedAt: Date.now(),
          },
        },
      },
      snapshots: {
        bySectionId: {
          ...state.snapshots.bySectionId,
          [sectionId]: history.slice(0, -1),
        },
      },
    }));
  },

  clearSectionSnapshots: (sectionId: string) => {
    set((state) => ({
      snapshots: {
        bySectionId: {
          ...state.snapshots.bySectionId,
          [sectionId]: [],
        },
      },
    }));
  },

  setExpandedBucket: (bucket: FileBucket | null) => {
    set((state) => ({
      ui: {
        ...state.ui,
        workspace: {
          ...state.ui.workspace,
          expandedBucket: bucket,
        },
      },
    }));
  },

  setTrayOpen: (bucket: FileBucket, open: boolean) => {
    set((state) => ({
      ui: {
        ...state.ui,
        workspace: {
          ...state.ui.workspace,
          trayOpenByBucket: {
            ...state.ui.workspace.trayOpenByBucket,
            [bucket]: open,
          },
          expandedBucket: open ? bucket : state.ui.workspace.expandedBucket === bucket ? null : state.ui.workspace.expandedBucket,
        },
      },
    }));
  },

  showResultsFirstUploadHint: (shownAt = Date.now()) => {
    set((state) => {
      if (state.ui.hints.resultsFirstUploadHintDismissedForever) {
        return state;
      }

      return {
        ui: {
          ...state.ui,
          hints: {
            ...state.ui.hints,
            resultsFirstUploadHintVisible: true,
            resultsFirstUploadHintHasShownOnce: true,
            resultsFirstUploadHintShownAt: shownAt,
          },
        },
      };
    });
  },

  dismissResultsFirstUploadHint: (forever = false) => {
    set((state) => ({
      ui: {
        ...state.ui,
        hints: {
          ...state.ui.hints,
          resultsFirstUploadHintVisible: false,
          resultsFirstUploadHintDismissedForever:
            forever || state.ui.hints.resultsFirstUploadHintDismissedForever,
        },
      },
    }));
  },

  setPreviewState: (patch: Partial<PreviewState>) => {
    set((state) => ({
      ui: {
        ...state.ui,
        preview: {
          ...state.ui.preview,
          ...patch,
        },
      },
    }));
  },

  createWorkspace: (name: string) => {
    set((state) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return state;
      }

      const currentSnapshot = createWorkspaceSnapshotFromSlices({
        files: state.files,
        document: state.document,
        chat: state.chat,
        snapshots: state.snapshots,
        ui: state.ui,
      });
      const nextWorkspace = createDefaultWorkspaceRecord(trimmedName);

      return {
        ...nextWorkspace.snapshot,
        workspaces: {
          currentWorkspaceId: nextWorkspace.id,
          order: [...state.workspaces.order, nextWorkspace.id],
          byId: {
            ...state.workspaces.byId,
            [state.workspaces.currentWorkspaceId]: {
              ...state.workspaces.byId[state.workspaces.currentWorkspaceId],
              updatedAt: Date.now(),
              snapshot: currentSnapshot,
            },
            [nextWorkspace.id]: nextWorkspace,
          },
        },
      };
    });
  },

  switchWorkspace: (workspaceId: string) => {
    set((state) => {
      if (workspaceId === state.workspaces.currentWorkspaceId || !state.workspaces.byId[workspaceId]) {
        return state;
      }

      const currentSnapshot = createWorkspaceSnapshotFromSlices({
        files: state.files,
        document: state.document,
        chat: state.chat,
        snapshots: state.snapshots,
        ui: state.ui,
      });
      const targetWorkspace = state.workspaces.byId[workspaceId];

      return {
        ...targetWorkspace.snapshot,
        workspaces: {
          ...state.workspaces,
          currentWorkspaceId: workspaceId,
          byId: {
            ...state.workspaces.byId,
            [state.workspaces.currentWorkspaceId]: {
              ...state.workspaces.byId[state.workspaces.currentWorkspaceId],
              updatedAt: Date.now(),
              snapshot: currentSnapshot,
            },
            [workspaceId]: {
              ...targetWorkspace,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  renameWorkspace: (workspaceId: string, name: string) => {
    set((state) => {
      const target = state.workspaces.byId[workspaceId];
      const trimmedName = name.trim();
      if (!target || !trimmedName) {
        return state;
      }

      return {
        workspaces: {
          ...state.workspaces,
          byId: {
            ...state.workspaces.byId,
            [workspaceId]: {
              ...target,
              name: trimmedName,
              updatedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  deleteWorkspace: (workspaceId: string) => {
    set((state) => {
      const target = state.workspaces.byId[workspaceId];
      if (!target || state.workspaces.order.length <= 1) {
        return state;
      }

      const nextOrder = state.workspaces.order.filter((id) => id !== workspaceId);
      const nextById = { ...state.workspaces.byId };
      delete nextById[workspaceId];

      if (workspaceId !== state.workspaces.currentWorkspaceId) {
        return {
          workspaces: {
            ...state.workspaces,
            order: nextOrder,
            byId: nextById,
          },
        };
      }

      const fallbackWorkspaceId = nextOrder[0];
      const fallbackWorkspace = nextById[fallbackWorkspaceId];

      return {
        ...fallbackWorkspace.snapshot,
        workspaces: {
          currentWorkspaceId: fallbackWorkspaceId,
          order: nextOrder,
          byId: nextById,
        },
      };
    });
  },

  resetWorkspace: () => {
    set((state) => {
      const emptyWorkspace = createDefaultWorkspaceRecord(state.workspaces.byId[state.workspaces.currentWorkspaceId]?.name || 'Workspace');

      return {
        ...emptyWorkspace.snapshot,
        workspaces: {
          ...state.workspaces,
          byId: {
            ...state.workspaces.byId,
            [state.workspaces.currentWorkspaceId]: {
              ...emptyWorkspace,
              id: state.workspaces.currentWorkspaceId,
            },
          },
        },
        actions: get().actions,
      };
    });
  },
});

export const useAppStore = create<RootState>()(
  persist(
    (set, get) => {
      const baseState = createInitialState();

      return {
        ...baseState,
        actions: createActions(set, get),
      };
    },
    {
      name: 'latex-pro-web-v2-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => createPersistedStateSlice(state),
    },
  ),
);
