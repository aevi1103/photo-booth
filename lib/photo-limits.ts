// Leave headroom below Vercel Functions' 4.5 MB request limit.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_SIZE_ERROR = "Photo exceeds the 4 MB upload limit. Download it as a backup.";
