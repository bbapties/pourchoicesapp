/**
 * Which badges are LIVE on the shelf (Brian, 2026-09-21). Every badge is built and the engine
 * keeps counting credit for all of them, but a badge only shows as earnable once its 3D art is
 * done and Brian has decided how to reward the people who already hold credit. Until then it sits
 * under "Coming soon" - locked plate, no tier, no progress. Release one by adding its id here.
 */
export const RELEASED_BADGES = new Set<string>([]);

export const isReleased = (badgeId: string) => RELEASED_BADGES.has(badgeId);
