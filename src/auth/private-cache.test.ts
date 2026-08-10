import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { clearPrivateQueries, isPrivateQueryKey } from "./private-cache";

describe("private query cache", () => {
  it("identifies only account-scoped cache roots", () => {
    expect(isPrivateQueryKey(["watchlist", "current"])).toBe(true);
    expect(isPrivateQueryKey(["notifications", "current"])).toBe(true);
    expect(isPrivateQueryKey(["assets", "public"])).toBe(false);
  });

  it("clears account data without evicting public read models", () => {
    const client = new QueryClient();
    client.setQueryData(["watchlist", "current"], { assetIds: ["asset-1"] });
    client.setQueryData(["notifications", "current"], [{ id: "notice-1" }]);
    client.setQueryData(["assets", "public"], [{ id: "asset-1" }]);

    clearPrivateQueries(client);

    expect(client.getQueryData(["watchlist", "current"])).toBeUndefined();
    expect(client.getQueryData(["notifications", "current"])).toBeUndefined();
    expect(client.getQueryData(["assets", "public"])).toEqual([{ id: "asset-1" }]);
  });
});
