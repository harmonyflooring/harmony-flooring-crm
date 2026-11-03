// Gives an admin a one-time "set your password" link for a team member,
// so passwords can be set or reset without sending email.
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
  if (!me?.is_admin) return json({ error: "Only an admin can get password links." }, 403);

  // Links only go to people on the team
  const { name, redirectTo } = await req.json().catch(() => ({}));
  const { data: member } = await admin.from("team_members").select("user_id").eq("name", name).maybeSingle();
  if (!member) return json({ error: `${name} has no login yet.` }, 404);
  const { data: target, error: findError } = await admin.auth.admin.getUserById(member.user_id);
  if (findError || !target.user?.email) return json({ error: `${name} has no login yet.` }, 404);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target.user.email,
    options: { redirectTo },
  });
  if (error) return json({ error: error.message }, 500);
  return json({ link: data.properties.action_link });
});
