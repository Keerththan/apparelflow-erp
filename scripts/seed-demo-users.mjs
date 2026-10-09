// Creates (or resets) the three demo personas in Supabase Auth.
//
//   npm run seed:users
//
// Requires SUPABASE_SECRET_KEY (service role / secret key) in .env.local.
// That key bypasses RLS — it is only used by this local script and must
// never be prefixed with NEXT_PUBLIC_ or added to client code.
//
// The role is written to app_metadata (admin-only). The
// on_auth_user_created trigger copies it into public.profiles.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Shared with the login page's demo credential panel.
const DEMO_USERS = JSON.parse(
  readFileSync(new URL("../lib/demo-users.json", import.meta.url), "utf8"),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listError } =
  await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}

for (const user of DEMO_USERS) {
  const attributes = {
    password: user.password,
    email_confirm: true,
    app_metadata: { role: user.role },
    user_metadata: { full_name: user.full_name },
  };
  const found = existing.users.find((u) => u.email === user.email);

  const { error } = found
    ? await supabase.auth.admin.updateUserById(found.id, attributes)
    : await supabase.auth.admin.createUser({ email: user.email, ...attributes });

  if (error) {
    console.error(`✗ ${user.email}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${found ? "reset" : "created"} ${user.email} (${user.role})`);
  }
}
