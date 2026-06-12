/**
 * Read a fetch Response as JSON without exposing the raw browser parse
 * error ("Failed to execute 'json' on 'Response': Unexpected end of JSON
 * input") when the body is empty or malformed. Throws an Error whose
 * message is safe to show to end users.
 */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok ? "서버 응답이 비어 있습니다." : `HTTP ${res.status}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ? "서버 응답을 해석할 수 없습니다." : `HTTP ${res.status}`,
    );
  }
}
