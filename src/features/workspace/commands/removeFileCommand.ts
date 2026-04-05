import { useAppStore } from '../../../store/useAppStore';

export async function removeFileCommand(fileId: string): Promise<void> {
  if (!fileId) {
    return;
  }

  const state = useAppStore.getState();
  const target = state.files.byId[fileId];

  if (!target) {
    return;
  }

  if (target.objectUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(target.objectUrl);
    } catch {
      // no-op: object URL revocation should never block logical deletion
    }
  }

  state.actions.removeFile(fileId);

  const nextState = useAppStore.getState();
  const bucketIds = nextState.files.idsByBucket[target.bucket] ?? [];

  if (bucketIds.length === 0 && nextState.ui.workspace.expandedBucket === target.bucket) {
    nextState.actions.setExpandedBucket(null);
    nextState.actions.setTrayOpen(target.bucket, false);
  }
}
