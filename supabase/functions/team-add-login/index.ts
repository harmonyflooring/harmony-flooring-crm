// Lets an admin create a login for a team member and get their first
// "set your password" link to text them.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Only a signed-in admin may ask
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Please log in again." }, 401);
  const { data: me } = await admin.from("team_members").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!me?.is_admin) return json({ error: "Only an admin can create logins." }, 403);

  const body = await req.json().catch(() => ({}));
  const { name, redirectTo } = body;
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Please enter a valid email." }, 400);
  const { data: person } = await admin.from("salesmen").select("name").eq("name", name).maybeSingle();
  if (!person) return json({ error: `${name} is not on the team.` }, 404);
  const { data: has } = await admin.from("team_members").select("user_id").eq("name", name).maybeSingle();
  if (has) return json({ error: `${name} already has a login.` }, 409);

  // Someone removed earlier keeps their account, so it can be reused
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let account = list?.users.find((u) => (u.email || "").toLowerCase() === email);
  if (account) {
    const { data: taken } = await admin.from("team_members").select("name").eq("user_id", account.id).maybeSingle();
    if (taken) return json({ error: `That email is already ${taken.name}'s login.` }, 409);
  } else {
    const { data: made, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
    });
    if (error || !made.user) return json({ error: error?.message || "Could not create the login." }, 400);
    account = made.user;
  }

  const { error: joinError } = await admin.from("team_members").insert({ user_id: account.id, name });
  if (joinError) return json({ error: joinError.message }, 500);

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  if (error) return json({ error: "Login created, but the link failed: " + error.message }, 500);
  return json({ link: data.properties.action_link });
});
