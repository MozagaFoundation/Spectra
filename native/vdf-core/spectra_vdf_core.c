#include "spectra_vdf_core.h"

#include <string.h>

#include "vendor/libtommath/tommath.h"

enum {
  SPECTRA_VDF_MIN_MODULUS_BYTES = 256,
  SPECTRA_VDF_MAX_MODULUS_BYTES = 1024,
  SPECTRA_VDF_PRIME_BYTES = 16,
  SPECTRA_VDF_MAX_ITERATIONS = 20000000,
  SPECTRA_VDF_CHECK_INTERVAL = 1024,
};

static int hex_nibble(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

static spectra_vdf_status hex_to_bytes(
  const char *hex,
  size_t expected_bytes,
  unsigned char *output
) {
  size_t index;
  if (hex == NULL || output == NULL || strlen(hex) != expected_bytes * 2u) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  for (index = 0; index < expected_bytes; index += 1) {
    const int high = hex_nibble(hex[index * 2u]);
    const int low = hex_nibble(hex[index * 2u + 1u]);
    if (high < 0 || low < 0) return SPECTRA_VDF_STATUS_INVALID_INPUT;
    output[index] = (unsigned char)((high << 4) | low);
  }
  return SPECTRA_VDF_STATUS_OK;
}

static spectra_vdf_status import_hex(
  mp_int *value,
  const char *hex,
  size_t byte_length
) {
  unsigned char bytes[SPECTRA_VDF_MAX_MODULUS_BYTES];
  spectra_vdf_status status;
  if (byte_length > sizeof(bytes)) return SPECTRA_VDF_STATUS_INVALID_INPUT;
  status = hex_to_bytes(hex, byte_length, bytes);
  if (status != SPECTRA_VDF_STATUS_OK) return status;
  return mp_from_ubin(value, bytes, byte_length) == MP_OKAY
    ? SPECTRA_VDF_STATUS_OK
    : SPECTRA_VDF_STATUS_INTERNAL_ERROR;
}

static spectra_vdf_status export_fixed_hex(
  const mp_int *value,
  size_t byte_length,
  char *output,
  size_t output_capacity
) {
  static const char digits[] = "0123456789abcdef";
  unsigned char bytes[SPECTRA_VDF_MAX_MODULUS_BYTES];
  size_t written = 0;
  size_t index;
  if (
    output == NULL ||
    byte_length > sizeof(bytes) ||
    output_capacity < (byte_length * 2u) + 1u
  ) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  memset(bytes, 0, byte_length);
  written = mp_ubin_size(value);
  if (written == 0 || written > byte_length) return SPECTRA_VDF_STATUS_INTERNAL_ERROR;
  if (mp_to_ubin(value, bytes + byte_length - written, written, &written) != MP_OKAY) {
    return SPECTRA_VDF_STATUS_INTERNAL_ERROR;
  }
  for (index = 0; index < byte_length; index += 1) {
    output[index * 2u] = digits[bytes[index] >> 4u];
    output[index * 2u + 1u] = digits[bytes[index] & 0x0fu];
  }
  output[byte_length * 2u] = '\0';
  return SPECTRA_VDF_STATUS_OK;
}

static spectra_vdf_status validate_parameters(
  const char *modulus_hex,
  const char *base_hex,
  uint32_t iterations,
  size_t *modulus_bytes
) {
  const size_t hex_length = modulus_hex == NULL ? 0u : strlen(modulus_hex);
  const size_t byte_length = hex_length / 2u;
  if (
    hex_length == 0u ||
    hex_length % 2u != 0u ||
    byte_length < SPECTRA_VDF_MIN_MODULUS_BYTES ||
    byte_length > SPECTRA_VDF_MAX_MODULUS_BYTES ||
    base_hex == NULL ||
    strlen(base_hex) != hex_length ||
    iterations == 0u ||
    iterations > SPECTRA_VDF_MAX_ITERATIONS
  ) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  *modulus_bytes = byte_length;
  return SPECTRA_VDF_STATUS_OK;
}

static spectra_vdf_status import_and_validate_group(
  const char *modulus_hex,
  const char *base_hex,
  size_t modulus_bytes,
  mp_int *modulus,
  mp_int *base,
  mp_int *gcd
) {
  spectra_vdf_status status = import_hex(modulus, modulus_hex, modulus_bytes);
  if (status != SPECTRA_VDF_STATUS_OK) return status;
  if (mp_cmp_d(modulus, 3u) != MP_GT || mp_isodd(modulus) != MP_YES) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  status = import_hex(base, base_hex, modulus_bytes);
  if (status != SPECTRA_VDF_STATUS_OK) return status;
  if (mp_cmp_d(base, 1u) != MP_GT || mp_cmp(base, modulus) != MP_LT) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  if (mp_gcd(base, modulus, gcd) != MP_OKAY) return SPECTRA_VDF_STATUS_INTERNAL_ERROR;
  return mp_cmp_d(gcd, 1u) == MP_EQ
    ? SPECTRA_VDF_STATUS_OK
    : SPECTRA_VDF_STATUS_INVALID_INPUT;
}

static int should_stop(void *context, spectra_vdf_is_cancelled is_cancelled) {
  return is_cancelled != NULL && is_cancelled(context) != 0;
}

static void report_progress(
  void *context,
  spectra_vdf_progress progress,
  uint32_t completed,
  uint32_t total
) {
  if (progress != NULL) progress(context, completed, total);
}

spectra_vdf_status spectra_vdf_evaluate(
  const char *modulus_hex,
  const char *base_hex,
  uint32_t iterations,
  char *output_hex,
  size_t output_hex_capacity,
  void *callback_context,
  spectra_vdf_is_cancelled is_cancelled,
  spectra_vdf_progress progress
) {
  mp_int modulus;
  mp_int base;
  mp_int gcd;
  mp_int output;
  mp_int next;
  size_t modulus_bytes = 0;
  uint32_t iteration;
  spectra_vdf_status status = validate_parameters(
    modulus_hex,
    base_hex,
    iterations,
    &modulus_bytes
  );
  if (status != SPECTRA_VDF_STATUS_OK) return status;
  if (mp_init_multi(&modulus, &base, &gcd, &output, &next, NULL) != MP_OKAY) {
    return SPECTRA_VDF_STATUS_INTERNAL_ERROR;
  }
  status = import_and_validate_group(
    modulus_hex,
    base_hex,
    modulus_bytes,
    &modulus,
    &base,
    &gcd
  );
  if (status != SPECTRA_VDF_STATUS_OK || mp_copy(&base, &output) != MP_OKAY) {
    if (status == SPECTRA_VDF_STATUS_OK) status = SPECTRA_VDF_STATUS_INTERNAL_ERROR;
    goto cleanup;
  }
  for (iteration = 0; iteration < iterations; iteration += 1) {
    if (iteration % SPECTRA_VDF_CHECK_INTERVAL == 0u && should_stop(callback_context, is_cancelled)) {
      status = SPECTRA_VDF_STATUS_CANCELLED;
      goto cleanup;
    }
    if (mp_sqrmod(&output, &modulus, &next) != MP_OKAY) {
      status = SPECTRA_VDF_STATUS_INTERNAL_ERROR;
      goto cleanup;
    }
    mp_exch(&output, &next);
    if (
      (iteration + 1u) % SPECTRA_VDF_CHECK_INTERVAL == 0u ||
      iteration + 1u == iterations
    ) {
      report_progress(callback_context, progress, iteration + 1u, iterations * 2u);
    }
  }
  if (should_stop(callback_context, is_cancelled)) {
    status = SPECTRA_VDF_STATUS_CANCELLED;
    goto cleanup;
  }
  status = export_fixed_hex(&output, modulus_bytes, output_hex, output_hex_capacity);

cleanup:
  mp_clear_multi(&modulus, &base, &gcd, &output, &next, NULL);
  return status;
}

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
) {
  mp_int modulus;
  mp_int base;
  mp_int gcd;
  mp_int prime;
  mp_int exponent;
  mp_int quotient;
  mp_int witness;
  mp_int next;
  size_t modulus_bytes = 0;
  int bit_count;
  int bit;
  spectra_vdf_status status = validate_parameters(
    modulus_hex,
    base_hex,
    iterations,
    &modulus_bytes
  );
  if (status != SPECTRA_VDF_STATUS_OK) return status;
  if (prime_hex == NULL || strlen(prime_hex) != SPECTRA_VDF_PRIME_BYTES * 2u) {
    return SPECTRA_VDF_STATUS_INVALID_INPUT;
  }
  if (
    mp_init_multi(
      &modulus,
      &base,
      &gcd,
      &prime,
      &exponent,
      &quotient,
      &witness,
      &next,
      NULL
    ) != MP_OKAY
  ) {
    return SPECTRA_VDF_STATUS_INTERNAL_ERROR;
  }
  status = import_and_validate_group(
    modulus_hex,
    base_hex,
    modulus_bytes,
    &modulus,
    &base,
    &gcd
  );
  if (status != SPECTRA_VDF_STATUS_OK) goto cleanup;
  status = import_hex(&prime, prime_hex, SPECTRA_VDF_PRIME_BYTES);
  if (status != SPECTRA_VDF_STATUS_OK || mp_cmp_d(&prime, 2u) != MP_GT) {
    if (status == SPECTRA_VDF_STATUS_OK) status = SPECTRA_VDF_STATUS_INVALID_INPUT;
    goto cleanup;
  }
  if (
    mp_2expt(&exponent, (int)iterations) != MP_OKAY ||
    mp_div(&exponent, &prime, &quotient, NULL) != MP_OKAY ||
    mp_copy(&quotient, &exponent) != MP_OKAY
  ) {
    status = SPECTRA_VDF_STATUS_INTERNAL_ERROR;
    goto cleanup;
  }
  mp_set_u32(&witness, 1u);
  bit_count = mp_count_bits(&exponent);
  for (bit = 0; bit < bit_count; bit += 1) {
    if (
      (uint32_t)bit % SPECTRA_VDF_CHECK_INTERVAL == 0u &&
      should_stop(callback_context, is_cancelled)
    ) {
      status = SPECTRA_VDF_STATUS_CANCELLED;
      goto cleanup;
    }
    if (mp_get_bit(&exponent, bit) != 0) {
      if (mp_mulmod(&witness, &base, &modulus, &next) != MP_OKAY) {
        status = SPECTRA_VDF_STATUS_INTERNAL_ERROR;
        goto cleanup;
      }
      mp_exch(&witness, &next);
    }
    if (mp_sqrmod(&base, &modulus, &next) != MP_OKAY) {
      status = SPECTRA_VDF_STATUS_INTERNAL_ERROR;
      goto cleanup;
    }
    mp_exch(&base, &next);
    if (
      ((uint32_t)bit + 1u) % SPECTRA_VDF_CHECK_INTERVAL == 0u ||
      bit + 1 == bit_count
    ) {
      report_progress(
        callback_context,
        progress,
        iterations + (uint32_t)bit + 1u,
        iterations * 2u
      );
    }
  }
  if (should_stop(callback_context, is_cancelled)) {
    status = SPECTRA_VDF_STATUS_CANCELLED;
    goto cleanup;
  }
  status = export_fixed_hex(&witness, modulus_bytes, proof_hex, proof_hex_capacity);
  if (status == SPECTRA_VDF_STATUS_OK) {
    report_progress(callback_context, progress, iterations * 2u, iterations * 2u);
  }

cleanup:
  mp_clear_multi(
    &modulus,
    &base,
    &gcd,
    &prime,
    &exponent,
    &quotient,
    &witness,
    &next,
    NULL
  );
  return status;
}

const char *spectra_vdf_status_message(spectra_vdf_status status) {
  switch (status) {
    case SPECTRA_VDF_STATUS_OK:
      return "ok";
    case SPECTRA_VDF_STATUS_INVALID_INPUT:
      return "invalid_input";
    case SPECTRA_VDF_STATUS_CANCELLED:
      return "cancelled";
    case SPECTRA_VDF_STATUS_INTERNAL_ERROR:
      return "internal_error";
    default:
      return "unknown_error";
  }
}
