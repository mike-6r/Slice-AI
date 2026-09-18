import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mockRepositories } from "@/mocks/repositories";
import { AdminFinanceTrading } from "./AdminFinanceTrading";
import { AdminPlatformOperations } from "./AdminPlatformOperations";
import { AdminRecordDrawer } from "./AdminRecordDrawer";

const pagination = { page: 1, pageSize: 10, total: 1, totalPages: 1 };
const common = {
  dashboardLoading: false,
  recordsLoading: false,
  failed: false,
  retry: vi.fn(),
  query: "",
  status: "",
  page: 1,
  simplified: true,
  update: vi.fn(),
};

describe("admin presentation contract", () => {
  it.each([
    ["wallets", "Wallets &amp; movements", true],
    ["movements", "Wallets &amp; movements", true],
    ["orders", "Trading", false],
    ["executions", "Trading", false],
    ["reconciliation", "Reconciliation", false],
    ["adjustments", "Adjustments", false],
  ])(
    "gives %s a focused workspace without duplicating the dashboard",
    async (tab, title, overview) => {
      const html = renderToStaticMarkup(
        <AdminFinanceTrading
          {...common}
          tab={tab}
          dataClass="OPERATIONAL"
          dashboard={await mockRepositories.admin.getFinanceDashboard()}
          records={{
            tab,
            dataClassScope: "OPERATIONAL",
            items: [],
            pagination: { ...pagination, total: 0 },
          }}
        />,
      );
      expect(html).toContain(`<h2>${title}</h2>`);
      expect(html.includes('aria-label="Financial control domains"')).toBe(overview);
      expect(html).toContain('aria-label="Search finance records"');
      expect(html).toContain("Showing 0 to 0 of 0 records");
    },
  );

  it("renders counts and aggregate IDs as text, not dates", async () => {
    const html = renderToStaticMarkup(
      <AdminPlatformOperations
        {...common}
        tab="jobs"
        dashboard={await mockRepositories.admin.getPlatformDashboard()}
        records={{
          tab: "jobs",
          supported: true,
          message: null,
          pagination,
          items: [
            {
              id: "test-job",
              kind: "job",
              eventType: "submission.updated",
              aggregate: "submission:123",
              attempts: 3,
              status: "FAILED",
              updatedAt: "2026-09-18T12:00:00Z",
            },
          ],
        }}
      />,
    );
    expect(html).toContain('<td title="3">3</td>');
    expect(html).toContain('<td title="submission:123">submission:123</td>');
    expect(html).toContain("18 Sept 2026");
    expect(html).toContain("<h2>Delivery</h2>");
    expect(html).toContain('aria-label="Previous page"');
  });

  it.each([
    ["health", "Platform health"],
    ["integrations", "Integrations"],
    ["audit", "Audit &amp; settings"],
  ])("names the %s view", async (tab, title) => {
    const html = renderToStaticMarkup(
      <AdminPlatformOperations
        {...common}
        tab={tab}
        dashboard={await mockRepositories.admin.getPlatformDashboard()}
      />,
    );
    expect(html).toContain(`<h2>${title}</h2>`);
  });

  it("keeps standalone records in the Slice theme with a named dialog and close control", () => {
    const html = renderToStaticMarkup(
      <AdminRecordDrawer title="Asset record" subtitle="One authoritative record" onClose={vi.fn()}>
        <p>Saved evidence</p>
      </AdminRecordDrawer>,
    );
    expect(html).toContain('data-admin-theme="slice"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('aria-label="Close workspace"');
  });
});
