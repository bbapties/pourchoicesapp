"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { validateUsername } from "@/lib/profile";

export const dynamic = "force-dynamic";

type AuthPath = "unknown" | "login" | "signup";
type StepId = "email" | "username" | "password";

export default function Home() {
  const router = useRouter();

  // Splash state — authChecked stays false until we confirm no session exists
  // (if session exists we navigate away while still showing splash, avoiding flicker)
  const [authChecked, setAuthChecked] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<StepId>("email");
  const [path, setPath] = useState<AuthPath>("unknown");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [stepKey, setStepKey] = useState(0); // increment to trigger slide animation

  // Form values
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: check session, hold splash for 1.5s minimum.
  // Only set authChecked (show Get Started) if there is NO session.
  // If session exists, navigate away while still showing the splash — no flash.
  useEffect(() => {
    const sessionCheck = supabase.auth.getSession();
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 1500));

    Promise.all([sessionCheck, minDelay]).then(([{ data: { session } }]) => {
      if (session) {
        router.replace("/mybar");
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

  // Progress bar calculation
  const getStepNumber = () => {
    if (currentStep === "email") return 1;
    if (currentStep === "username") return 2;
    if (currentStep === "password") return path === "login" ? 2 : 3;
    return 1;
  };
  const getTotalSteps = () => {
    if (path === "login") return 2;
    if (path === "signup") return 3;
    return 2;
  };
  const progressPercent = (getStepNumber() / getTotalSteps()) * 100;

  // Navigate between steps
  const goToStep = (step: StepId, dir: "forward" | "back") => {
    setDirection(dir);
    setCurrentStep(step);
    setStepKey((k) => k + 1);
    setError(null);
  };

  // Step handlers
  const handleEmailSubmit = async () => {
    if (!email || isLoading) return;
    setIsLoading(true);
    setError(null);

    // B-18: anon can no longer read public.users; check existence via a SECURITY
    // DEFINER RPC that returns only a boolean.
    const { data: exists } = await supabase.rpc("email_exists", { p_email: email });

    setIsLoading(false);

    if (exists) {
      setPath("login");
      goToStep("password", "forward");
    } else {
      setPath("signup");
      goToStep("username", "forward");
    }
  };

  const handleUsernameSubmit = async () => {
    if (!username || isLoading) return;
    const name = username.trim();
    const formatErr = validateUsername(name);
    if (formatErr) { setError(formatErr); return; }

    // Pre-check uniqueness (case-insensitive) BEFORE auth.signUp, so a duplicate
    // username can't leave an Auth user with no public.users row (B-08).
    setIsLoading(true);
    setError(null);
    const { data: taken, error: checkErr } = await supabase
      .from("users")
      .select("id")
      .ilike("username", name)
      .limit(1);
    setIsLoading(false);
    if (checkErr) { setError("Couldn't check that username. Please try again."); return; }
    if (taken && taken.length > 0) { setError("That username is taken."); return; }

    goToStep("password", "forward");
  };

  const handlePasswordSubmit = async () => {
    if (!password || isLoading) return;
    setIsLoading(true);
    setError(null);

    if (path === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Incorrect password. Please try again.");
        setIsLoading(false);
        return;
      }
      router.replace("/mybar");
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }
      if (data.user) {
        const { error: insErr } = await supabase.from("users").insert({
          auth_id: data.user.id,
          username: username.trim(),
          email,
          collection: [],
        });
        if (insErr) {
          // The Auth user was created but the profile row wasn't. Sign out so we
          // don't leave an authenticated session with no public.users row (which
          // would bounce-loop on /mybar), and surface the error instead of
          // silently navigating (B-08).
          await supabase.auth.signOut();
          const code = (insErr as { code?: string }).code;
          setError(
            code === "23505"
              ? "That username or email is already taken."
              : "Could not finish creating your account. Please try again."
          );
          setIsLoading(false);
          return;
        }
      }
      router.replace("/mybar");
    }
    setIsLoading(false);
  };

  const handleBack = () => {
    if (currentStep === "password" && path === "login") {
      setPath("unknown");
      goToStep("email", "back");
    } else if (currentStep === "password" && path === "signup") {
      goToStep("username", "back");
    } else if (currentStep === "username") {
      setPath("unknown");
      goToStep("email", "back");
    }
  };

  const onKey = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") action();
  };

  const slideClass = direction === "forward" ? "slide-in-right" : "slide-in-left";

  // --- SPLASH SCREEN (while auth check is in progress, or navigating to /mybar) ---
  if (!authChecked) {
    return (
      <>
        <div className="fixed inset-0">
          <img src="/cellar-bg.png" alt="Pour Choices" className="w-full h-full object-cover object-top" />
        </div>
        <Toaster />
      </>
    );
  }

  // --- GET STARTED (session not found, wizard not yet opened) ---
  if (!showWizard) {
    return (
      <>
        <div className="fixed inset-0">
          <img src="/cellar-bg.png" alt="Pour Choices" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 flex flex-col items-center justify-end p-8 pb-16">
            <button
              onClick={() => setShowWizard(true)}
              className="w-full max-w-sm py-4 bg-white text-gray-900 font-semibold text-lg rounded-xl shadow-lg"
            >
              Get Started
            </button>
          </div>
        </div>
        <Toaster />
      </>
    );
  }

  // --- AUTH WIZARD ---
  return (
    <>
      <div className="fixed inset-0">
        <img src="/cellar-bg.png" alt="Pour Choices" className="w-full h-full object-cover object-top" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">

            {/* Progress bar */}
            <div className="h-1 bg-gray-200">
              <div
                className="h-1 bg-gray-800 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Header row: back button + step counter */}
            <div className="flex items-center justify-between px-5 pt-4 pb-1 min-h-[40px]">
              {currentStep !== "email" ? (
                <button onClick={handleBack} className="text-sm text-gray-500">
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <span className="text-xs text-gray-400">
                Step {getStepNumber()} of {getTotalSteps()}
              </span>
            </div>

            {/* Step content — key changes on every step transition to trigger slide animation */}
            <div key={stepKey} className={`px-6 pb-7 pt-2 ${slideClass}`}>

              {currentStep === "email" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">What&apos;s your email?</h2>
                    <p className="text-sm text-gray-500 mt-1">We&apos;ll check if you have an account</p>
                  </div>
                  <input
                    autoFocus
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => onKey(e, handleEmailSubmit)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-gray-600"
                  />
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button
                    onClick={handleEmailSubmit}
                    disabled={!email || isLoading}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold disabled:opacity-40"
                  >
                    {isLoading ? "Checking..." : "Continue"}
                  </button>
                </div>
              )}

              {currentStep === "username" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Choose a username</h2>
                    <p className="text-sm text-gray-500 mt-1">This is how others will see you</p>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="whiskeylover123"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => onKey(e, handleUsernameSubmit)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-gray-600"
                  />
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button
                    onClick={handleUsernameSubmit}
                    disabled={!username || isLoading}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              )}

              {currentStep === "password" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {path === "login" ? "Welcome back!" : "Create a password"}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {path === "login" ? email : "Choose something secure"}
                    </p>
                  </div>
                  <input
                    autoFocus
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => onKey(e, handlePasswordSubmit)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-gray-600"
                  />
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button
                    onClick={handlePasswordSubmit}
                    disabled={!password || isLoading}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold disabled:opacity-40"
                  >
                    {isLoading
                      ? "Just a moment..."
                      : path === "login"
                      ? "Log In"
                      : "Create Account"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
