import { describe, expect, it } from "vitest";

import {
  canAccessCollectorWorkspace,
  canAccessStaffWorkspace,
  staffWorkspaceLinks,
} from "./workspace-access";

describe("private workspace role mapping", () => {
  it("does not show either private workspace to an investor", () => {
    expect(canAccessStaffWorkspace(["USER"])).toBe(false);
    expect(canAccessCollectorWorkspace(["USER"])).toBe(false);
  });

  it("maps the existing support role to the staff workspace only", () => {
    expect(canAccessStaffWorkspace(["USER", "SUPPORT"])).toBe(true);
    expect(canAccessCollectorWorkspace(["USER", "SUPPORT"])).toBe(false);
  });

  it("maps the existing asset-reviewer role to the collector workspace only", () => {
    expect(canAccessStaffWorkspace(["USER", "ASSET_REVIEWER"])).toBe(false);
    expect(canAccessCollectorWorkspace(["USER", "ASSET_REVIEWER"])).toBe(true);
    expect(staffWorkspaceLinks(["USER", "ASSET_REVIEWER"])).toEqual({
      canReviewSubmissions: true,
      canManageAssetLifecycle: false,
    });
  });

  it("keeps support and collector roles additive and honours admin authority", () => {
    expect(canAccessStaffWorkspace(["SUPPORT", "ASSET_REVIEWER"])).toBe(true);
    expect(canAccessCollectorWorkspace(["SUPPORT", "ASSET_REVIEWER"])).toBe(true);
    expect(canAccessStaffWorkspace(["ADMIN"])).toBe(true);
    expect(canAccessCollectorWorkspace(["ADMIN"])).toBe(true);
  });
});
