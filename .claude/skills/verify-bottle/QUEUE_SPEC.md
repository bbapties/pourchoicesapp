# Suggested-edits queue — enhancements needed (Grok / code lane)

The `verify-bottle` skill (data lane) files bottle corrections as **pending `suggested_edits`** for Brian to review. The Phase-7.8 pipeline (`src/lib/suggestedEdits.ts` + `src/app/admin/BottlesTab.tsx`) already handles the 14 editable fields. Two gaps remain before the review flow is complete. Both are additive; snapshot before any migration; ask Brian before schema changes.

## 1. Make `barcode` and `extras` first-class editable fields
Today `EDITABLE_FIELDS` omits them, so they show with raw labels and no coercion.
- Add `barcode` (identity → `bottles`) and `extras` (identity → `bottles`) to `EditableField`, `FIELD_LEVEL`, `EDITABLE_FIELDS`, and `fieldLabel` ("Barcode", "Extras / details").
- `coerce`: `barcode` → trimmed string (validate 12/13-digit numeric UPC-A/EAN-13 + check digit; reject otherwise). `extras` → JSON text passthrough (validate it parses).
- Admin queue: render old→new for both (extras may be long — show diff-friendly).

## 2. Support "suggested delete/merge" rows
`verify-bottle` encodes structural ops as `suggested_edits` rows so they ride the same review queue:
- **Merge:** `field='__merge__'`, `bottle_id`= loser, `old_value`= loser id, `new_value`= keeper id.
- **Delete:** `field='__delete__'`, `bottle_id`= row to remove, `new_value`= reason.

Needed:
- **Submit/approve handlers must special-case `field LIKE '\_\_%'`** — do NOT run the column `UPDATE`/`coerce` path on them.
- **Approve `__merge__`:** reassign references from loser→keeper (`user_bottles`, `tasting_details/results`, `suggested_edits`, backfilled `events` with `target_id`= loser variants), then delete loser bottle (variants CASCADE). Prefer additive/guarded; snapshot first.
- **Approve `__delete__`:** guarded hard-delete of the row (this is the sanctioned exception to "no hard-deletes" — a reviewed, approved catalog-cleanup delete).
- **Admin UI:** label these distinctly ("Suggested merge → <keeper name>", "Suggested delete — <reason>") with a clear confirm, since they're destructive on approve.

### Cleaner alternative (optional, if you prefer schema over sentinels)
Add an additive `op text NOT NULL DEFAULT 'field_update'` column to `suggested_edits` (`CHECK op IN ('field_update','delete','merge')`) and a nullable `merge_target_id uuid`, instead of overloading `field`. If you go this route, tell the data lane so `verify-bottle` emits the new shape.

## Coordination
The data lane will emit merge/delete + barcode/extras suggestions in the sentinel encoding above by default. If you implement the schema alternative, ping so the skill switches encoding. Nothing here blocks the 14 already-editable fields — those are reviewable today.
