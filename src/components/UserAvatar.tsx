"use client";

import { avatarInitials, avatarTint } from "@/lib/avatar";

// The one avatar component (#107). Always a circle. Prefers a real photo (users.avatar_url,
// uploaded in step 7 of #105) and falls back to the generated initials disc, so every place a
// name appears can show a face today and picks up photos later with no change.

type Props = {
  username: string | null | undefined;
  avatarUrl?: string | null;
  /** Diameter in px. Feed rows 36, header 112, overlays 22. */
  size?: number;
  className?: string;
};

export default function UserAvatar({ username, avatarUrl, size = 36, className = "" }: Props) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    background: avatarUrl ? "#241d17" : avatarTint(username),
  };
  const label = username ? `@${username}` : "user";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-cream shadow-[0_0_0_2px_#9c7524,0_0_0_3px_rgba(0,0,0,.6)] shrink-0 overflow-hidden select-none ${className}`}
      style={style}
      role="img"
      aria-label={label}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        avatarInitials(username)
      )}
    </span>
  );
}
