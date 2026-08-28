"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PASSWORD_MIN = 8;

// B-26: destination of the password-reset email link. Supabase parses the
// recovery token from the URL and gives this page a temporary session; the user
// then sets a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (saving) return;
    if (password.length < PASSWORD_MIN) { setError(`Password must be at least ${PASSWORD_MIN} characters.`); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => router.replace("/mybar"), 1400);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-6 bg-ivory">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-xl font-bold text-gray-900">Set a new password</h1>

        {done ? (
          <p className="text-green-700 text-sm mt-3">Password updated. Taking you to your bar…</p>
        ) : !ready ? (
          <p className="text-sm text-gray-500 mt-3">
            Open this page from the password-reset link in your email. If you came here directly,
            request a new link from the login screen.
          </p>
        ) : (
          <div className="space-y-4 mt-4">
            <input
              autoFocus
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-gray-600"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-gray-600"
            />
            <p className="text-xs text-gray-400">At least {PASSWORD_MIN} characters.</p>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              onClick={submit}
              disabled={!password || !confirm || saving}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Update password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
