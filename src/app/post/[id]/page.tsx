import PostClient from "./PostClient";

// One activity as a page (#109): the big card in detail mode, the viewer's Add / Wishlist,
// cheers, and the comment thread. A route rather than a sheet so pushes and the Home shelf
// can deep-link to it.
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostClient activityId={id} />;
}
