import { assertEquals } from "./assert.ts";
import { STRICT_ERROR_CONTRACTS } from "./fixtures/contracts.ts";
import {
  contractEnvironment,
  contractFetch,
  readExactJson,
} from "./helpers/http.ts";

const environment = contractEnvironment();

Deno.test({
  name: "local contract server exposes strict health JSON",
  ignore: environment === null,
  fn: async () => {
    const response = await contractFetch(environment!, "/healthz");
    const body = await readExactJson(response, 200, ["status"]);
    assertEquals(body, { status: "ok" });
    assertEquals(response.headers.get("cache-control"), "no-store");
    assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  },
});

Deno.test({
  name: "protected route families reject anonymous callers uniformly",
  ignore: environment === null,
  fn: async () => {
    for (
      const [method, path, body] of [
        ["GET", "/v1/chat/sealed/messages", undefined],
        ["POST", "/v1/objects/uploads", "{}"],
        ["POST", "/v1/account/delete", '{"confirmation":"DELETE"}'],
        ["GET", "/v1/admin/status", undefined],
        [
          "POST",
          "/v1/appdata/table",
          '{"table":"user_settings","action":"select"}',
        ],
      ] as const
    ) {
      const response = await contractFetch(environment!, path, {
        method,
        body,
      });
      const parsed = await readExactJson(response, 401, ["error"]);
      assertEquals(
        parsed,
        STRICT_ERROR_CONTRACTS.unauthorized.body,
        `${method} ${path}`,
      );
    }
  },
});

Deno.test({
  name: "strict request decoder rejects unknown and trailing JSON",
  ignore: environment === null,
  fn: async () => {
    for (
      const body of [
        '{"walletAddress":"EXO00abcdefabcdefabcdefabcdefabcdefabcdefab","userId":"attacker"}',
        '{"walletAddress":"EXO00abcdefabcdefabcdefabcdefabcdefabcdefab"} {}',
      ]
    ) {
      const response = await contractFetch(
        environment!,
        "/v1/auth/wallet/challenge",
        {
          method: "POST",
          body,
        },
      );
      const parsed = await readExactJson(response, 400, ["error"]);
      assertEquals(parsed, STRICT_ERROR_CONTRACTS.invalidJson.body);
    }
  },
});

Deno.test({
  name: "deletion status does not distinguish invalid from unknown tokens",
  ignore: environment === null,
  fn: async () => {
    for (const operationToken of ["short", "A".repeat(43)]) {
      const response = await contractFetch(
        environment!,
        "/v1/account/delete/status",
        {
          method: "POST",
          body: JSON.stringify({ operationToken }),
        },
      );
      const parsed = await readExactJson(response, 404, ["error"]);
      assertEquals(parsed, STRICT_ERROR_CONTRACTS.deletionUnavailable.body);
    }
  },
});

const rateLimitProbeCount = Number(
  Deno.env.get("SUPABASE_CONTRACT_RATE_LIMIT_PROBE_COUNT") ?? "0",
);
Deno.test({
  name: "versioned routes return the exact rate-limit contract",
  ignore: environment === null || !Number.isSafeInteger(rateLimitProbeCount) ||
    rateLimitProbeCount < 2,
  fn: async () => {
    let response: Response | undefined;
    for (let index = 0; index < rateLimitProbeCount; index++) {
      response = await contractFetch(
        environment!,
        "/v1/auth/wallet/challenge",
        {
          method: "POST",
          body: "{}",
          headers: { "X-Contract-Rate-Limit-Probe": "local-only" },
        },
      );
      if (response.status === 429) break;
      await response.body?.cancel();
    }
    if (!response || response.status !== 429) {
      throw new Error(
        `rate limit not reached after ${rateLimitProbeCount} requests`,
      );
    }
    assertEquals(
      await readExactJson(response, 429, ["error"]),
      STRICT_ERROR_CONTRACTS.rateLimited.body,
    );
  },
});
