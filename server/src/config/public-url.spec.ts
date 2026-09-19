import { publicApplicationUrl } from "./public-url";

describe("publicApplicationUrl", () => {
  it("retains the configured preview mount for first-party callbacks", () => {
    expect(
      publicApplicationUrl("https://staging.slice.test/preview", "/verify-email?token=test"),
    ).toBe("https://staging.slice.test/preview/verify-email?token=test");
  });

  it("retains the root deployment behavior", () => {
    expect(publicApplicationUrl("https://staging.slice.test", "/wallet")).toBe(
      "https://staging.slice.test/wallet",
    );
  });
});
