import UserPage from "@/components/user/UserPage";

// Someone's user page (#110). /profile is the same component with `own`.
export default async function UserRoute({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <UserPage username={decodeURIComponent(username)} />;
}
