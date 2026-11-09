export type PhotoQuota = {
  role: "user" | "admin";
  used: number;
  limit: number | null;
  remaining: number | null;
};

export type PhotoReservation =
  | { allowed: false; quota: PhotoQuota }
  | { allowed: true; quota: PhotoQuota; id: string; path: string };

export function isPhotoQuota(value: unknown): value is PhotoQuota {
  if (!value || typeof value !== "object") return false;
  const quota = value as Record<string, unknown>;
  return (quota.role === "user" || quota.role === "admin") &&
    typeof quota.used === "number" && Number.isInteger(quota.used) && quota.used >= 0 &&
    (quota.role === "admin"
      ? quota.limit === null && quota.remaining === null
      : quota.limit === 20 && typeof quota.remaining === "number" && quota.remaining === Math.max(0, 20 - quota.used));
}

export function isPhotoReservation(value: unknown): value is PhotoReservation {
  if (!value || typeof value !== "object") return false;
  const reservation = value as Record<string, unknown>;
  return isPhotoQuota(reservation.quota) && (reservation.allowed === false ||
    (reservation.allowed === true && typeof reservation.id === "string" && typeof reservation.path === "string"));
}
