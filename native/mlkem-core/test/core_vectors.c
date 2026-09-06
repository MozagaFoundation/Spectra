#include "spectra_mlkem768.h"
#include "kem.h"

#include <stdio.h>
#include <string.h>

static uint8_t public_key[SPECTRA_MLKEM768_PUBLICKEYBYTES];
static uint8_t secret_key[SPECTRA_MLKEM768_SECRETKEYBYTES];
static uint8_t ciphertext[SPECTRA_MLKEM768_CIPHERTEXTBYTES];
static uint8_t shared_a[SPECTRA_MLKEM768_SHAREDSECRETBYTES];
static uint8_t shared_b[SPECTRA_MLKEM768_SHAREDSECRETBYTES];

int main(void) {
  if (spectra_mlkem768_encaps(NULL, 0, ciphertext, sizeof(ciphertext), shared_a, sizeof(shared_a))) {
    fprintf(stderr, "null public key must fail closed\n");
    return 1;
  }
  if (spectra_mlkem768_encaps(public_key, 4, ciphertext, sizeof(ciphertext), shared_a, sizeof(shared_a))) {
    fprintf(stderr, "short public key must fail closed\n");
    return 1;
  }
  if (spectra_mlkem768_decaps(NULL, 0, ciphertext, sizeof(ciphertext), shared_a, sizeof(shared_a))) {
    fprintf(stderr, "null secret key must fail closed\n");
    return 1;
  }
  if (PQCLEAN_MLKEM768_CLEAN_crypto_kem_keypair(public_key, secret_key) != 0) {
    fprintf(stderr, "PQClean ML-KEM keygen failed\n");
    return 1;
  }
  if (!spectra_mlkem768_encaps(
    public_key,
    sizeof(public_key),
    ciphertext,
    sizeof(ciphertext),
    shared_a,
    sizeof(shared_a)
  )) {
    fprintf(stderr, "PQClean encaps failed\n");
    return 1;
  }
  if (!spectra_mlkem768_decaps(
    secret_key,
    sizeof(secret_key),
    ciphertext,
    sizeof(ciphertext),
    shared_b,
    sizeof(shared_b)
  )) {
    fprintf(stderr, "PQClean decaps failed\n");
    return 1;
  }
  if (memcmp(shared_a, shared_b, sizeof(shared_a)) != 0) {
    fprintf(stderr, "PQClean encaps/decaps shared secrets diverged\n");
    return 1;
  }
  return 0;
}
