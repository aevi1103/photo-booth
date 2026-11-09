export function appOrigin(request: Request) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  if (request.headers.get("x-forwarded-proto") === "https") url.protocol = "https:";
  return url.origin;
}
