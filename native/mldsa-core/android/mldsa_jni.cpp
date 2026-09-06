#include <jni.h>

#include <cstddef>
#include <cstdint>
#include <cstring>

#include "../spectra_mldsa65.h"
#include "../../pq-common/spectra_secure_wipe.h"

static void release_abort(JNIEnv *env, jbyteArray array, jbyte *bytes) {
  if (array != nullptr && bytes != nullptr) {
    env->ReleaseByteArrayElements(array, bytes, JNI_ABORT);
  }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_mozaga_exo_MlDsaModule_nativeVerify(
  JNIEnv *env,
  jobject,
  jbyteArray public_key,
  jbyteArray signature,
  jbyteArray message
) {
  if (public_key == nullptr || signature == nullptr || message == nullptr) {
    return JNI_FALSE;
  }

  const jsize public_key_len = env->GetArrayLength(public_key);
  const jsize signature_len = env->GetArrayLength(signature);
  const jsize message_len = env->GetArrayLength(message);
  if (public_key_len < 0 || signature_len < 0 || message_len < 0) {
    return JNI_FALSE;
  }

  jbyte *public_key_bytes = env->GetByteArrayElements(public_key, nullptr);
  jbyte *signature_bytes = env->GetByteArrayElements(signature, nullptr);
  jbyte *message_bytes = env->GetByteArrayElements(message, nullptr);
  if (
    public_key_bytes == nullptr
    || signature_bytes == nullptr
    || (message_len > 0 && message_bytes == nullptr)
  ) {
    release_abort(env, public_key, public_key_bytes);
    release_abort(env, signature, signature_bytes);
    release_abort(env, message, message_bytes);
    return JNI_FALSE;
  }

  const int valid = spectra_mldsa65_verify(
    reinterpret_cast<const uint8_t *>(public_key_bytes),
    static_cast<size_t>(public_key_len),
    reinterpret_cast<const uint8_t *>(signature_bytes),
    static_cast<size_t>(signature_len),
    reinterpret_cast<const uint8_t *>(message_bytes),
    static_cast<size_t>(message_len)
  );

  release_abort(env, public_key, public_key_bytes);
  release_abort(env, signature, signature_bytes);
  release_abort(env, message, message_bytes);
  return valid ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_mozaga_exo_MlDsaModule_nativeSign(
  JNIEnv *env,
  jobject,
  jbyteArray secret_key,
  jbyteArray message
) {
  if (secret_key == nullptr || message == nullptr) {
    return nullptr;
  }

  const jsize secret_key_len = env->GetArrayLength(secret_key);
  const jsize message_len = env->GetArrayLength(message);
  if (secret_key_len != SPECTRA_MLDSA65_SECRETKEYBYTES || message_len < 0) {
    return nullptr;
  }

  jbyte *secret_key_bytes = env->GetByteArrayElements(secret_key, nullptr);
  jbyte *message_bytes = env->GetByteArrayElements(message, nullptr);
  if (
    secret_key_bytes == nullptr
    || (message_len > 0 && message_bytes == nullptr)
  ) {
    release_abort(env, secret_key, secret_key_bytes);
    release_abort(env, message, message_bytes);
    return nullptr;
  }

  jbyteArray signature = env->NewByteArray(SPECTRA_MLDSA65_SIGNATUREBYTES);
  if (signature == nullptr) {
    spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
    env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
    release_abort(env, message, message_bytes);
    return nullptr;
  }
  jbyte *signature_bytes = env->GetByteArrayElements(signature, nullptr);
  if (signature_bytes == nullptr) {
    spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
    env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
    release_abort(env, message, message_bytes);
    return nullptr;
  }

  const int ok = spectra_mldsa65_sign(
    reinterpret_cast<const uint8_t *>(secret_key_bytes),
    static_cast<size_t>(secret_key_len),
    reinterpret_cast<const uint8_t *>(message_bytes),
    static_cast<size_t>(message_len),
    reinterpret_cast<uint8_t *>(signature_bytes),
    SPECTRA_MLDSA65_SIGNATUREBYTES
  );

  spectra_secure_wipe(secret_key_bytes, static_cast<size_t>(secret_key_len));
  env->ReleaseByteArrayElements(secret_key, secret_key_bytes, 0);
  env->ReleaseByteArrayElements(signature, signature_bytes, ok ? 0 : JNI_ABORT);
  release_abort(env, message, message_bytes);
  if (!ok) {
    return nullptr;
  }
  return signature;
}
