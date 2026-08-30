// TOTAL EDIT is the canonical editing provider.
// Marketing OS consumes TOTAL EDIT through this contract.
// TOTAL EDIT must never import Marketing OS domain code.

export interface EditProject {
  id: string;
  name: string;
  status: string;
}

export interface EditDirective {
  type: string;
  params: Record<string, unknown>;
}

export interface RenderJob {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  outputUrl: string | null;
}

export interface EditingProvider {
  readonly provider: string;
  createProject(name: string, mediaAssetId: string): Promise<EditProject>;
  applyDirective(projectId: string, directive: EditDirective): Promise<void>;
  startRender(projectId: string): Promise<RenderJob>;
  getRenderStatus(jobId: string): Promise<RenderJob>;
}
