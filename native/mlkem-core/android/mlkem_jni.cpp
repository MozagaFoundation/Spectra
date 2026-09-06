#include <jni.h>

#include <cstddef>
#include <cstdint>
#include <cstring>

#include "../spectra_mlkem768.h"
#include "../../pq-common/spectra_secure_wipe.h"

static void release_abort(JNIEnv *env, jbyteArray array, jbyte *bytes) {
  if (array != nullptr && bytes != nullptr) {
    env->ReleaseByteArrayElements(array, bytes, JNI_ABORT);
  }
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_mozaga_exo_MlKemModule_nativeEncaps(
  JNIEnv *env,
  jobject,
  jbyteArray public_key
) {
  if (public_key == nullptr) {
    return nullptr;
  }
  const jsize public_key_len = env->GetArrayLength(public_key);
  if (public_key_len != SPECTRA_MLKEM768_PUBLICKEYBYTES) {
    return nullptr;
  }

  jbyte *public_key_bytes = env->GetByteArrayElements(public_key, nullptr);
  if (public_key_bytes == nullptr) {
    return nullptr;
  }

  const jsize packed_len = SPECTRA_MLKEM768_CIPHERTEXTBYTES + SPECTRA_MLKEM768_SHAREDSECRETBYTES;
  jbyteArray packed = env->NewByteArray(packed_len);
  if (packed == nullptr) {
    release_abort(env, public_key, public_key_bytes);
    return nullptr;
  }
  jbyte *packed_bytes = env->GetByteArrayElements(packed, nullptr);
  if (packed_bytes == nullptr) {
    release_abort(env, public_key, public_key_bytes);
    return nullptr;
  }

  uint8_t *ciphertext = reinterpret_cast<uint8_t *>(packed_bytes);
  uint8_t *shared_secret = ciphertext + SPECTRA_MLKEM768_CIPHERTEXTBYTES;
  const int ok = spectra_mlkem768_encaps(
    reinterpret_cast<const uint8_t *>(public_key_bytes),
    static_cast<size_t>(public_key_len),
    ciphertext,
    SPECTRA_MLKEM768_CIPHERTEXTBYTES,
    shared_secret,
    SPECTRA_MLKEM768_SHAREDSECRETBYTES
  );

  release_abort(env, public_key, public_key_bytes);
  env->ReleaseByteArrayElements(packed, packed_bytes, ok ? 0 : JNI_ABORT);
  if (!ok) {
    return nullptr;
  }
  return packed;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_mozaga_exo_MlKemModule_nativeDecaps(
  JNIEnv *env,
  jobject,
  jbyteArray secret_key,
  jbyteArray ciphertext
) {
  if (secret_key == nullptr || ciphertext == nullptr) {
    return nullptr;
  }
  const jsize secret_key_len = env->GetArrayLength(secret_key);
  const jsize ciphertext_len = env->GetArrayLength(ciphertext);
  if (
    secret_key_len != SPECTRA_MLKEM768_SECRETKEYBYTES
    || ciphertext_len != SPECTRA_MLKEM768_CIPHERTEXTBYTES
  ) {
    return nullptr;
  }

  jbyte *secret_key_bytes = env->GetByteArrayElements(secret_key, nullptr);
  jbyte *ciphertext_bytes = env->GetByteArrayElements(ciphertext, nullptr);
  if (secret_key_bytes == nullptr || ciphertext_bytes == nullptr) {
    release_abort(env, secret_key, secret_key_bytes);
    release_abort(env, ciphertext, ciphertext_bytes);
    return nullptr;
  }

  jbyteArray shared_secret = env->NewByteArray(SPECTRA_MLKEM768_SHAREDSECRETBYTES);
  if (shared_secret == nullptr) {
    spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
    env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
    release_abort(env, ciphertext, ciphertext_bytes);
    return nullptr;
  }
  jbyte *shared_secret_bytes = env->GetByteArrayElements(shared_secret, nullptr);
  if (shared_secret_bytes == nullptr) {
    spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
    env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
    release_abort(env, ciphertext, ciphertext_bytes);
    return nullptr;
  }

  const int ok = spectra_mlkem768_decaps(
    reinterpret_cast<const uint8_t *>(secret_key_bytes),
    static_cast<size_t>(secret_key_len),
    reinterpret_cast<const uint8_t *>(ciphertext_bytes),
    static_cast<size_t>(ciphertext_len),
    reinterpret_cast<uint8_t *>(shared_secret_bytes),
    SPECTRA_MLKEM768_SHAREDSECRETBYTES
  );

  spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
  env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
  release_abort(env, ciphertext, ciphertext_bytes);
  env->ReleaseByteArrayElements(shared_secret, shared_secret_bytes, ok ? 0 : JNI_ABORT);
  if (!ok) {
    return nullptr;
  }
  return shared_secret;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_mozaga_exo_MlKemModule_nativeKeygen(
  JNIEnv *env,
  jobject
) {
  const jsize packed_len = SPECTRA_MLKEM768_PUBLICKEYBYTES + SPECTRA_MLKEM768_SECRETKEYBYTES;
  jbyteArray packed = env->NewByteArray(packed_len);
  if (packed == nullptr) {
    return nullptr;
  }
  jbyte *packed_bytes = env->GetByteArrayElements(packed, nullptr);
  if (packed_bytes == nullptr) {
    return nullptr;
  }

  uint8_t *public_key = reinterpret_cast<uint8_t *>(packed_bytes);
  uint8_t *secret_key = public_key + SPECTRA_MLKEM768_PUBLICKEYBYTES;
  const int ok = spectra_mlkem768_keypair(
    public_key,
    SPECTRA_MLKEM768_PUBLICKEYBYTES,
    secret_key,
    SPECTRA_MLKEM768_SECRETKEYBYTES
  );

  env->ReleaseByteArrayElements(packed, packed_bytes, ok ? 0 : JNI_ABORT);
  if (!ok) {
    return nullptr;
  }
  return packed;
}
