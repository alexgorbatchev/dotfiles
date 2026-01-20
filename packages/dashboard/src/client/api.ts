const API_BASE = '/api';

export async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(API_BASE + endpoint);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data.data;
}
