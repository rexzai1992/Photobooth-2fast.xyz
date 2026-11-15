// Check the admin PIN on the server (the PIN is no longer inside the website code).
// Set it in Cloudflare: Pages project -> Settings -> Variables and Secrets -> ADMIN_PIN
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export const onRequestPost = async ({ request, env }) => {
  const expected = (env.ADMIN_PIN || '').trim();
  const provided = (request.headers.get('x-admin-pin') || '').trim();
  if (!expected) return json({ ok: false, error: 'ADMIN_PIN is not set on the server' }, 500);
  // small delay makes guessing PINs slow
  await new Promise((resolve) => setTimeout(resolve, 400));
  return json({ ok: provided === expected }, provided === expected ? 200 : 401);
};
