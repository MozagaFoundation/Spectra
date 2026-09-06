#include "spectra_mlkem768.h"

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
    fprintf(stderr, "usage: mlkem_encaps pk.bin ct.bin ss.bin\n");
    return 1;
  }
  size_t pk_len = 0;
  uint8_t *pk = read_file(argv[1], &pk_len);
  if (!pk) {
    fprintf(stderr, "failed to read public key\n");
    return 1;
  }
  uint8_t ct[SPECTRA_MLKEM768_CIPHERTEXTBYTES];
  uint8_t ss[SPECTRA_MLKEM768_SHAREDSECRETBYTES];
  const int ok = spectra_mlkem768_encaps(pk, pk_len, ct, sizeof(ct), ss, sizeof(ss));
  free(pk);
  if (!ok) {
    return 1;
  }
  FILE *ct_file = fopen(argv[2], "wb");
  FILE *ss_file = fopen(argv[3], "wb");
  if (!ct_file || !ss_file) {
    return 1;
  }
  const int wrote = fwrite(ct, 1, sizeof(ct), ct_file) == sizeof(ct)
    && fwrite(ss, 1, sizeof(ss), ss_file) == sizeof(ss);
  fclose(ct_file);
  fclose(ss_file);
  return wrote ? 0 : 1;
}
