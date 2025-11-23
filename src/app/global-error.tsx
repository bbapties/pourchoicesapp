"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', backgroundColor: '#f3f4f6' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Something went wrong!</h2>
        <p style={{ color: '#64748b', textAlign: 'center', padding: '0 32px' }}>
          {error.message || "An unexpected error occurred"}
        </p>
        <button 
          onClick={() => reset()} 
          style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: '500', borderRadius: '0.375rem', backgroundColor: '#3f6212', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}