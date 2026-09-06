#include "spectra_mldsa65.h"

#include <stdio.h>
#include <stdlib.h>

static uint8_t *read_file(const char *path, size_t *len) {
  FILE *file = fopen(path, "rb");
  if (!file) return NULL;
  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return NULL;
  }
  const long size = ftell(file);
  if (size < 0) {
    fclose(file);
    return NULL;
  }
  rewind(file);
  uint8_t *buffer = malloc((size_t)size);
  if (!buffer) {
    fclose(file);
    return NULL;
  }
  if (fread(buffer, 1, (size_t)size, file) != (size_t)size) {
    free(buffer);
    fclose(file);
    return NULL;
  }
  fclose(file);
  *len = (size_t)size;
  return buffer;
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: mldsa_interop pk.bin sig.bin msg.bin\n");
    return 1;
  }
  size_t pk_len = 0, sig_len = 0, msg_len = 0;
  uint8_t *pk = read_file(argv[1], &pk_len);
  uint8_t *sig = read_file(argv[2], &sig_len);
  uint8_t *msg = read_file(argv[3], &msg_len);
  if (!pk || !sig || !msg) {
    fprintf(stderr, "failed to read vectors\n");
    return 1;
  }
  const int valid = spectra_mldsa65_verify(pk, pk_len, sig, sig_len, msg, msg_len);
  msg[0] ^= 1;
  const int tampered = spectra_mldsa65_verify(pk, pk_len, sig, sig_len, msg, msg_len);
  free(pk);
  free(sig);
  free(msg);
  if (!valid) {
    fprintf(stderr, "PQClean rejected a @noble ML-DSA-65 signature\n");
    return 1;
  }
  if (tampered) {
    fprintf(stderr, "PQClean accepted a tampered message\n");
    return 1;
  }
  return 0;
}
