import type { IApiResponse } from "../shared/types";
import { validateApiPayload } from "./validateApiPayload";

const API_BASE = "/api";

function unwrapApiResponse<T>(response: IApiResponse<T>, status: number): T {
  if (typeof response !== "object" || response === null || typeof response.success !== "boolean") {
    throw new Error("Invalid API response");
  }
  const message = typeof response.error === "string" && response.error ? response.error : null;
  if (status < 200 || status >= 300) throw new Error(message ?? `Request failed (HTTP ${status})`);
  if (!response.success || response.data === undefined || response.data === null) {
    throw new Error(message ?? "API error");
  }
  return response.data;
}

export async function fetchApi<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(API_BASE + endpoint, signal ? { signal } : undefined);
  const data: IApiResponse<T> = await res.json();
  const payload = unwrapApiResponse(data, res.status);
  validateApiPayload(endpoint, payload);
  return payload;
}

export async function postApi<T, R = unknown>(endpoint: string, body: R): Promise<T> {
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: IApiResponse<T> = await res.json();
  const payload = unwrapApiResponse(data, res.status);
  validateApiPayload(endpoint, payload, "POST");
  return payload;
}
