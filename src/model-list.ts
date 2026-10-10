/** Normalize untrusted OpenAI-compatible model discovery responses. */
export function parseModelList(body: unknown): string[] {
  const data =
    body && typeof body === "object"
      ? (body as { data?: unknown }).data
      : undefined;
  if (data === undefined || data === null) return [];
  if (!Array.isArray(data))
    throw new Error(
      "The provider returned an invalid model list. Check the API base URL or use your fallback model.",
    );
  return [
    ...new Set(
      data.flatMap((item: unknown) => {
        const id =
          item && typeof item === "object"
            ? (item as { id?: unknown }).id
            : undefined;
        return typeof id === "string" && id.trim() ? [id.trim()] : [];
      }),
    ),
  ];
}
