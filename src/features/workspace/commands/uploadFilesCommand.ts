import { extractTextFromFile } from '../../../domain/files/extractTextFromFile';
import { useAppStore } from '../../../store/useAppStore';
import type { FileBucket } from '../../../store/types';

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export async function uploadFilesCommand(bucket: FileBucket, fileList: FileList | File[]): Promise<string[]> {
  const state = useAppStore.getState();
  const files = Array.from(fileList);

  if (files.length === 0) {
    return [];
  }

  const now = Date.now();
  const payloads = files.map((file, index) => ({
    id: generateId(bucket),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    objectUrl: typeof URL !== 'undefined' ? URL.createObjectURL(file) : undefined,
    createdAt: now + index,
    updatedAt: now + index,
  }));

  state.actions.addUploadedFiles(bucket, payloads);

  await Promise.all(
    files.map(async (file, index) => {
      const fileId = payloads[index]?.id;
      if (!fileId) {
        return;
      }

      try {
        useAppStore.getState().actions.setFileStatus(fileId, 'parsing');
        const parsedText = await extractTextFromFile(file);
        useAppStore.getState().actions.setFileParsedText(fileId, parsedText);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse file.';
        useAppStore.getState().actions.setFileStatus(fileId, 'error', message);
      }
    }),
  );

  return payloads.map((payload) => payload.id);
}
