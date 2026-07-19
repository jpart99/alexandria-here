export function recoveryNotFoundResponse() {
  return Response.json(
    { error: "Recovery not found." },
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
