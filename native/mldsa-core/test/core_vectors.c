#include "spectra_mldsa65.h"
#include "api.h"

#include <stdio.h>
#include <string.h>

static uint8_t public_key[SPECTRA_MLDSA65_PUBLICKEYBYTES];
static uint8_t secret_key[SPECTRA_MLDSA65_SECRETKEYBYTES];
static uint8_t signature[SPECTRA_MLDSA65_SIGNATUREBYTES];
static const uint8_t message[] = { 0x6d, 0x73, 0x67 };

int main(void) {
  if (spectra_mldsa65_verify(NULL, 0, signature, sizeof(signature), message, sizeof(message))) {
    fprintf(stderr, "null public key must fail closed\n");
    return 1;
  }
  if (spectra_mldsa65_verify(public_key, 4, signature, sizeof(signature), message, sizeof(message))) {
    fprintf(stderr, "short public key must fail closed\n");
    return 1;
  }
  if (spectra_mldsa65_verify(public_key, sizeof(public_key), signature, 4, message, sizeof(message))) {
    fprintf(stderr, "short signature must fail closed\n");
    return 1;
  }
  if (spectra_mldsa65_sign(NULL, 0, message, sizeof(message), signature, sizeof(signature))) {
    fprintf(stderr, "null secret key must fail closed\n");
    return 1;
  }
  if (spectra_mldsa65_sign(secret_key, 4, message, sizeof(message), signature, sizeof(signature))) {
    fprintf(stderr, "short secret key must fail closed\n");
    return 1;
  }
  memset(public_key, 1, sizeof(public_key));
  memset(signature, 2, sizeof(signature));
  if (spectra_mldsa65_verify(
    public_key,
    sizeof(public_key),
    signature,
    sizeof(signature),
    message,
    sizeof(message)
  )) {
    fprintf(stderr, "junk signature must fail closed\n");
    return 1;
  }
  if (PQCLEAN_MLDSA65_CLEAN_crypto_sign_keypair(public_key, secret_key) != 0) {
    fprintf(stderr, "PQClean keygen failed\n");
    return 1;
  }
  if (!spectra_mldsa65_sign(
    secret_key,
    sizeof(secret_key),
    message,
    sizeof(message),
    signature,
    sizeof(signature)
  )) {
    fprintf(stderr, "PQClean sign failed\n");
    return 1;
  }
  if (!spectra_mldsa65_verify(
    public_key,
    sizeof(public_key),
    signature,
    sizeof(signature),
    message,
    sizeof(message)
  )) {
    fprintf(stderr, "PQClean sign/verify round-trip failed\n");
    return 1;
  }
  return 0;
}
