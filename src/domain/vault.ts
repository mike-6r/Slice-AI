import type { AssetId, ChainOfCustodyEvent, VaultRecord } from "./asset";
export interface VaultAssetStatus {
  assetId: AssetId;
  vault: VaultRecord;
  custody: ChainOfCustodyEvent[];
}
