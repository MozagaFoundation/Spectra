import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import {
  buildWalletIndexActivationSigningMessage,
  hashWalletIndexActivationBinding,
} from "../../packages/spectra-privacy-protocol/src/walletIndexActivation.ts";
import { assertEquals, assertThrows } from "./assert.ts";
import {
  verifyWalletIndexAddressProof,
  walletIndexActivationBindingHash,
} from "../functions/_shared/walletIndexActivation.ts";

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("wallet-index activation proof binds an Ethereum address to its VDF request", () => {
  const privateKey = Uint8Array.from({ length: 32 }, () => 7);
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  const address = `0x${hex(keccak_256(publicKey.slice(1)).slice(-20))}`;
  const request = {
    activationId: `wia1.${"a".repeat(32)}`,
    ownerWalletAddress: `EXO00${"b".repeat(38)}`,
    chain: "ethereum" as const,
    address,
    nonceHex: "c".repeat(64),
    expiresAt: 1_800_000_000_000,
  };
  const signature = secp256k1.sign(
    sha256(encoder.encode(buildWalletIndexActivationSigningMessage(request))),
    privateKey,
  ).toCompactRawBytes();
  const proof = {
    algorithm: "secp256k1" as const,
    publicKeyHex: hex(publicKey),
    signatureHex: hex(signature),
  };

  verifyWalletIndexAddressProof(request, proof);
  assertEquals(
    walletIndexActivationBindingHash(request, proof),
    hashWalletIndexActivationBinding(request, proof),
  );
  assertThrows(
    () =>
      verifyWalletIndexAddressProof({
        ...request,
        address: `0x${"0".repeat(40)}`,
      }, proof),
    /invalid_address_proof/u,
  );
});

Deno.test("wallet-index activation proof accepts a compressed Bitcoin key", () => {
  const privateKey = Uint8Array.from([
    0x46,
    0x04,
    0xb4,
    0xb7,
    0x10,
    0xfe,
    0x91,
    0xf5,
    0x84,
    0xff,
    0xf0,
    0x84,
    0xe1,
    0xa9,
    0x15,
    0x9f,
    0xe4,
    0xf8,
    0x40,
    0x8f,
    0xff,
    0x38,
    0x05,
    0x96,
    0xa6,
    0x04,
    0x94,
    0x84,
    0x74,
    0xce,
    0x4f,
    0xa3,
  ]);
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const request = {
    activationId: `wia1.${"a".repeat(32)}`,
    ownerWalletAddress: `EXO00${"b".repeat(38)}`,
    chain: "bitcoin" as const,
    address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    nonceHex: "c".repeat(64),
    expiresAt: 1_800_000_000_000,
  };
  const signature = secp256k1.sign(
    sha256(encoder.encode(buildWalletIndexActivationSigningMessage(request))),
    privateKey,
  ).toCompactRawBytes();
  const proof = {
    algorithm: "secp256k1" as const,
    publicKeyHex: hex(publicKey),
    signatureHex: hex(signature),
  };

  verifyWalletIndexAddressProof(request, proof);
  assertEquals(
    walletIndexActivationBindingHash(request, proof),
    hashWalletIndexActivationBinding(request, proof),
  );
});

Deno.test("wallet-index activation proof accepts an ML-DSA-65 signature", () => {
  const { publicKey, secretKey } = ml_dsa65.keygen(
    Uint8Array.from({ length: 32 }, () => 7),
  );
  const address = `EXO${
    hex(Uint8Array.from([0, ...keccak_256(publicKey).slice(-19)]))
  }`;
  const request = {
    activationId: `wia1.${"a".repeat(32)}`,
    ownerWalletAddress: address,
    chain: "mozaga" as const,
    address,
    nonceHex: "c".repeat(64),
    expiresAt: 1_800_000_000_000,
  };
  const signature = ml_dsa65.sign(
    encoder.encode(
      `spectra.wallet-index-activation.v1\u0000${
        buildWalletIndexActivationSigningMessage(request)
      }`,
    ),
    secretKey,
  );
  const proof = {
    algorithm: "mldsa65" as const,
    publicKeyHex: hex(publicKey),
    signatureHex: hex(signature),
  };

  verifyWalletIndexAddressProof(request, proof);
  assertEquals(
    walletIndexActivationBindingHash(request, proof),
    hashWalletIndexActivationBinding(request, proof),
  );
});
