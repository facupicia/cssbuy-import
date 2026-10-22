"use client";

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "El email o la contraseña son incorrectos.",
  INVALID_PASSWORD: "La contraseña actual es incorrecta.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 12 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña puede tener hasta 128 caracteres.",
  SESSION_EXPIRED: "Tu sesión venció. Volvé a ingresar.",
};

export async function accountRequest<T = unknown>(path: string, body?: Record<string, unknown>, method = "POST"): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(response.status === 429 ? "Demasiados intentos. Esperá un minuto y reintentá."
      : messages[data.code] || (typeof data.error === "string" ? data.error : "No se pudo completar la operación. Revisá tus datos y reintentá."));
  }
  return data as T;
}

export type AccountStatus = {
  authenticated: boolean; adminConfigured: boolean; setupRequired: boolean;
  user: { name: string; email: string; role: string } | null;
};
