export const GET = () =>
  new Response(
    JSON.stringify({ revision: process.env.RELEASE_SHA || "local" }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
