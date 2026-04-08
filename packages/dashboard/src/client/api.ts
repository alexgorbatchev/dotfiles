const API_BASE = "/api";

export async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(API_BASE + endpoint);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "API error");
  return data.data;
}

export async function postApi<T, R = unknown>(endpoint: string, body: R): Promise<T> {
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "API error");
  return data.data;
}
