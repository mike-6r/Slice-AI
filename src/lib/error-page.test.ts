import { describe, expect, it } from "vitest";

import { renderErrorPage } from "./error-page";

describe("renderErrorPage", () => {
  it("provides a branded recovery page with safe navigation rather than inline script handlers", () => {
    const html = renderErrorPage();

    expect(html).toContain("Slice system recovery");
    expect(html).toContain("A small detour, not a dead end.");
    expect(html).toContain('href=""');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("onclick=");
  });
});
