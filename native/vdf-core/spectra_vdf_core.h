#ifndef SPECTRA_VDF_CORE_H
#define SPECTRA_VDF_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum spectra_vdf_status {
  SPECTRA_VDF_STATUS_OK = 0,
  SPECTRA_VDF_STATUS_INVALID_INPUT = 1,
  SPECTRA_VDF_STATUS_CANCELLED = 2,
  SPECTRA_VDF_STATUS_INTERNAL_ERROR = 3,
} spectra_vdf_status;

typedef int (*spectra_vdf_is_cancelled)(void *context);
typedef void (*spectra_vdf_progress)(
  void *context,
  uint32_t completed_iterations,
  uint32_t total_iterations
);

spectra_vdf_status spectra_vdf_evaluate(
  const char *modulus_hex,
  const char *base_hex,
  uint32_t iterations,
  char *output_hex,
  size_t output_hex_capacity,
  void *callback_context,
  spectra_vdf_is_cancelled is_cancelled,
  spectra_vdf_progress progress
);

spectra_vdf_status spectra_vdf_prove(
  const char *modulus_hex,
  const char *base_hex,
  const char *prime_hex,
  uint32_t iterations,
  char *proof_hex,
  size_t proof_hex_capacity,
  void *callback_context,
  spectra_vdf_is_cancelled is_cancelled,
  spectra_vdf_progress progress
);

const char *spectra_vdf_status_message(spectra_vdf_status status);

#ifdef __cplusplus
}
#endif

#endif
