// Upload one image to a public Supabase Storage bucket. Prints only the public URL.
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE from ./.env.local (repo root).
// Usage (from repo root): node .claude/skills/verify-bottle/scripts/upload_image.mjs <localFile> <bucket> <destPath>
import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(resolve(process.cwd(), "package.json"));
const { createClient } = require("@supabase/supabase-js");

const [file, bucket, dest] = process.argv.slice(2);
if (!file || !bucket || !dest) {
  console.error("usage: upload_image.mjs <localFile> <bucket> <destPath>"); process.exit(1);
}
const envPath = process.env.ENV_LOCAL || resolve(process.cwd(), ".env.local");
const env = readFileSync(envPath, "utf8").replace(/^﻿/, "");
const get = (k) => {
  const l = env.split(/\r?\n/).find((x) => x.startsWith(k + "="));
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, "") : null;
};
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE");
if (!url || !key) { console.error("missing SUPABASE url/service-role"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const buckets = await sb.storage.listBuckets();
if (buckets.error) { console.error("listBuckets:", buckets.error.message); process.exit(1); }
if (!buckets.data.find((b) => b.name === bucket)) {
  const c = await sb.storage.createBucket(bucket, {
    public: true, fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (c.error) { console.error("createBucket:", c.error.message); process.exit(1); }
  console.error("created bucket:", bucket, "(public read)");
}
const ext = dest.split(".").pop().toLowerCase();
const ct = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
const up = await sb.storage.from(bucket).upload(dest, readFileSync(file), {
  contentType: ct, upsert: true, cacheControl: "31536000",
});
if (up.error) { console.error("upload:", up.error.message); process.exit(1); }
process.stdout.write(sb.storage.from(bucket).getPublicUrl(dest).data.publicUrl + "\n");
