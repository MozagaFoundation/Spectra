import { assertEquals } from "../assert.ts";

export interface ContractEnvironment {
  baseUrl: string;
  publishableKey?: string;
}

export function contractEnvironment(): ContractEnvironment | null {
  const configured = Deno.env.get("SUPABASE_CONTRACT_BASE_URL")?.trim();
  if (!configured) return null;
  return {
    baseUrl: configured.replace(/\/+$/u, ""),
    publishableKey: Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
      undefined,
  };
}

export async function contractFetch(
  environment: ContractEnvironment,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (environment.publishableKey && !headers.has("apikey")) {
    headers.set("apikey", environment.publishableKey);
  }
  return await fetch(`${environment.baseUrl}${path}`, {
    ...init,
    headers,
    redirect: "error",
  });
}

export async function readExactJson(
  response: Response,
  status: number,
  expectedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  assertEquals(response.status, status, "unexpected HTTP status");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new Error(
      `expected JSON content type, got ${JSON.stringify(contentType)}`,
    );
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`response is not one JSON value: ${JSON.stringify(text)}`);
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new Error("response JSON must be an object");
  }
  assertEquals(
    Object.keys(body as Record<string, unknown>).sort(),
    [...expectedKeys].sort(),
    "response keys changed",
  );
  return body as Record<string, unknown>;
}
