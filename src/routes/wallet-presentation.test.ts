import { describe, expect, it } from "vitest";

import type { WalletMovementView } from "@/domain";
import {
  formatWalletMoney,
  parseWalletGbp,
  settledMovementFlow,
  WALLET_EMPTY_STATES,
  WALLET_ERROR_STATES,
} from "./-wallet-presentation";

const at = "2026-08-09T00:00:00.000Z" as WalletMovementView["createdAt"];
const settledDeposit: WalletMovementView = {
  id: "movement-safe",
  type: "DEPOSIT",
  amountMinor: "12500",
  currency: "GBP",
  status: "SETTLED",
  createdAt: at,
  updatedAt: at,
  replayed: false,
};

describe("Document 016 wallet presentation authority", () => {
  it("uses bigint GBP presentation and validates positive decimal input without floating point", () => {
    expect(formatWalletMoney("9007199254740993")).toBe("£90,071,992,547,409.93");
    expect(parseWalletGbp("125.50")).toBe("12550");
    expect(parseWalletGbp("1.234")).toBeNull();
  });

  it("derives cash-flow insight only from settled authoritative movements", () => {
    const pendingWithdrawal = {
      ...settledDeposit,
      id: "pending-safe",
      type: "WITHDRAWAL" as const,
      amountMinor: "2500",
      status: "PENDING_PROVIDER" as const,
    };
    const settledWithdrawal = {
      ...settledDeposit,
      id: "withdrawal-safe",
      type: "WITHDRAWAL" as const,
      amountMinor: "5000",
    };
    expect(settledMovementFlow([settledDeposit, pendingWithdrawal, settledWithdrawal])).toEqual({
      inflowMinor: "12500",
      outflowMinor: "5000",
    });
    expect(settledMovementFlow([pendingWithdrawal])).toBeNull();
  });

  it("keeps empty, wallet-activity, and panel error states explicit", () => {
    expect(WALLET_EMPTY_STATES).toMatchObject({
      bank: "No bank connected.",
      movements: "No money movements yet.",
      activity: "No recent wallet activity.",
    });
    expect(Object.values(WALLET_ERROR_STATES)).toEqual(
      expect.arrayContaining([
        "Unable to load wallet balances.",
        "Unable to load bank connections.",
      ]),
    );
  });
});
