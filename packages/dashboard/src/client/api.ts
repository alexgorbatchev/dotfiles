import type { IApiResponse } from "../shared/types";

const API_BASE = "/api";

function unwrapApiResponse<T>(response: IApiResponse<T>): T {
  if (!response.success || response.data === undefined) throw new Error(response.error || "API error");
  return response.data;
}

export async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(API_BASE + endpoint);
  const data: IApiResponse<T> = await res.json();
  return unwrapApiResponse(data);
}

export async function postApi<T, R = unknown>(endpoint: string, body: R): Promise<T> {
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: IApiResponse<T> = await res.json();
  return unwrapApiResponse(data);
}
