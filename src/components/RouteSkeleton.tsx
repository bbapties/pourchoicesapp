/**
 * What a tab shows in the beat between the tap and the server's answer. Every tab is a server-
 * rendered page that reads Supabase before it can send a byte, and until 2026-09-13 there was no
 * loading boundary at all -- a tap did nothing visible for up to a second and read as a missed
 * tap. Each route's loading.tsx renders this in the room's own materials so the switch is
 * instant and the page fills in behind it. Next prefetches the boundary from the nav Links.
 */
export default function RouteSkeleton({ rows = 5, header = false }: { rows?: number; header?: boolean }) {
  return (
    <div className="bg-panel min-h-full animate-pulse" aria-busy="true" aria-label="Loading">
      {header && <div className="h-14 pc-wood pc-rail-bottom" />}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="pc-leather rounded-lg h-24 opacity-60" />
        ))}
      </div>
    </div>
  );
}
