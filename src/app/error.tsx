"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Something went wrong!</h2>
      <p style={{ marginTop: '1rem', color: '#64748b' }}>
        {error.message || "Unexpected error"}
      </p>
      <button 
        onClick={reset}
        style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#DAA520', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  );
}