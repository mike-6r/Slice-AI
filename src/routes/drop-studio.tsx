import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleCheck,
  LockKeyhole,
  PackagePlus,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccessCollectorWorkspace } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { isPreviewEnvironment } from "@/config/environment";
import type { DropView } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { canSubmitDrop, dropReferenceValueLabel } from "./-drop-presentation";
import "@/styles/drops.css";

export const Route = createFileRoute("/drop-studio")({
  beforeLoad: () => {
    if (!isPreviewEnvironment) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Drop Studio | Slice Preview" }] }),
  component: DropStudioPage,
});

function DropStudioPage() {
  return (
    <RoleWorkspaceGuard allows={canAccessCollectorWorkspace} title="Drop Studio">
      <DropStudio />
    </RoleWorkspaceGuard>
  );
}

function DropStudio() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const key = ["drops", "creator"] as const;

  const drops = useQuery({
    queryKey: key,
    queryFn: () => services.repositories.drops.listCreator(),
    staleTime: 10_000,
  });
  const assets = useQuery({
    queryKey: ["drops", "eligible-assets"],
    queryFn: () => services.repositories.drops.listEligibleAssets(),
    staleTime: 10_000,
  });
  const selected = useMemo(
    () => drops.data?.items.find((drop) => drop.id === selectedId) ?? drops.data?.items[0],
    [drops.data?.items, selectedId],
  );

  useEffect(() => {
    if (selected && selectedId !== selected.id) setSelectedId(selected.id);
  }, [selected, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDescription(selected.description);
  }, [selected]);

  const refresh = async (updated?: DropView) => {
    if (updated) {
      queryClient.setQueryData<{ items: DropView[] }>(key, (current) => ({
        items: current?.items.map((drop) => (drop.id === updated.id ? updated : drop)) ?? [updated],
      }));
      setSelectedId(updated.id);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["drops", "eligible-assets"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<DropView>) => operation(),
    onSuccess: (value) => {
      setError(undefined);
      void refresh(value);
    },
    onError: (reason) => setError(messageFor(reason)),
  });

  const create = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(() => services.repositories.drops.create({ name, description }));
  };
  const save = () => {
    if (!selected) return;
    mutation.mutate(() =>
      services.repositories.drops.update(selected.id, {
        version: selected.version,
        name,
        description,
      }),
    );
  };
  const add = (assetId: string) => {
    if (!selected) return;
    mutation.mutate(() =>
      services.repositories.drops.addInventory(selected.id, {
        version: selected.version,
        assetId,
      }),
    );
  };
  const remove = (assetId: string) => {
    if (!selected) return;
    mutation.mutate(() =>
      services.repositories.drops.removeInventory(selected.id, assetId, selected.version),
    );
  };
  const submit = () => {
    if (!selected) return;
    mutation.mutate(() => services.repositories.drops.submit(selected.id, selected.version));
  };

  const editable = selected?.state === "DRAFT";
  const inventoryIds = new Set(selected?.inventory.map((item) => item.id) ?? []);

  return (
    <main className="drops-shell">
      <div className="drops-frame studio-shell">
        <header className="studio-topbar">
          <div>
            <span className="drops-kicker">Creator workspace · preview only</span>
            <h1>Drop Studio</h1>
            <p>
              Build a finite release from your verified, secured, whole-owned collectibles. Each
              step explains what the platform checks and why.
            </p>
          </div>
          <button
            className="drop-button drop-button--primary"
            type="button"
            onClick={() => {
              setSelectedId(undefined);
              setName("");
              setDescription("");
              setStep(1);
            }}
          >
            <Plus size={16} /> New draft
          </button>
        </header>

        <div className="studio-layout">
          <aside className="studio-sidebar">
            <div className="studio-sidebar-title">Your Drops</div>
            {drops.data?.items.map((drop) => (
              <button
                key={drop.id}
                className={`studio-drop-choice${selected?.id === drop.id ? " is-active" : ""}`}
                type="button"
                onClick={() => {
                  setSelectedId(drop.id);
                  setStep(1);
                }}
              >
                <strong>{drop.name}</strong>
                <span>
                  {drop.state.replaceAll("_", " ")} · {drop.inventoryCount} assets
                </span>
              </button>
            ))}
            {!drops.isLoading && drops.data?.items.length === 0 ? (
              <p className="studio-notice">
                No drafts yet. Start with a clear release name and story.
              </p>
            ) : null}
          </aside>

          <section className="studio-panel">
            <div className="studio-steps" aria-label="Drop creation steps">
              {["Describe", "Select inventory", "Readiness"].map((label, index) => (
                <button
                  className={`studio-step${step === index + 1 ? " is-current" : ""}`}
                  type="button"
                  key={label}
                  onClick={() => selected && setStep(index + 1)}
                  disabled={!selected && index > 0}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            {!selected ? (
              <CreateDraft
                name={name}
                description={description}
                setName={setName}
                setDescription={setDescription}
                submit={create}
                pending={mutation.isPending}
              />
            ) : step === 1 ? (
              <>
                <div className="studio-heading">
                  <div>
                    <span className="drops-kicker">Step 1</span>
                    <h2>Tell collectors what this release is</h2>
                    <p>Clear copy becomes the public Drop introduction after review.</p>
                  </div>
                  <StateBadge drop={selected} />
                </div>
                <div className="studio-form">
                  <label className="studio-field">
                    Drop name
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={100}
                      disabled={!editable}
                    />
                  </label>
                  <label className="studio-field">
                    Release description
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={2000}
                      disabled={!editable}
                    />
                  </label>
                </div>
                <p className="studio-notice">
                  <ShieldCheck size={16} aria-hidden="true" /> This creates release metadata only.
                  It does not create pricing, payments, odds, or a draw.
                </p>
                <div className="studio-toolbar">
                  <button
                    type="button"
                    className="drop-button drop-button--secondary"
                    onClick={save}
                    disabled={!editable || mutation.isPending}
                  >
                    <Save size={16} /> Save draft
                  </button>
                  <button
                    type="button"
                    className="drop-button drop-button--primary"
                    onClick={() => setStep(2)}
                  >
                    Choose inventory <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <div className="studio-heading">
                  <div>
                    <span className="drops-kicker">Step 2</span>
                    <h2>Select eligible vault inventory</h2>
                    <p>
                      Eligibility is recomputed from canonical custody, verification, ownership, and
                      conflict records.
                    </p>
                  </div>
                  <StateBadge drop={selected} />
                </div>
                <div className="studio-summary">
                  <div>
                    <small>Selected</small>
                    <strong>{selected.inventoryCount}</strong>
                  </div>
                  <div>
                    <small>Openings recorded</small>
                    <strong>{selected.openingCount}</strong>
                  </div>
                  <div>
                    <small>Remaining</small>
                    <strong>{selected.remainingInventoryCount}</strong>
                  </div>
                </div>
                <div className="studio-asset-grid">
                  {assets.data?.items.map((asset) => {
                    const included = inventoryIds.has(asset.id);
                    const reason = asset.eligibility.reasons[0]?.message;
                    return (
                      <article
                        className={`studio-asset${!asset.eligibility.eligible && !included ? " is-ineligible" : ""}`}
                        key={asset.id}
                      >
                        <div className="studio-asset-mark">
                          {asset.title.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3>{asset.title}</h3>
                          <p>
                            {included
                              ? "Locked to this draft"
                              : asset.eligibility.eligible
                                ? "Eligible · verified, secured, whole-owned"
                                : reason}
                          </p>
                          <p>{dropReferenceValueLabel(asset.referenceValue)}</p>
                        </div>
                        <button
                          type="button"
                          className="drop-button drop-button--secondary"
                          disabled={
                            !editable ||
                            mutation.isPending ||
                            (!included && !asset.eligibility.eligible)
                          }
                          onClick={() => (included ? remove(asset.id) : add(asset.id))}
                          aria-label={`${included ? "Remove" : "Add"} ${asset.title}`}
                        >
                          {included ? <Trash2 size={16} /> : <PackagePlus size={16} />}
                        </button>
                      </article>
                    );
                  })}
                </div>
                {!assets.isLoading && assets.data?.items.length === 0 ? (
                  <p className="studio-notice">
                    No owned assets are available. An asset must be canonical, physically secured,
                    verified, fully issued, and 100% creator-owned.
                  </p>
                ) : null}
                <div className="studio-toolbar">
                  <button
                    type="button"
                    className="drop-button drop-button--primary"
                    onClick={() => setStep(3)}
                  >
                    Review readiness <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="studio-heading">
                  <div>
                    <span className="drops-kicker">Step 3</span>
                    <h2>Final readiness check</h2>
                    <p>
                      Submitting freezes creator edits and sends the Drop to admin review. It does
                      not publish automatically.
                    </p>
                  </div>
                  <StateBadge drop={selected} />
                </div>
                <div className="studio-summary">
                  <div>
                    <small>Inventory</small>
                    <strong>{selected.inventoryCount}</strong>
                  </div>
                  <div>
                    <small>Readiness</small>
                    <strong>{selected.readiness.ready ? "Ready" : "Needs work"}</strong>
                  </div>
                  <div>
                    <small>Version</small>
                    <strong>{selected.version}</strong>
                  </div>
                </div>
                <div className="readiness-list">
                  {selected.readiness.checks.map((check) => (
                    <div
                      key={check.code}
                      className={`readiness-item${check.passed ? " is-ready" : ""}`}
                    >
                      {check.passed ? (
                        <CircleCheck aria-hidden="true" />
                      ) : (
                        <AlertTriangle aria-hidden="true" />
                      )}
                      <div>
                        <strong>{check.code.replaceAll("_", " ")}</strong>
                        <div>{check.passed ? "Passed" : check.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="studio-notice">
                  <LockKeyhole size={16} aria-hidden="true" /> Selected assets remain exclusively
                  locked to this Drop. Removing an asset from an editable draft releases that lock.
                </p>
                <div className="studio-toolbar">
                  <button
                    type="button"
                    className="drop-button drop-button--secondary"
                    onClick={() => setStep(2)}
                    disabled={!editable}
                  >
                    Back to inventory
                  </button>
                  <button
                    type="button"
                    className="drop-button drop-button--primary"
                    onClick={submit}
                    disabled={!canSubmitDrop(selected) || mutation.isPending}
                  >
                    <Check size={16} /> Submit for review
                  </button>
                </div>
              </>
            )}
            {error ? (
              <p className="studio-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function CreateDraft({
  name,
  description,
  setName,
  setDescription,
  submit,
  pending,
}: {
  name: string;
  description: string;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  submit: (event: FormEvent) => void;
  pending: boolean;
}) {
  return (
    <form onSubmit={submit}>
      <div className="studio-heading">
        <div>
          <span className="drops-kicker">New release</span>
          <h2>Create a private draft</h2>
          <p>
            Start with the release story. Nothing becomes public until admin review and a separate
            publish action.
          </p>
        </div>
      </div>
      <div className="studio-form">
        <label className="studio-field">
          Drop name
          <input
            required
            minLength={3}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Vault Icons — Series One"
          />
        </label>
        <label className="studio-field">
          Release description
          <textarea
            required
            minLength={20}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explain the theme, the creator perspective, and what connects the vaulted collectibles."
          />
        </label>
      </div>
      <div className="studio-toolbar">
        <button className="drop-button drop-button--primary" type="submit" disabled={pending}>
          <Plus size={16} /> Create draft
        </button>
      </div>
    </form>
  );
}

function StateBadge({ drop }: { drop: DropView }) {
  return <span className="drop-status">{drop.state.replaceAll("_", " ")}</span>;
}

function messageFor(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The Drop could not be updated. Refresh and try again.";
}
