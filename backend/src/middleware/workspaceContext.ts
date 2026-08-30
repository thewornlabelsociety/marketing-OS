import type { NextFunction, Request, Response } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';

// In local-first mode the workspace is resolved from LOCAL_TENANT_ID.
// This middleware will be replaced by authenticated workspace resolution
// when the SaaS migration path is implemented.
export function workspaceContext(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { tenantId: string }).tenantId = LOCAL_TENANT_ID;
  next();
}
