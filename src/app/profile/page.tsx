"use client";

import UserPage from "@/components/user/UserPage";

// Your own user page (#110): the Profile tab IS the profile. Settings live behind the gear.
export default function ProfilePage() {
  return <UserPage own />;
}
