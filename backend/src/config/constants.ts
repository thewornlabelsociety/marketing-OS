// Local-first tenant ID — infrastructure convention for single-machine development.
// All entities created locally belong to this tenant.
// This is NOT a brand; it is an FK anchor required by the schema for local operation.
// When Marketing OS becomes multi-tenant SaaS, this constant will be replaced by
// a resolved tenant from the authenticated session.
export const LOCAL_TENANT_ID = 'tenant_local';
