"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, MoreHorizontal, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import { approveSuggestion, rejectSuggestion, adminUpdateBottleFields, type EditableField } from "@/lib/suggestedEdits";
import { fetchRejectReasons, rejectImage, addRejectReason, type RejectReason } from "@/lib/imageReview";
import {
  fetchReviewQueue, fetchCaseFile, fetchNeighbours, fetchRecheckFunnel, wordDiff, verifyBottle, setTriage, splitOnAxis,
  searchBottles, mergeAsDuplicate, mergeAsVersion, deleteImpact, purgeBottle, GAP_LABEL,
  FORM_FIELD_ORDER, type QueueRow, type CaseFile, type Submission, type Neighbour, type FormField, type RecheckRow,
} from "@/lib/adminReview";

/**
 * Admin > Review (#130) — the one queue and the case file.
 *
 * Replaces Bottles / Variants / Images (2026-09-15). Brian's framing, which this screen follows
 * top to bottom: three kinds of clean-up happen to a bottle — is the edit good (submissions), is
 * this one bottle or several (architecture), can it stand on the shelf (image) — and then ONE act,
 * Verify, that marks the whole thing clean. Approving a submission never verifies anything; an
 * existing image is judged as part of Verify, not in a queue of its own; "this is really X" always
 * asks "exactly the same, or a version?" so child-vs-duplicate is an explicit call every time.
 */

const FIELD_LABEL: Record<FormField, string> = {
  name: "Name", distillery: "Distillery", category: "Category", style: "Style", volume: "Size",
  barcode: "Barcode", extras: "Extras", proof: "Proof", age: "Age", nose: "Nose", palate: "Palate", finish: "Finish",
};
const MULTILINE: FormField[] = ["nose", "palate", "finish", "extras"];

const AXES: { value: string; label: string }[] = [
  { value: "batch", label: "Batch" },
  { value: "release_year", label: "Release year" },
  { value: "rickhouse", label: "Rickhouse / floor" },
  { value: "barrel", label: "Barrel number" },
  { value: "custom", label: "Custom" },
];
const axisLabel = (a: string | null) => AXES.find((x) => x.value === a)?.label ?? a ?? "";

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

/* ========================================================================= */

export default function ReviewTab({ publicUserId, initialBottle }: { publicUserId: string; initialBottle?: string }) {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [funnel, setFunnel] = useState<RecheckRow[]>([]);
  const [showFunnel, setShowFunnel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // A push ("<bottle> was cleaned up") deep-links straight into that bottle's case file.
  const [openId, setOpenId] = useState<string | null>(initialBottle ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ rows, error }, f] = await Promise.all([fetchReviewQueue(), fetchRecheckFunnel()]);
    if (error) toast.error(`Could not load the queue: ${error}`);
    setQueue(rows);
    // the funnel is the long tail: leave out anything already in the live queue
    const live = new Set(rows.map((r) => r.bottleId));
    setFunnel(f.filter((r) => !live.has(r.bottleId)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((r) => r.name.toLowerCase().includes(q) || (r.distillery || "").toLowerCase().includes(q) || r.addedBy.toLowerCase().includes(q));
  }, [queue, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg pc-brass-text">Review</h2>
        <span className="text-xs text-cream-mute">{queue.length} bottle{queue.length === 1 ? "" : "s"} with something open</span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-cream-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the queue…" className="w-full rounded pl-9 pr-3 py-2 text-sm" />
      </div>

      {loading ? (
        <p className="text-xs text-cream-faint">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="pc-inset rounded-lg p-6 text-center text-sm text-cream-mute">
          {queue.length ? "Nothing matches." : "Nothing to review. Every bottle is verified and no edits are waiting."}
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.bottleId}>
              <button type="button" onClick={() => setOpenId(r.bottleId)} className="pc-leather w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left">
                <div className="w-9 h-12 shrink-0 flex items-end justify-center">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="max-h-12 max-w-9 object-contain" />
                  ) : <BottlePlaceholderImage className="w-7 h-11" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-cream truncate">{r.name}</div>
                  <div className="text-xs text-cream-mute truncate">{r.distillery || "—"} · {r.addedBy} · {ago(r.lastTouched)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.work.submissions > 0 && <Chip tone="brass">{r.work.submissions} submission{r.work.submissions === 1 ? "" : "s"}</Chip>}
                    {r.work.imageProposed && <Chip tone="brass">image proposed</Chip>}
                    {r.work.architecture && <Chip>architecture?</Chip>}
                    {r.work.imageState === "rejected" && <Chip tone="warn">image rejected</Chip>}
                    {r.work.imageState === "flagged" && <Chip tone="warn">image flagged</Chip>}
                    {r.work.imageState === "none" && <Chip>no image</Chip>}
                    {r.work.unverified && <Chip tone="unv">unverified</Chip>}
                    {r.gaps.length > 0 && <Chip>missing: {r.gaps.map((g) => GAP_LABEL[g] ?? g).join(" · ")}</Chip>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-cream-faint shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* the long-term funnel: verified or not, something is missing and nobody has looked in 6 months */}
      {!loading && funnel.length > 0 && (
        <div className="pt-2">
          <button type="button" onClick={() => setShowFunnel((v) => !v)} className="w-full flex items-center justify-between text-xs text-cream-mute py-2">
            <span>Recheck funnel · {funnel.length} bottle{funnel.length === 1 ? "" : "s"} with gaps nobody has looked at in 6 months</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showFunnel ? "rotate-90" : ""}`} />
          </button>
          {showFunnel && (
            <ul className="space-y-1">
              {funnel.filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase())).map((r) => (
                <li key={r.bottleId}>
                  <button type="button" onClick={() => setOpenId(r.bottleId)} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left pc-inset">
                    <span className="text-xs text-cream truncate flex-1">{r.name}</span>
                    <span className="text-[10px] text-cream-faint truncate">{r.gaps.map((g) => GAP_LABEL[g] ?? g).join(" · ")}</span>
                    <span className="text-[10px] text-cream-faint shrink-0">{r.dqCheckedAt ? ago(r.dqCheckedAt) : "never"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CaseFileSheet bottleId={openId} publicUserId={publicUserId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "brass" | "warn" | "unv" }) {
  const cls = tone === "brass" ? "pc-brass text-engrave" : tone === "warn" ? "border border-brass-line text-brass" : tone === "unv" ? "border border-unverified text-unverified" : "border border-edge text-cream-mute";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

/* ========================================================================= */

function CaseFileSheet({ bottleId, publicUserId, onClose, onChanged }: { bottleId: string | null; publicUserId: string; onClose: () => void; onChanged: () => void }) {
  const [file, setFile] = useState<CaseFile | null>(null);
  const [neighbours, setNeighbours] = useState<Neighbour[]>([]);
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const reload = useCallback(async () => {
    if (!bottleId) return;
    const { file: f, error } = await fetchCaseFile(bottleId);
    if (error || !f) { toast.error(error ?? "Could not open this bottle"); onClose(); return; }
    setFile(f);
  }, [bottleId, onClose]);

  useEffect(() => {
    setFile(null); setMenu(false);
    if (!bottleId) return;
    reload();
    fetchNeighbours(bottleId).then(setNeighbours);
    fetchRejectReasons().then(setReasons);
  }, [bottleId, reload]);

  const changed = async () => { await reload(); onChanged(); };

  const def = file?.variants.find((v) => v.isDefault) ?? null;
  const imageRejected = !!def && def.rejectReasonIds.length > 0 && !def.shelfReady;
  const imageFlagged = !!def?.flaggedAt && (!def.reviewedAt || def.flaggedAt > def.reviewedAt);
  const pendingCount = file?.submissions.reduce((n, s) => n + s.rows.length, 0) ?? 0;
  const architectureDone = !!file?.triage;
  const canVerify = !!file && pendingCount === 0 && architectureDone && !imageRejected && !file.verified;

  const doVerify = async () => {
    if (!file || !canVerify) return;
    setBusy(true);
    const r = await verifyBottle(file.bottleId);
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    logEvent({ eventType: "bottle_verified", surface: "admin_review", targetType: "bottle", targetId: file.bottleId, metadata: { variants: r.variantsVerified, shelf_ready: r.shelfReady } });
    notify({ kind: "bottle_verified", bottleId: file.bottleId }); // the human who added it hears it is on the shelf
    toast.success(`${file.name} verified${r.shelfReady ? " and on the shelf" : ""}.`);
    onChanged();
    onClose();
  };

  return (
    <Sheet open={!!bottleId} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent side="bottom" className="border-t border-brass-line h-[94vh] flex flex-col p-0">
        {!file ? (
          <div className="p-4 text-xs text-cream-faint">Loading…</div>
        ) : (
          <>
            {/* header */}
            <SheetHeader className="px-4 pt-4 pb-2 border-b border-brass-line">
              <div className="flex items-start gap-3">
                <div className="w-10 h-14 shrink-0 flex items-end justify-center">
                  {def?.frontimageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={def.frontimageUrl} alt="" className="max-h-14 max-w-10 object-contain" />
                  ) : <BottlePlaceholderImage className="w-8 h-12" />}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display pc-brass-text text-base leading-tight truncate">{file.name}</SheetTitle>
                  <div className="text-xs text-cream-mute truncate">{file.form.distillery || "—"}</div>
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {file.verified ? <Chip tone="brass">verified</Chip> : <Chip tone="unv">unverified</Chip>}
                    <Chip>added by {file.addedBy} · {ago(file.createdAt)}</Chip>
                    {file.gaps.length > 0 && <Chip>missing: {file.gaps.map((g) => GAP_LABEL[g] ?? g).join(" · ")}</Chip>}
                    {file.dqCheckedAt && <Chip>checked {ago(file.dqCheckedAt)} ago</Chip>}
                  </div>
                </div>
                <div className="relative">
                  <button type="button" aria-label="More" onClick={() => setMenu((m) => !m)} className="p-1 text-cream-mute"><MoreHorizontal className="w-5 h-5" /></button>
                  {menu && <DangerMenu file={file} onClose={() => setMenu(false)} onDone={() => { onChanged(); onClose(); }} />}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
              {/* 1. submissions */}
              <Section n={1} title="Submissions" hint={pendingCount ? `${file.submissions.length} waiting` : "nothing waiting"}>
                {file.submissions.length === 0 ? (
                  <p className="text-xs text-cream-faint">No edits proposed. Fix anything yourself below.</p>
                ) : (
                  file.submissions.map((s) => (
                    <SubmissionCard key={s.group} sub={s} file={file} neighbours={neighbours} publicUserId={publicUserId} onDone={changed} />
                  ))
                )}
              </Section>

              {/* 2. the data (editable) */}
              <Section n={2} title="The data" hint="what it reads right now">
                <FieldEditor file={file} publicUserId={publicUserId} onSaved={changed} />
              </Section>

              {/* 3. architecture */}
              <Section n={3} title="What is this record?" hint={architectureDone ? "answered" : "needs an answer"}>
                <Architecture file={file} publicUserId={publicUserId} onDone={changed} onGone={() => { onChanged(); onClose(); }} />
              </Section>

              {/* 4. shelf */}
              <Section n={4} title="On the shelf" hint={!def?.frontimageUrl ? "no image" : imageRejected ? "rejected" : imageFlagged ? "flagged by a user" : def?.shelfReady ? "approved" : "unreviewed"}>
                <ShelfCheck file={file} neighbours={neighbours} reasons={reasons} setReasons={setReasons} publicUserId={publicUserId} onDone={changed} />
              </Section>

              <JunkRow file={file} onDone={() => { onChanged(); onClose(); }} />
              <div className="h-24" />
            </div>

            {/* sticky verify bar */}
            <div className="border-t border-brass-line pc-wood px-4 py-3 flex items-center gap-3">
              <div className="text-[11px] text-cream-mute leading-snug flex-1">
                <Tick ok={pendingCount === 0}>{pendingCount === 0 ? "no submissions waiting" : `${pendingCount} change${pendingCount === 1 ? "" : "s"} to decide`}</Tick>
                <Tick ok={architectureDone}>{architectureDone ? (file.triage === "split" ? `parent · ${axisLabel(file.axis)}` : file.triage === "single" ? "standalone" : "needs merge") : "architecture not answered"}</Tick>
                <Tick ok={!imageRejected} warn={!def?.frontimageUrl || imageFlagged}>{!def?.frontimageUrl ? "no image (verify anyway)" : imageRejected ? "image rejected — blocks verify" : imageFlagged ? "image flagged — look before you verify" : def?.shelfReady ? "image on the shelf" : "image will go on the shelf"}</Tick>
              </div>
              <div className="text-[10px] text-cream-faint shrink-0 max-w-[7rem] leading-tight">
                {file.gaps.length > 0 ? `Still missing ${file.gaps.map((g) => GAP_LABEL[g] ?? g).join(", ")} - verify if it's full enough; the funnel keeps chasing the rest.` : "Complete."}
              </div>
              <Button variant="brass" disabled={!canVerify || busy} onClick={doVerify} className="shrink-0">
                {file.verified ? "Verified" : busy ? "Verifying…" : "Verify"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="pc-brass-text font-display text-sm">{n}</span>
        <h3 className="font-display text-sm text-cream">{title}</h3>
        {hint && <span className="text-[11px] text-cream-faint">· {hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Tick({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {ok ? <Check className={`w-3 h-3 ${warn ? "text-unverified" : "text-brass"}`} /> : <X className="w-3 h-3 text-unverified" />}
      <span className={ok && !warn ? "" : "text-cream"}>{children}</span>
    </div>
  );
}

/* ========================================================================= */
/* 1. a submission: the full form as it would read, changed fields lit        */

function SubmissionCard({ sub, file, neighbours, publicUserId, onDone }: { sub: Submission; file: CaseFile; neighbours: Neighbour[]; publicUserId: string; onDone: () => Promise<void> }) {
  const [held, setHeld] = useState<Set<string>>(new Set()); // rows unticked = not approved this pass
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const changedFields = new Map(sub.rows.filter((r) => !r.structural && !r.image).map((r) => [r.field, r]));
  const imageRows = sub.rows.filter((r) => r.image);
  const structural = sub.rows.filter((r) => r.structural);
  const toApprove = sub.rows.filter((r) => !held.has(r.id));

  const approveAll = async () => {
    if (!toApprove.length) return;
    setBusy("approve");
    let failed = 0;
    for (const r of toApprove) {
      const res = await approveSuggestion({ id: r.id, bottleId: file.bottleId, bottleName: file.name, variantId: r.variantId, targetTable: r.targetTable, field: r.field, oldValue: r.oldValue, newValue: r.newValue, submittedByName: sub.by, createdAt: sub.at }, note, publicUserId);
      if (res.error) { failed++; toast.error(`${r.label}: ${res.error}`); }
    }
    setBusy(null);
    logEvent({ eventType: "submission_reviewed", surface: "admin_review", targetType: "submission_group", targetId: sub.group, metadata: { approved: toApprove.length - failed, held: held.size, by: sub.byId } });
    if (!failed) toast.success(`Approved ${toApprove.length} change${toApprove.length === 1 ? "" : "s"} from ${sub.by}.`);
    // Held-back rows stay pending, so the push says "N approved" only for what was decided.
    notify({ kind: "edit_reviewed", submissionGroup: sub.group, decision: held.size ? "partial" : "approved", note });
    await onDone();
  };
  const rejectAll = async () => {
    setBusy("reject");
    for (const r of sub.rows) await rejectSuggestion(r.id, note, publicUserId);
    setBusy(null);
    logEvent({ eventType: "submission_reviewed", surface: "admin_review", targetType: "submission_group", targetId: sub.group, metadata: { rejected: sub.rows.length, by: sub.byId } });
    toast.success(`Rejected ${sub.by}'s submission.`);
    notify({ kind: "edit_reviewed", submissionGroup: sub.group, decision: "rejected", note });
    await onDone();
  };
  const toggle = (id: string) => setHeld((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="pc-leather rounded-lg p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm text-cream">{sub.by} <span className="text-cream-faint text-xs">· {ago(sub.at)} · {sub.rows.length} change{sub.rows.length === 1 ? "" : "s"}</span></div>
      </div>

      {/* the form after the change; changed fields carry a tick */}
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 text-xs">
        {FORM_FIELD_ORDER.map((f) => {
          const r = changedFields.get(f);
          const current = file.form[f];
          if (!r) return (
            <FormRow key={f} label={FIELD_LABEL[f]} muted>
              <span className="text-cream-mute whitespace-pre-wrap">{current || <span className="text-cream-faint">—</span>}</span>
            </FormRow>
          );
          const on = !held.has(r.id);
          return (
            <FormRow key={f} label={FIELD_LABEL[f]} tick={<TickBox on={on} onClick={() => toggle(r.id)} />}>
              <Diff oldText={r.oldValue ?? current} newText={r.newValue} dim={!on} />
            </FormRow>
          );
        })}
        {/* fields outside the form (e.g. a variant-only column) still show */}
        {sub.rows.filter((r) => !r.structural && !r.image && !(FORM_FIELD_ORDER as string[]).includes(r.field)).map((r) => (
          <FormRow key={r.id} label={r.label} tick={<TickBox on={!held.has(r.id)} onClick={() => toggle(r.id)} />}>
            <Diff oldText={r.oldValue} newText={r.newValue} dim={held.has(r.id)} />
          </FormRow>
        ))}
      </dl>

      {imageRows.map((r) => (
        <div key={r.id} className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-cream">
            <TickBox on={!held.has(r.id)} onClick={() => toggle(r.id)} />
            {r.field === "backimage_url" ? "Back image" : "Front image"} — current vs proposed
          </div>
          <ShelfRow bottles={[
            ...(neighbours[0] ? [{ key: "n0", url: neighbours[0].imageUrl, h: neighbours[0].heightMm, label: neighbours[0].name, dim: true }] : []),
            { key: "cur", url: r.oldValue, h: file.variants.find((v) => v.isDefault)?.heightMm ?? null, label: "now" },
            { key: "new", url: r.newValue, h: file.variants.find((v) => v.isDefault)?.heightMm ?? null, label: "proposed", hi: true },
            ...(neighbours[1] ? [{ key: "n1", url: neighbours[1].imageUrl, h: neighbours[1].heightMm, label: neighbours[1].name, dim: true }] : []),
          ]} />
        </div>
      ))}

      {structural.map((r) => (
        <div key={r.id} className="pc-inset rounded p-2 text-xs text-cream flex items-start gap-2">
          <TickBox on={!held.has(r.id)} onClick={() => toggle(r.id)} />
          <div>
            <div className="pc-brass-text">{r.field === "__merge__" ? "Suggested merge" : "Suggested delete"}</div>
            <div className="text-cream-mute">{r.field === "__merge__" ? `Fold this bottle into ${r.newValue}` : r.newValue}</div>
            <div className="text-cream-faint">Applies a guarded delete; blocked if anyone owns or has tasted it.</div>
          </div>
        </div>
      ))}

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the submitter (optional)" className="w-full rounded px-3 py-1.5 text-xs" />
      <div className="flex gap-2">
        <Button variant="outline" onClick={rejectAll} disabled={!!busy} className="flex-1">{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
        <Button variant="brass" onClick={approveAll} disabled={!!busy || !toApprove.length} className="flex-1">
          {busy === "approve" ? "Approving…" : held.size ? `Approve ${toApprove.length} of ${sub.rows.length}` : "Approve all"}
        </Button>
      </div>
    </div>
  );
}

function FormRow({ label, muted, tick, children }: { label: string; muted?: boolean; tick?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <dt className={`flex items-center gap-1.5 ${muted ? "text-cream-faint" : "text-cream"}`}>{tick}{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function TickBox({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={on ? "Hold this change back" : "Include this change"} className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${on ? "pc-brass border-brass" : "border-edge"}`}>
      {on && <Check className="w-3 h-3 text-engrave" />}
    </button>
  );
}

function Diff({ oldText, newText, dim }: { oldText: string | null; newText: string | null; dim?: boolean }) {
  const tokens = wordDiff(oldText, newText);
  return (
    <span className={`whitespace-pre-wrap ${dim ? "opacity-40" : ""}`}>
      {tokens.map((t, i) =>
        t.kind === "same" ? <span key={i} className="text-cream">{t.text}</span>
        : t.kind === "del" ? <del key={i} className="text-red-400/90 bg-red-900/30 rounded-sm px-0.5">{t.text}</del>
        : <ins key={i} className="no-underline text-green-300 bg-green-900/40 rounded-sm px-0.5">{t.text}</ins>
      )}
      {tokens.length === 0 && <span className="text-cream-faint">—</span>}
    </span>
  );
}

/* ========================================================================= */
/* 2. the editable form                                                       */

function FieldEditor({ file, publicUserId, onSaved }: { file: CaseFile; publicUserId: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<Partial<Record<FormField, string>>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft({}), [file.bottleId, file.form]);
  const dirty = Object.keys(draft).some((k) => draft[k as FormField] !== undefined && draft[k as FormField] !== file.form[k as FormField]);

  const save = async () => {
    const values: Partial<Record<EditableField, string | null>> = {};
    for (const [k, v] of Object.entries(draft)) if (v !== undefined && v !== file.form[k as FormField]) values[k as EditableField] = v === "" ? null : v;
    if (!Object.keys(values).length) return;
    setSaving(true);
    const { error } = await adminUpdateBottleFields({ bottleId: file.bottleId, defaultVariantId: file.defaultVariantId, values, adminUserId: publicUserId });
    setSaving(false);
    if (error) { toast.error(`Save failed: ${error}`); return; }
    logEvent({ eventType: "admin_bottle_edit", surface: "admin_review", targetType: "bottle", targetId: file.bottleId, metadata: { fields: Object.keys(values) } });
    toast.success("Saved.");
    await onSaved();
  };

  return (
    <div className="pc-leather rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {FORM_FIELD_ORDER.map((f) => {
          const multi = MULTILINE.includes(f);
          const val = draft[f] ?? file.form[f];
          return (
            <label key={f} className={`text-[11px] text-cream-mute ${multi ? "col-span-2" : ""}`}>
              {FIELD_LABEL[f]}
              {multi ? (
                <textarea value={val} rows={2} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} className="mt-0.5 w-full rounded px-2 py-1 text-xs" />
              ) : (
                <input value={val} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} className="mt-0.5 w-full rounded px-2 py-1 text-xs" />
              )}
            </label>
          );
        })}
      </div>
      {dirty && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setDraft({})} disabled={saving}>Discard</Button>
          <Button variant="brass" size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/* 3. architecture: standalone / parent / this is really X                    */

type Answer = "single" | "parent" | "other";

function Architecture({ file, publicUserId, onDone, onGone }: { file: CaseFile; publicUserId: string; onDone: () => Promise<void>; onGone: () => void }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [axis, setAxis] = useState<string>(file.axis ?? "batch");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchBottles>>>([]);
  const [target, setTarget] = useState<(typeof hits)[number] | null>(null);
  const [kind, setKind] = useState<"same" | "version" | null>(null);
  const [axisValue, setAxisValue] = useState("");
  const [impact, setImpact] = useState<{ total: number; detail: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = file.variants.filter((v) => !v.isDefault);

  useEffect(() => { setAnswer(null); setTarget(null); setKind(null); setQ(""); setHits([]); setAxisValue(""); setAxis(file.axis ?? "batch"); }, [file.bottleId, file.triage, file.axis]);
  useEffect(() => { const t = setTimeout(() => searchBottles(q, file.bottleId).then(setHits), 200); return () => clearTimeout(t); }, [q, file.bottleId]);
  useEffect(() => { if (answer === "other") deleteImpact(file.bottleId).then(setImpact); }, [answer, file.bottleId]);

  const label = (v: CaseFile["variants"][number]) => v.storePickName ? `Store pick · ${v.storePickName}` : v.batch ? `${axisLabel(file.axis) || "Batch"} ${v.batch}` : v.releaseYear ? String(v.releaseYear) : "version";

  const current = file.triage && (
    <div className="pc-inset rounded p-2 text-xs text-cream flex items-center justify-between gap-2">
      <span>
        {file.triage === "single" && "Standalone — one bottle, its own score."}
        {file.triage === "split" && <>Parent — versions differ by <span className="pc-brass-text">{axisLabel(file.axis)}</span>.</>}
        {file.triage === "needs_merge" && "Marked as needing a merge."}
      </span>
      <button type="button" onClick={() => setAnswer("single")} className="text-[11px] text-brass underline shrink-0">change</button>
    </div>
  );

  const runSingle = async () => { setBusy(true); const r = await setTriage(file.bottleId, "single", publicUserId); setBusy(false); if (r.error) return toast.error(r.error); logEvent({ eventType: "variant_triage", surface: "admin_review", metadata: { bottleId: file.bottleId, triage: "single" } }); await onDone(); };
  const runParent = async () => { setBusy(true); const r = file.axis === axis && file.triage === "split" ? {} : await splitOnAxis(file.bottleId, axis, publicUserId); setBusy(false); if (r.error) return toast.error(r.error); logEvent({ eventType: "variant_split", surface: "admin_review", metadata: { bottleId: file.bottleId, axis } }); await onDone(); };
  const runOther = async () => {
    if (!target || !kind) return;
    setBusy(true);
    const r = kind === "same"
      ? await mergeAsDuplicate(file.bottleId, file.name, target.id)
      : await mergeAsVersion({ sourceId: file.bottleId, sourceName: file.name, targetId: target.id, targetAxis: target.axis, axis: target.axis ?? axis, axisValue, adminId: publicUserId });
    setBusy(false);
    if (r.error) return toast.error(r.error);
    logEvent({ eventType: kind === "same" ? "bottle_merge" : "bottle_reparent", surface: "admin_review", metadata: { source: file.bottleId, target: target.id, axisValue } });
    toast.success(r.summary ?? "Done.");
    onGone();
  };

  return (
    <div className="space-y-2">
      {answer === null && current}
      {(answer !== null || !file.triage) && (
        <div className="pc-leather rounded-lg p-3 space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-1">
            {([["single", "Standalone"], ["parent", "Parent"], ["other", "This is really…"]] as [Answer, string][]).map(([a, l]) => (
              <button key={a} type="button" onClick={() => setAnswer(a)} className={`rounded px-2 py-2 border ${answer === a ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>{l}</button>
            ))}
          </div>

          {answer === "single" && (
            <div className="space-y-2">
              <p className="text-cream-mute">One bottle, no versions, its own Elo.{versions.length ? ` It currently has ${versions.length} version${versions.length === 1 ? "" : "s"} — they stay, but nothing new will be filed under it as a version.` : ""}</p>
              <Button variant="brass" size="sm" onClick={runSingle} disabled={busy}>Mark standalone</Button>
            </div>
          )}

          {answer === "parent" && (
            <div className="space-y-2">
              <p className="text-cream-mute">It has versions. What makes them different?</p>
              <div className="flex flex-wrap gap-1">
                {AXES.map((a) => <button key={a.value} type="button" onClick={() => setAxis(a.value)} className={`rounded-full px-2 py-1 border ${axis === a.value ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>{a.label}</button>)}
              </div>
              <Button variant="brass" size="sm" onClick={runParent} disabled={busy}>Parent · {axisLabel(axis)}</Button>
            </div>
          )}

          {answer === "other" && (
            <div className="space-y-2">
              {!target ? (
                <>
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which bottle is it really?" className="w-full rounded px-3 py-1.5 text-xs" />
                  <ul className="space-y-1">
                    {hits.map((h) => (
                      <li key={h.id}><button type="button" onClick={() => setTarget(h)} className="w-full text-left pc-inset rounded px-2 py-1.5 text-cream">{h.name} <span className="text-cream-faint">· {h.distillery || "—"}{h.axis ? ` · parent (${axisLabel(h.axis)})` : ""}{!h.verified ? " · unverified" : ""}</span></button></li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <div className="pc-inset rounded px-2 py-1.5 text-cream flex justify-between"><span>{target.name}</span><button type="button" onClick={() => { setTarget(null); setKind(null); }} className="text-brass underline">change</button></div>
                  <p className="text-cream">Exactly the same bottle, or a version of it?</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => setKind("same")} className={`rounded px-2 py-2 border ${kind === "same" ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>Exactly the same</button>
                    <button type="button" onClick={() => setKind("version")} className={`rounded px-2 py-2 border ${kind === "version" ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>A version of it</button>
                  </div>
                  {kind === "same" && <p className="text-cream-mute">Everything behind this record (bars, tastings, ratings, wishlists) moves to <span className="text-cream">{target.name}</span>, this record goes away, and every score is rebuilt.</p>}
                  {kind === "version" && (
                    <div className="space-y-1">
                      {!target.axis && (
                        <>
                          <p className="text-cream-mute">{target.name} isn&apos;t a parent yet. What will its versions differ by?</p>
                          <div className="flex flex-wrap gap-1">
                            {AXES.map((a) => <button key={a.value} type="button" onClick={() => setAxis(a.value)} className={`rounded-full px-2 py-1 border ${axis === a.value ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>{a.label}</button>)}
                          </div>
                        </>
                      )}
                      <input value={axisValue} onChange={(e) => setAxisValue(e.target.value)} placeholder={`Which ${axisLabel(target.axis ?? axis).toLowerCase()} is this? (e.g. 15, 2024, A)`} className="w-full rounded px-3 py-1.5 text-xs" />
                      <p className="text-cream-mute">This record rolls under {target.name} as that version; its history moves with it; scores rebuild.</p>
                    </div>
                  )}
                  {impact && impact.total > 0 && (
                    <p className="text-[11px] text-unverified">Heads up: this record is referenced {impact.total}× ({Object.entries(impact.detail).filter(([k, v]) => k !== "usernames" && k !== "versions" && Number(v) > 0).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}). All of it moves across.</p>
                  )}
                  <Button variant="brass" size="sm" onClick={runOther} disabled={busy || !kind || (kind === "version" && !axisValue.trim())}>
                    {busy ? "Working…" : kind === "same" ? `Merge into ${target.name}` : kind === "version" ? `Roll under ${target.name}` : "Choose one"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {versions.length > 0 && (
        <ul className="pc-inset rounded p-2 space-y-1 text-xs">
          <li className="text-cream-faint">{versions.length} version{versions.length === 1 ? "" : "s"}{file.axis ? ` · by ${axisLabel(file.axis).toLowerCase()}` : ""}</li>
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between text-cream">
              <span>{label(v)}{v.proof ? ` · ${v.proof}°` : ""}{v.age ? ` · ${v.age}` : ""}</span>
              {v.verified ? <Chip tone="brass">verified</Chip> : <Chip tone="unv">unverified</Chip>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ========================================================================= */
/* 4. the shelf: the current image between two real neighbours                */

function ShelfCheck({ file, neighbours, reasons, setReasons, publicUserId, onDone }: { file: CaseFile; neighbours: Neighbour[]; reasons: RejectReason[]; setReasons: (r: RejectReason[]) => void; publicUserId: string; onDone: () => Promise<void> }) {
  const def = file.variants.find((v) => v.isDefault) ?? null;
  const [picked, setPicked] = useState<Set<string>>(new Set(def?.rejectReasonIds ?? []));
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(new Set(def?.rejectReasonIds ?? [])), [def?.id, def?.rejectReasonIds]);
  if (!def) return <p className="text-xs text-cream-faint">No default version, so no shelf image.</p>;
  const rejected = def.rejectReasonIds.length > 0 && !def.shelfReady;

  const reject = async () => {
    if (!def.frontimageUrl) return;
    setBusy(true);
    let ids = [...picked];
    if (other.trim()) { const r = await addRejectReason(other.trim(), publicUserId); if (r) { ids.push(r.id); setReasons([...reasons, r]); } setOther(""); }
    if (!ids.length) { setBusy(false); return toast.error("Pick a reason so the bot knows what to fix."); }
    ids = [...new Set(ids)];
    const { error } = await rejectImage(def.id, publicUserId, ids);
    setBusy(false);
    if (error) return toast.error(error);
    logEvent({ eventType: "image_review", surface: "admin_review", targetType: "variant", targetId: def.id, metadata: { decision: "rejected", reasons: ids } });
    toast.success("Image rejected — it's a work order now.");
    await onDone();
  };
  const clearRejection = async () => {
    setBusy(true);
    const { error } = await supabase.from("bottle_variants").update({ image_reject_reason_ids: [], image_review_note: null, image_reviewed_at: new Date().toISOString(), image_reviewed_by: publicUserId }).eq("id", def.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await onDone();
  };

  return (
    <div className="space-y-2">
      <ShelfRow bottles={[
        ...(neighbours[0] ? [{ key: "n0", url: neighbours[0].imageUrl, h: neighbours[0].heightMm, label: neighbours[0].name, dim: true }] : []),
        { key: "me", url: def.frontimageUrl, h: def.heightMm, label: file.name, hi: true },
        ...(neighbours[1] ? [{ key: "n1", url: neighbours[1].imageUrl, h: neighbours[1].heightMm, label: neighbours[1].name, dim: true }] : []),
      ]} />
      {!def.frontimageUrl ? (
        <p className="text-xs text-cream-faint">No image yet. Verify can go ahead; the clean-up bot will find one.</p>
      ) : (
        <div className="pc-leather rounded-lg p-3 space-y-2 text-xs">
          {def.flagNote && <p className="text-unverified">A user flagged this: “{def.flagNote}”</p>}
          <p className="text-cream-mute">{rejected ? "Rejected — the bot will look for a better shot. Verify is blocked until it's replaced or you clear this." : "Looks right? Verify puts it on the shelf. Not right? Say why:"}</p>
          <div className="flex flex-wrap gap-1">
            {reasons.map((r) => (
              <button key={r.id} type="button" onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className={`rounded-full px-2 py-1 border ${picked.has(r.id) ? "pc-brass text-engrave border-brass" : "border-brass-line text-cream"}`}>{r.label}</button>
            ))}
          </div>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Another reason…" className="w-full rounded px-3 py-1.5 text-xs" />
          <div className="flex gap-2">
            {rejected && <Button variant="outline" size="sm" onClick={clearRejection} disabled={busy}>Clear rejection</Button>}
            <Button variant="outline" size="sm" onClick={reject} disabled={busy || (!picked.size && !other.trim())}>{busy ? "…" : rejected ? "Update reasons" : "Reject image"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The Home shelf's box (same classes, same geometry) with a handful of bottles on it. */
function ShelfRow({ bottles }: { bottles: { key: string; url: string | null; h: number | null; label: string; dim?: boolean; hi?: boolean }[] }) {
  const pct = (h: number | null) => Math.max(40, Math.min(96, h ? (h / 305) * 86 : 84));
  return (
    <div className="border border-brass-line rounded-lg overflow-hidden">
      <div className="pc-shelf pc-bg-checker" style={{ borderBottom: "none", height: 190 }}>
        <div className="pc-face pc-back" />
        <div className="pc-face pc-top" />
        <div className="pc-face pc-deck" />
        <div className="pc-run">
          {bottles.map((b) => (
            <div key={b.key} className={`pc-slot ${b.dim ? "opacity-60" : ""}`} style={{ height: `${pct(b.h)}%`, outline: b.hi ? "1px dashed var(--color-brass)" : undefined, outlineOffset: 4 }} title={b.label}>
              {b.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.url} alt={b.label} style={{ objectFit: "contain", objectPosition: "bottom" }} />
              ) : (
                <svg viewBox="0 0 58 180" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                  <path d="M23 7h12v27c0 8 13 12 13 27v102c0 7-4 10-10 10H20c-6 0-10-3-10-10V61c0-15 13-19 13-27z" fill="#241d17" stroke="#8a6a2a" strokeWidth="1.4" strokeDasharray="5 3" />
                  <text x="29" y="104" textAnchor="middle" fontSize="9" fill="#d8bf9c">no image</text>
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-around text-[10px] text-cream-faint px-2 py-1 bg-panel">
        {bottles.map((b) => <span key={b.key} className={`truncate max-w-[25%] ${b.hi ? "text-brass" : ""}`}>{b.label}</span>)}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* junk: an erroneous add (a bug, a bad search) that nobody has actually used  */

/**
 * Brian (2026-09-20): most bad bottles are not real-world mistakes, they are bugs or bad
 * searching at add time, and the delete behind the "…" menu is the wrong shape for that: the
 * moment a bottle is added it sits in the adder's bar with a feed post, so the menu says
 * "referenced 2x, type the name". This row is the one-tap version, and it stays honest about
 * when it may not be used: anything tasted, poured, emptied or star-rated is real usage and
 * goes through the typed purge instead. The adder is not told; it just vanishes.
 */
const USAGE_KEYS = ["tasted", "blind_tastings", "head_to_head_pairs", "pours", "emptied", "star_ratings"] as const;

function JunkRow({ file, onDone }: { file: CaseFile; onDone: () => void }) {
  const [impact, setImpact] = useState<{ total: number; detail: Record<string, number> } | null>(null);
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setArm(false); deleteImpact(file.bottleId).then(setImpact); }, [file.bottleId]);

  const used = impact ? USAGE_KEYS.reduce((n, k) => n + (Number(impact.detail[k]) || 0), 0) : 0;
  const bars = Number(impact?.detail.in_bars) || 0;

  const junk = async () => {
    setBusy(true);
    // purge_bottle wants the name typed; for junk the row itself supplies it. The guard here is
    // the two taps plus the usage check above.
    const r = await purgeBottle(file.bottleId, file.name);
    setBusy(false);
    if (r.error) return toast.error(r.error);
    logEvent({ eventType: "bottle_junked", surface: "admin_review", targetType: "bottle", targetId: file.bottleId, metadata: { name: file.name, added_by: file.addedBy, impact: impact?.detail } });
    toast.success(`${file.name} is gone.`);
    onDone();
  };

  if (!impact) return null;
  return (
    <div className="pt-3 border-t border-brass-line text-xs">
      {used > 0 ? (
        <p className="text-cream-faint">Someone has tasted, poured or rated this, so it is not junk. Use the … menu to purge it, name typed.</p>
      ) : !arm ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-cream-faint">Not a real bottle? A bug or a bad search at add time.</p>
          <Button variant="outline" size="sm" onClick={() => setArm(true)} className="shrink-0">Junk — delete</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-cream-mute">Delete <span className="text-cream">{file.name}</span>?{bars > 0 ? ` Removes it from ${bars} bar${bars === 1 ? "" : "s"}.` : ""} Nobody is told.</p>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setArm(false)} disabled={busy}>Keep</Button>
            <Button variant="brass" size="sm" onClick={junk} disabled={busy}>{busy ? "…" : "Delete"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/* the "…" menu: delete / purge                                               */

function DangerMenu({ file, onClose, onDone }: { file: CaseFile; onClose: () => void; onDone: () => void }) {
  const [impact, setImpact] = useState<{ total: number; detail: Record<string, number> } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { deleteImpact(file.bottleId).then(setImpact); }, [file.bottleId]);

  const plainDelete = async () => {
    setBusy(true);
    const { error: vErr } = await supabase.from("bottle_variants").delete().eq("bottles_id", file.bottleId);
    if (vErr) { setBusy(false); return toast.error(vErr.message); }
    const { error } = await supabase.from("bottles").delete().eq("id", file.bottleId);
    setBusy(false);
    if (error) return toast.error(error.message);
    logEvent({ eventType: "bottle_delete", surface: "admin_review", targetType: "bottle", targetId: file.bottleId });
    toast.success(`Deleted ${file.name}.`);
    onDone();
  };
  const purge = async () => {
    setBusy(true);
    const r = await purgeBottle(file.bottleId, confirm);
    setBusy(false);
    if (r.error) return toast.error(r.error);
    logEvent({ eventType: "bottle_purge", surface: "admin_review", targetType: "bottle", targetId: file.bottleId, metadata: { impact: impact?.detail } });
    toast.success(`Purged ${file.name}. Rebuilt every score from the ${r.sessionsReplayed} remaining tastings.`);
    onDone();
  };

  return (
    <div className="absolute right-0 top-8 z-20 w-72 pc-leather rounded-lg p-3 text-xs space-y-2 shadow-lg">
      <div className="flex justify-between"><span className="pc-brass-text">Remove this bottle</span><button type="button" onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-cream-faint" /></button></div>
      {!impact ? <p className="text-cream-faint">Checking what it touches…</p> : impact.total === 0 ? (
        <>
          <p className="text-cream-mute">Nobody owns, tasted or rated it. It can just go.</p>
          <Button variant="outline" size="sm" onClick={plainDelete} disabled={busy}>{busy ? "…" : "Delete"}</Button>
        </>
      ) : (
        <>
          <p className="text-cream-mute">It is referenced {impact.total}×: {Object.entries(impact.detail).filter(([k, v]) => k !== "usernames" && k !== "versions" && Number(v) > 0).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}. Purging removes all of it and rebuilds every score. Type the name to confirm.</p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={file.name} className="w-full rounded px-2 py-1 text-xs" />
          <Button variant="outline" size="sm" onClick={purge} disabled={busy || confirm !== file.name}>{busy ? "…" : "Purge everything"}</Button>
        </>
      )}
    </div>
  );
}
