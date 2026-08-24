import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

import { CapabilityRequiredDialog } from "./CapabilityRequiredDialog";

describe("CapabilityRequiredDialog", () => {
  it("shows a clear setup requirement without exposing compliance internals", () => {
    const html = renderToStaticMarkup(
      <CapabilityRequiredDialog
        decision={{
          capability: "PLACE_BUY_ORDER",
          allowed: false,
          status: "ACTION_REQUIRED",
          reason: "IDENTITY_VERIFICATION_REQUIRED",
          requirements: [
            { type: "EMAIL_VERIFICATION", satisfied: true },
            { type: "IDENTITY_VERIFICATION", satisfied: false },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Complete identity verification");
    expect(html).toContain("Requested feature: Place Buy Order");
    expect(html).toContain("✓ Email verification");
    expect(html).toContain("Identity verification");
    expect(html).toContain("Continue identity verification");
    expect(html).not.toMatch(/case id|provider|hold|journal|account id/i);
  });

  it("uses a customer-facing email action instead of a raw policy code", () => {
    const html = renderToStaticMarkup(
      <CapabilityRequiredDialog
        decision={{
          capability: "PLACE_BUY_ORDER",
          allowed: false,
          status: "ACTION_REQUIRED",
          reason: "EMAIL_VERIFICATION_REQUIRED",
          requirements: [{ type: "EMAIL_VERIFICATION", satisfied: false }],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Verify email");
    expect(html).not.toContain("EMAIL_VERIFICATION_REQUIRED");
  });

  it("explains an intentionally unavailable funding feature without inventing setup work", () => {
    const html = renderToStaticMarkup(
      <CapabilityRequiredDialog
        decision={{
          capability: "DEPOSIT_FUNDS",
          allowed: false,
          status: "TEMPORARILY_UNAVAILABLE",
          reason: "DEPOSITS_UNAVAILABLE",
          requirements: [
            { type: "EMAIL_VERIFICATION", satisfied: true },
            { type: "FEATURE_AVAILABILITY", satisfied: false },
          ],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Deposits are temporarily unavailable");
    expect(html).toContain("No account step is missing");
    expect(html).not.toContain("Feature availability");
    expect(html).not.toContain("Continue setup");
  });
});
