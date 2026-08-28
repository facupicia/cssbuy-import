export class FetchError extends Error {
  info?: any;
  status?: number;
}

export async function fetcher<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new FetchError("Error en la solicitud");
    try {
      error.info = await res.json();
    } catch {
      error.info = { error: res.statusText };
    }
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function fetcherPost<T = any>(url: string, data?: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const error = new FetchError("Error en la solicitud");
    try {
      error.info = await res.json();
    } catch {
      error.info = { error: res.statusText };
    }
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function fetcherDelete<T = any>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = new FetchError("Error en la solicitud");
    try {
      error.info = await res.json();
    } catch {
      error.info = { error: res.statusText };
    }
    error.status = res.status;
    throw error;
  }
  return res.json();
}
