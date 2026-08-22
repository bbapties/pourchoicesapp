"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export type UserRole = "user" | "admin";

type CurrentUserState = {
  authId: string | null;
  publicUserId: string | null;
  username: string | null;
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
  seenCoachIds: string[];
  setSeenCoachIds: (ids: string[]) => void;
};

const noop = (_ids: string[]) => {};

const defaultState: CurrentUserState = {
  authId: null,
  publicUserId: null,
  username: null,
  role: "user",
  isAdmin: false,
  loading: true,
  seenCoachIds: [],
  setSeenCoachIds: noop,
};

const CurrentUserContext = createContext<CurrentUserState>(defaultState);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CurrentUserState>(defaultState);

  useEffect(() => {
    let cancelled = false;

    const resolveFromAuthId = async (authId: string | null) => {
      if (!authId) {
        if (!cancelled) setState({ ...defaultState, loading: false });
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("id, username, role, seen_coach_ids")
        .eq("auth_id", authId)
        .maybeSingle();

      if (cancelled) return;

      // role column may not exist yet (pre-migration) — default to 'user'
      const role: UserRole = data?.role === "admin" ? "admin" : "user";
      const seenCoachIds: string[] = Array.isArray(data?.seen_coach_ids)
        ? data.seen_coach_ids
        : [];

      setState({
        authId,
        publicUserId: data?.id ?? null,
        username: data?.username ?? null,
        role,
        isAdmin: role === "admin",
        loading: false,
        seenCoachIds,
        setSeenCoachIds: (ids: string[]) =>
          setState((prev) => ({ ...prev, seenCoachIds: ids })),
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveFromAuthId(session?.user?.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveFromAuthId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  return <CurrentUserContext.Provider value={state}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
