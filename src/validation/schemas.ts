import { z } from "zod";

const email = z.string().email("Enter a valid email address.");
const positiveDecimal = z.string().regex(/^\d+(?:\.\d+)?$/, "Enter a positive decimal value.");
const ownershipPercentage = z.coerce
  .number()
  .min(0.01)
  .max(90, "A listing cannot exceed 90% ownership.");

export const loginSchema = z.object({
  email,
  password: z.string().min(8, "Password must be at least 8 characters."),
});
export const signupSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter a display name.").max(80),
    email,
    password: z.string().min(12, "Use at least 12 characters."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  handle: z
    .string()
    .trim()
    .regex(/^@[a-z0-9_]{3,24}$/i),
  bio: z.string().trim().max(500).optional(),
});
export const collectibleListingBasicsSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.string().min(1),
  year: z.coerce.number().int().min(1800).max(new Date().getFullYear()),
  description: z.string().trim().max(2_000).optional(),
});
export const gradingSchema = z.object({
  company: z.enum(["PSA", "BGS", "CGC", "SGC", "TAG", "ACE", "other"]),
  grade: z.string().trim().min(1).max(40),
});
export const certificationNumberSchema = z.object({
  certificationNumber: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .regex(/^[A-Za-z0-9#-]+$/, "Use letters, numbers, #, or - only."),
});
export const mediaMetadataSchema = z.object({
  url: z.string().url(),
  alt: z.string().trim().min(3).max(160),
  kind: z.enum(["image", "video"]),
  order: z.coerce.number().int().min(0),
});
export const ownershipPercentageSchema = z.object({ percentage: ownershipPercentage });
const orderPreviewBase = z.object({
  assetId: z.string().min(1),
  units: z.coerce.number().int().positive(),
  orderType: z.enum(["market", "limit"]),
  limitPriceMinor: z.coerce.number().int().positive().optional(),
});
const requireLimitPrice = <T extends { orderType: "market" | "limit"; limitPriceMinor?: number }>(
  schema: z.ZodType<T>,
) =>
  schema.superRefine((value, context) => {
    if (value.orderType === "limit" && !value.limitPriceMinor)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limitPriceMinor"],
        message: "A limit price is required.",
      });
  });
export const buyOrderPreviewSchema = requireLimitPrice(orderPreviewBase);
export const sellOrderPreviewSchema = requireLimitPrice(
  orderPreviewBase.extend({ ownershipPercentage }),
);
export const walletDepositSchema = z.object({
  asset: z.literal("USDC"),
  network: z.enum(["ethereum", "polygon", "base"]),
  amount: positiveDecimal,
});
export const walletWithdrawalSchema = walletDepositSchema.extend({
  destination: z.string().trim().min(12).max(128),
});
export const discussionMessageSchema = z.object({ body: z.string().trim().min(1).max(2_000) });
export const saleProposalSchema = z.object({
  assetId: z.string().min(1),
  rationale: z.string().trim().min(20).max(2_000),
  proposedReserveMinor: z.coerce.number().int().positive().optional(),
  closesAt: z.string().datetime(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ListingBasicsInput = z.infer<typeof collectibleListingBasicsSchema>;
