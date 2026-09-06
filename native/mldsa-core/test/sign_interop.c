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
    fprintf(stderr, "usage: mldsa_sign_interop sk.bin msg.bin sig.bin\n");
    return 1;
  }
  size_t sk_len = 0, msg_len = 0;
  uint8_t *sk = read_file(argv[1], &sk_len);
  uint8_t *msg = read_file(argv[2], &msg_len);
  if (!sk || !msg) {
    fprintf(stderr, "failed to read vectors\n");
    return 1;
  }
  uint8_t signature[SPECTRA_MLDSA65_SIGNATUREBYTES];
  const int ok = spectra_mldsa65_sign(
    sk,
    sk_len,
    msg,
    msg_len,
    signature,
    sizeof(signature)
  );
  free(sk);
  free(msg);
  if (!ok) {
    return 1;
  }
  FILE *sig_file = fopen(argv[3], "wb");
  if (!sig_file) {
    return 1;
  }
  const int wrote = fwrite(signature, 1, sizeof(signature), sig_file) == sizeof(signature);
  fclose(sig_file);
  return wrote ? 0 : 1;
}
