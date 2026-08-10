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
    expect(html).toContain("Complete: email verification");
    expect(html).toContain("Required: identity verification");
    expect(html).toContain("Continue identity verification");
    expect(html).not.toMatch(/case id|provider|hold|journal|account id/i);
  });

  it("uses a customer-facing email action instead of a raw policy code", () => {
    const html = renderToStaticMarkup(
      <CapabilityRequiredDialog
        decision={{
          capability: "PLACE_BUY_ORDER",
          allowed: false,
          reason: "EMAIL_VERIFICATION_REQUIRED",
          requirements: [{ type: "EMAIL_VERIFICATION", satisfied: false }],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Verify email");
    expect(html).not.toContain("EMAIL_VERIFICATION_REQUIRED");
  });
});
