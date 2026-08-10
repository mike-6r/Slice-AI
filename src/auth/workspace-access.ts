/**
 * Private workspace routing is a presentation of the server-issued role
 * projection. The API remains the authority for every operational request.
 */
export type WorkspaceRole = string;

const STAFF_ROLES = new Set<WorkspaceRole>(["SUPPORT", "ADMIN"]);

/** Asset reviewers are the existing collector-operations authority. */
export function canAccessCollectorWorkspace(roles: readonly WorkspaceRole[]) {
  return roles.includes("ASSET_REVIEWER") || roles.includes("ADMIN");
}

/** Any server-recognised operations role can enter the staff workspace shell. */
export function canAccessStaffWorkspace(roles: readonly WorkspaceRole[]) {
  return roles.some((role) => STAFF_ROLES.has(role));
}

export function staffWorkspaceLinks(roles: readonly WorkspaceRole[]) {
  return {
    canReviewSubmissions: canAccessCollectorWorkspace(roles),
    canManageAssetLifecycle:
      roles.includes("COMPLIANCE_ANALYST") ||
      roles.includes("VAULT_OPERATOR") ||
      roles.includes("ADMIN"),
  };
}
