#include <jni.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <string>
#include <vector>

#include "../spectra_vdf_core.h"

namespace {

struct NativeVdfJob {
  std::atomic_bool cancelled{false};
};

struct ProgressContext {
  JNIEnv *env;
  jobject module;
  jmethodID callback;
  jstring job_id;
  const char *phase;
  NativeVdfJob *job;
  std::chrono::steady_clock::time_point last_reported{};
};

int is_cancelled(void *context) {
  auto *progress = static_cast<ProgressContext *>(context);
  return progress != nullptr &&
    progress->job != nullptr &&
    progress->job->cancelled.load(std::memory_order_relaxed);
}

void emit_progress(
  void *context,
  uint32_t completed_iterations,
  uint32_t total_iterations
) {
  auto *progress = static_cast<ProgressContext *>(context);
  const auto now = std::chrono::steady_clock::now();
  if (
    completed_iterations != total_iterations &&
    progress->last_reported.time_since_epoch().count() != 0 &&
    now - progress->last_reported < std::chrono::milliseconds(250)
  ) {
    return;
  }
  progress->last_reported = now;
  jstring phase = progress->env->NewStringUTF(progress->phase);
  progress->env->CallVoidMethod(
    progress->module,
    progress->callback,
    progress->job_id,
    phase,
    static_cast<jint>(completed_iterations),
    static_cast<jint>(total_iterations)
  );
  progress->env->DeleteLocalRef(phase);
  if (progress->env->ExceptionCheck()) progress->env->ExceptionClear();
}

jobjectArray result(
  JNIEnv *env,
  spectra_vdf_status status,
  const char *value
) {
  jclass string_class = env->FindClass("java/lang/String");
  jobjectArray values = env->NewObjectArray(2, string_class, nullptr);
  const std::string status_value = std::to_string(static_cast<int>(status));
  env->SetObjectArrayElement(values, 0, env->NewStringUTF(status_value.c_str()));
  env->SetObjectArrayElement(values, 1, env->NewStringUTF(value == nullptr ? "" : value));
  return values;
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_mozaga_exo_VdfModule_nativeCreateJob(JNIEnv *, jobject) {
  return reinterpret_cast<jlong>(new NativeVdfJob());
}

extern "C" JNIEXPORT void JNICALL
Java_com_mozaga_exo_VdfModule_nativeDestroyJob(JNIEnv *, jobject, jlong handle) {
  delete reinterpret_cast<NativeVdfJob *>(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_com_mozaga_exo_VdfModule_nativeCancel(JNIEnv *, jobject, jlong handle) {
  auto *job = reinterpret_cast<NativeVdfJob *>(handle);
  if (job != nullptr) job->cancelled.store(true, std::memory_order_relaxed);
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_mozaga_exo_VdfModule_nativeEvaluate(
  JNIEnv *env,
  jobject module,
  jlong handle,
  jstring job_id,
  jstring modulus_hex,
  jstring base_hex,
  jint iterations
) {
  auto *job = reinterpret_cast<NativeVdfJob *>(handle);
  if (job == nullptr || job_id == nullptr || modulus_hex == nullptr || base_hex == nullptr) {
    return result(env, SPECTRA_VDF_STATUS_INVALID_INPUT, "");
  }
  const char *modulus = env->GetStringUTFChars(modulus_hex, nullptr);
  const char *base = env->GetStringUTFChars(base_hex, nullptr);
  if (modulus == nullptr || base == nullptr) {
    if (modulus != nullptr) env->ReleaseStringUTFChars(modulus_hex, modulus);
    if (base != nullptr) env->ReleaseStringUTFChars(base_hex, base);
    return result(env, SPECTRA_VDF_STATUS_INTERNAL_ERROR, "");
  }
  std::vector<char> output(std::strlen(modulus) + 1u);
  jclass module_class = env->GetObjectClass(module);
  jmethodID callback = env->GetMethodID(
    module_class,
    "onNativeProgress",
    "(Ljava/lang/String;Ljava/lang/String;II)V"
  );
  ProgressContext progress{env, module, callback, job_id, "evaluate", job};
  const spectra_vdf_status status = spectra_vdf_evaluate(
    modulus,
    base,
    static_cast<uint32_t>(iterations),
    output.data(),
    output.size(),
    &progress,
    is_cancelled,
    callback == nullptr ? nullptr : emit_progress
  );
  env->ReleaseStringUTFChars(modulus_hex, modulus);
  env->ReleaseStringUTFChars(base_hex, base);
  return result(env, status, status == SPECTRA_VDF_STATUS_OK ? output.data() : "");
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_mozaga_exo_VdfModule_nativeProve(
  JNIEnv *env,
  jobject module,
  jlong handle,
  jstring job_id,
  jstring modulus_hex,
  jstring base_hex,
  jstring prime_hex,
  jint iterations
) {
  auto *job = reinterpret_cast<NativeVdfJob *>(handle);
  if (
    job == nullptr ||
    job_id == nullptr ||
    modulus_hex == nullptr ||
    base_hex == nullptr ||
    prime_hex == nullptr
  ) {
    return result(env, SPECTRA_VDF_STATUS_INVALID_INPUT, "");
  }
  const char *modulus = env->GetStringUTFChars(modulus_hex, nullptr);
  const char *base = env->GetStringUTFChars(base_hex, nullptr);
  const char *prime = env->GetStringUTFChars(prime_hex, nullptr);
  if (modulus == nullptr || base == nullptr || prime == nullptr) {
    if (modulus != nullptr) env->ReleaseStringUTFChars(modulus_hex, modulus);
    if (base != nullptr) env->ReleaseStringUTFChars(base_hex, base);
    if (prime != nullptr) env->ReleaseStringUTFChars(prime_hex, prime);
    return result(env, SPECTRA_VDF_STATUS_INTERNAL_ERROR, "");
  }
  std::vector<char> output(std::strlen(modulus) + 1u);
  jclass module_class = env->GetObjectClass(module);
  jmethodID callback = env->GetMethodID(
    module_class,
    "onNativeProgress",
    "(Ljava/lang/String;Ljava/lang/String;II)V"
  );
  ProgressContext progress{env, module, callback, job_id, "prove", job};
  const spectra_vdf_status status = spectra_vdf_prove(
    modulus,
    base,
    prime,
    static_cast<uint32_t>(iterations),
    output.data(),
    output.size(),
    &progress,
    is_cancelled,
    callback == nullptr ? nullptr : emit_progress
  );
  env->ReleaseStringUTFChars(modulus_hex, modulus);
  env->ReleaseStringUTFChars(base_hex, base);
  env->ReleaseStringUTFChars(prime_hex, prime);
  return result(env, status, status == SPECTRA_VDF_STATUS_OK ? output.data() : "");
}
