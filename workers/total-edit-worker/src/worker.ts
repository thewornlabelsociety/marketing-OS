// total-edit-worker: processes RenderJob queue items.
// Delegates to total-edit-adapter-local for ffmpeg and filesystem operations.
// This worker does NOT import Marketing OS domain code.

async function startWorker(): Promise<void> {
  console.log('Total Edit Worker starting...');
  // Job polling will be implemented when RenderJob queue is active.
}

void startWorker();
