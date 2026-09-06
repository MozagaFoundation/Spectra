#include "spectra_mlkem768.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
    fprintf(stderr, "usage: mlkem_interop pk.bin sk.bin ct.bin\n");
    return 1;
  }
  size_t pk_len = 0, sk_len = 0, ct_len = 0;
  uint8_t *pk = read_file(argv[1], &pk_len);
  uint8_t *sk = read_file(argv[2], &sk_len);
  uint8_t *ct = read_file(argv[3], &ct_len);
  if (!pk || !sk || !ct) {
    fprintf(stderr, "failed to read vectors\n");
    return 1;
  }
  uint8_t ss[SPECTRA_MLKEM768_SHAREDSECRETBYTES];
  const int ok = spectra_mlkem768_decaps(sk, sk_len, ct, ct_len, ss, sizeof(ss));
  fwrite(ss, 1, sizeof(ss), stdout);
  free(pk);
  free(sk);
  free(ct);
  return ok ? 0 : 1;
}
