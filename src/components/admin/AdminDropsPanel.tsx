import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { DropView } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import "./admin-drops-panel.css";

export function AdminDropsPanel() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const list = useQuery({
    queryKey: ["admin", "drops"],
    queryFn: () => services.repositories.drops.listAdmin(),
    staleTime: 10_000,
  });
  const selected = list.data?.items.find((drop) => drop.id === selectedId);
  const transition = useMutation({
    mutationFn: (input: {
      drop: DropView;
      target: "READY_TO_PUBLISH" | "LIVE" | "CLOSED" | "CANCELLED";
    }) =>
      services.repositories.drops.transitionAdmin(input.drop.id, {
        version: input.drop.version,
        target: input.target,
        reason: "Admin lifecycle review completed in Slice Preview.",
      }),
    onSuccess: () => {
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ["admin", "drops"] });
    },
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : "The Drop could not be updated."),
  });

  return (
    <section className="admin-drops">
      <header className="admin-drops-hero">
        <div>
          <p className="admin-eyebrow">Preview foundation</p>
          <h1>Slice Drops</h1>
          <p>
            Inspect creator, exact canonical inventory, authoritative readiness, lifecycle state,
            and append-only history.
          </p>
        </div>
        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => void list.refetch()}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </header>
      <div className="admin-drops-grid">
        <div className="admin-drops-list">
          {list.data?.items.map((drop) => (
            <button
              key={drop.id}
              type="button"
              className={selectedId === drop.id ? "is-active" : ""}
              onClick={() => setSelectedId(drop.id)}
            >
              <span className="admin-drops-icon">
                <PackageCheck aria-hidden="true" />
              </span>
              <span>
                <strong>{drop.name}</strong>
                <small>
                  {drop.creator.displayName} · {drop.inventoryCount} assets
                </small>
              </span>
              <span className="admin-drops-state">{drop.state.replaceAll("_", " ")}</span>
            </button>
          ))}
          {!list.isLoading && list.data?.items.length === 0 ? (
            <div className="admin-drops-empty">No preview Drops have been created.</div>
          ) : null}
          {list.isError ? (
            <div className="admin-drops-empty">Drops could not be loaded from the preview API.</div>
          ) : null}
        </div>
        <div className="admin-drops-detail">
          {selected ? (
            <DropInspection
              drop={selected}
              pending={transition.isPending}
              act={(target) => transition.mutate({ drop: selected, target })}
            />
          ) : (
            <div className="admin-drops-empty">
              <ExternalLink aria-hidden="true" />
              Select a Drop to inspect its authoritative record.
            </div>
          )}
          {error ? (
            <p className="admin-drops-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DropInspection({
  drop,
  pending,
  act,
}: {
  drop: DropView;
  pending: boolean;
  act: (target: "READY_TO_PUBLISH" | "LIVE" | "CLOSED" | "CANCELLED") => void;
}) {
  return (
    <>
      <div className="admin-drops-detail-head">
        <div>
          <p className="admin-eyebrow">{drop.publicId}</p>
          <h2>{drop.name}</h2>
          <p>{drop.description}</p>
        </div>
        <span className="admin-drops-state">{drop.state.replaceAll("_", " ")}</span>
      </div>
      <div className="admin-drops-facts">
        <div>
          <small>Creator</small>
          <strong>{drop.creator.displayName}</strong>
        </div>
        <div>
          <small>Inventory</small>
          <strong>{drop.inventoryCount}</strong>
        </div>
        <div>
          <small>Remaining</small>
          <strong>{drop.remainingInventoryCount}</strong>
        </div>
        <div>
          <small>Version</small>
          <strong>{drop.version}</strong>
        </div>
      </div>
      <h3>Readiness</h3>
      <div className="admin-drops-checks">
        {drop.readiness.checks.map((check) => (
          <div className={check.passed ? "is-ready" : ""} key={check.code}>
            {check.passed ? <CheckCircle2 /> : <ShieldAlert />}
            <span>
              <strong>{check.code.replaceAll("_", " ")}</strong>
              <small>{check.passed ? "Passed" : check.message}</small>
            </span>
          </div>
        ))}
      </div>
      <h3>Exact inventory</h3>
      <div className="admin-drops-inventory">
        {drop.inventory.map((asset) => (
          <div key={asset.id}>
            <strong>{asset.title}</strong>
            <span>
              {asset.vaultLock.active ? "Drop locked" : "Lock missing"} · {asset.publicId}
            </span>
            <span>
              {!asset.eligibility.eligible
                ? asset.eligibility.reasons.map((reason) => reason.message).join(" · ")
                : asset.referenceValue
                  ? `${asset.referenceValue.currency} ${asset.referenceValue.amountMinor} minor`
                  : "Eligible · reference value unavailable"}
            </span>
          </div>
        ))}
      </div>
      <h3>History</h3>
      <div className="admin-drops-history">
        {drop.history.map((event) => (
          <div key={event.id}>
            <strong>{event.action.replaceAll("_", " ")}</strong>
            <span>{new Date(event.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="admin-drops-actions">
        {drop.state === "READY_FOR_REVIEW" ? (
          <button
            disabled={pending || !drop.readiness.ready}
            className="admin-primary-button"
            type="button"
            onClick={() => act("READY_TO_PUBLISH")}
          >
            Mark ready to publish
          </button>
        ) : null}
        {drop.state === "READY_TO_PUBLISH" ? (
          <button
            disabled={pending || !drop.readiness.ready}
            className="admin-primary-button"
            type="button"
            onClick={() => act("LIVE")}
          >
            Publish Drop
          </button>
        ) : null}
        {drop.state === "LIVE" ? (
          <button
            disabled={pending}
            className="admin-secondary-button"
            type="button"
            onClick={() => act("CLOSED")}
          >
            Close Drop
          </button>
        ) : null}
        {!["LIVE", "SOLD_OUT", "CLOSED", "CANCELLED"].includes(drop.state) ? (
          <button
            disabled={pending}
            className="admin-secondary-button"
            type="button"
            onClick={() => act("CANCELLED")}
          >
            Cancel Drop
          </button>
        ) : null}
      </div>
    </>
  );
}
