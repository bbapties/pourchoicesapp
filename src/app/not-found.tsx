"use client";

export default function NotFound() {
  return (
    <div style={{ width: '90%', maxWidth: '28rem', padding: '2rem', margin: '5rem auto 0', gap: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Page Not Found</h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>We couldn’t find that sip. Try searching your bar?</p>
      </div>
      <button 
        onClick={() => window.location.href = '/'} 
        style={{ width: '100%', padding: '12px 24px', fontSize: '1rem', fontWeight: '500', borderRadius: '0.375rem', backgroundColor: '#3f6212', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        Go Home
      </button>
    </div>
  );
}