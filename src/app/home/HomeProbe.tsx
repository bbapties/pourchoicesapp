"use client";

import { useEffect, useState } from "react";
import { SHELVES, SHELF_PAGE_SIZE, type ShelfBottle, type ShelfId } from "@/lib/shelves";

/**
 * #85 — the data probe for the Home screen ("The Cabinet", #82).
 *
 * DELIBERATELY NOT THE DESIGN. This renders the shelf registry's output as plain lists so the
 * queries, the paging cursor, the status light values and the image states can be checked on a
 * real phone against prod data before a single pixel of the cabinet exists. #86 replaces it.
 *
 * The route is reachable by URL and is NOT in the bottom nav — that is the whole build strategy
 * (#82): every step ships to prod and gets tested live without changing anything for any user,
 * and the nav switch (#91) becomes one small last commit instead of a big bang.
 */

type Loaded = { bottles: ShelfBottle[]; cursor: string | null; done: boolean; loading: boolean };

const EMPTY: Loaded = { bottles: [], cursor: null, done: false, loading: false };

export default function HomeProbe({ viewerId }: { viewerId: string }) {
  const [state, setState] = useState<Record<ShelfId, Loaded>>({
    mybar: EMPTY,
    social: EMPTY,
    verified: EMPTY,
  });

  async function loadMore(id: ShelfId) {
    const shelf = SHELVES.find((s) => s.id === id);
    if (!shelf) return;
    const cur = state[id];
    if (cur.loading || cur.done) return;

    setState((s) => ({ ...s, [id]: { ...s[id], loading: true } }));
    const page = await shelf.fetchPage({ viewerId, cursor: cur.cursor });
    setState((s) => ({
      ...s,
      [id]: {
        bottles: [...s[id].bottles, ...page.bottles],
        cursor: page.nextCursor,
        done: page.nextCursor === null,
        loading: false,
      },
    }));
  }

  // First page of every shelf on mount.
  useEffect(() => {
    SHELVES.forEach((s) => loadMore(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: "20px 16px 90px", fontFamily: "system-ui, sans-serif", color: "#e9e9ec" }}>
      <p style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#6a6a73", margin: 0 }}>
        Home · #85 data probe
      </p>
      <h1 style={{ fontSize: 22, margin: "4px 0 2px" }}>The Cabinet</h1>
      <p style={{ fontSize: 13, color: "#9a9aa2", margin: "0 0 22px", lineHeight: 1.55 }}>
        Shelf queries only — no cabinet yet. Page size {SHELF_PAGE_SIZE}.
      </p>

      {SHELVES.map((shelf) => {
        const s = state[shelf.id];
        const ready = s.bottles.filter((b) => b.imageState === "ready").length;
        const missing = s.bottles.filter((b) => b.imageState === "missing").length;
        return (
          <section key={shelf.id} style={{ marginBottom: 30 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>{shelf.label}</h2>
              <span style={{ fontSize: 11, color: "#6a6a73" }}>
                plate → {shelf.href} · {s.bottles.length} loaded
                {s.done ? " · end of run" : ""}
              </span>
            </div>
            <p style={{ fontSize: 11, color: "#6a6a73", margin: "4px 0 8px" }}>
              images: {ready} ready · {s.bottles.length - ready - missing} not cut out · {missing} none
            </p>

            {s.bottles.length === 0 && !s.loading ? (
              <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>
                <strong style={{ color: "#c6c6ce" }}>{shelf.empty.title}</strong> {shelf.empty.body}
              </p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.75, color: "#c6c6ce" }}>
                {s.bottles.map((b) => (
                  <li key={b.key}>
                    {b.name}
                    <span style={{ color: "#6a6a73" }}>
                      {" — "}
                      {b.status} · {b.imageState}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {!s.done && (
              <button
                onClick={() => loadMore(shelf.id)}
                disabled={s.loading}
                style={{
                  marginTop: 10, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  border: "1px solid #55555f", background: "transparent", color: "#e9e9ec",
                  fontSize: 12.5, fontWeight: 600,
                }}
              >
                {s.loading ? "Loading…" : "Load next page"}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
