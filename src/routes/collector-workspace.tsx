import { createFileRoute } from "@tanstack/react-router";

import { canAccessCollectorWorkspace } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { SubmissionOperationsPage } from "./operations.submissions";

export const Route = createFileRoute("/collector-workspace")({
  component: CollectorWorkspacePage,
});

function CollectorWorkspacePage() {
  return (
    <RoleWorkspaceGuard allows={canAccessCollectorWorkspace} title="Collector workspace">
      <SubmissionOperationsPage />
    </RoleWorkspaceGuard>
  );
}
