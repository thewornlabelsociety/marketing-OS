import { Router } from 'express';

// Approval states: PENDING → CHANGES_REQUESTED | READY_FOR_APPROVAL → APPROVED
// Do NOT use: CEO Review, CEO Approval
// Use: Review, Changes Requested, Approve, Approved
export const approvalsRouter = Router();
