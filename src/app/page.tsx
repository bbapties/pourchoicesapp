"use client";

import { supabase } from "@/lib/supabase";
import { type User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const dynamic = 'force-dynamic';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // New: for signup only
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuth = async () => {
    setLoading(true);
    let authResponse;
    if (isSignUp) {
      authResponse = await supabase.auth.signUp({ email, password });
    } else {
      authResponse = await supabase.auth.signInWithPassword({ email, password });
    }

    const { data, error } = authResponse;

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // If signup, insert to public.users table
    if (isSignUp && data.user) {
      const { error: insertError } = await supabase.from("users").insert({
        auth_id: data.user.id, // Fix: Use 'auth_id' column to store the auth UUID
        username,
        email,
        collection: [], // Empty array for My Bar
      });

      if (insertError) {
        toast.error("Account created, but profile setup failed: " + insertError.message);
      }
    }

    toast.success(isSignUp ? "Account created! Welcome." : "Welcome back!");
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-2xl">Loading...</div>;

  if (user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-8 bg-gray-100">
        <h1 className="text-4xl font-bold">Welcome to Pour Choices</h1>
        <p className="text-xl">You’re logged in as {user.email}</p>
        <Button onClick={() => supabase.auth.signOut()} size="lg">
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-[90%] max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Pour Choices</h1>
          <p className="text-muted-foreground mt-2">Picture Your Next Sip</p>
        </div>

        <div className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="whiskeylover123"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@whiskey.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleAuth}
            disabled={!email || !password || (isSignUp && !username) || loading}
          >
            {isSignUp ? "Create Account" : "Log In"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? "Already have an account? Log in" : "Need an account? Sign up"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
