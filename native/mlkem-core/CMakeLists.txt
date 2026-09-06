cmake_minimum_required(VERSION 3.10)

project(spectra_mlkem_core LANGUAGES C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

set(PQCLEAN_CLEAN "${CMAKE_CURRENT_SOURCE_DIR}/vendor/pqclean/crypto_kem/ml-kem-768/clean")
set(PQCLEAN_COMMON "${CMAKE_CURRENT_SOURCE_DIR}/vendor/pqclean/common")
set(PQ_COMMON "${CMAKE_CURRENT_SOURCE_DIR}/../pq-common")

add_library(spectra_mlkem_core STATIC
  spectra_mlkem768.c
  "${PQ_COMMON}/randombytes_platform.c"
  "${PQ_COMMON}/spectra_secure_wipe.c"
  "${PQ_COMMON}/fips202.c"
  "${PQCLEAN_CLEAN}/cbd.c"
  "${PQCLEAN_CLEAN}/indcpa.c"
  "${PQCLEAN_CLEAN}/kem.c"
  "${PQCLEAN_CLEAN}/ntt.c"
  "${PQCLEAN_CLEAN}/poly.c"
  "${PQCLEAN_CLEAN}/polyvec.c"
  "${PQCLEAN_CLEAN}/reduce.c"
  "${PQCLEAN_CLEAN}/symmetric-shake.c"
  "${PQCLEAN_CLEAN}/verify.c"
)
target_include_directories(spectra_mlkem_core PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${PQ_COMMON}"
  "${PQCLEAN_COMMON}"
  "${PQCLEAN_CLEAN}"
)
target_compile_options(spectra_mlkem_core PRIVATE
  "SHELL:-include \"${PQ_COMMON}/fips202_prefix.h\""
)
set_target_properties(spectra_mlkem_core PROPERTIES
  C_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON
)
if(APPLE)
  target_link_libraries(spectra_mlkem_core PUBLIC "-framework Security")
endif()

option(SPECTRA_MLKEM_CORE_TESTS "Build ML-KEM-768 interoperability tests" OFF)
if(SPECTRA_MLKEM_CORE_TESTS)
  add_executable(spectra_mlkem_core_vectors test/core_vectors.c)
  target_link_libraries(spectra_mlkem_core_vectors PRIVATE spectra_mlkem_core)
  add_executable(spectra_mlkem_noble_interop test/noble_interop.c)
  target_link_libraries(spectra_mlkem_noble_interop PRIVATE spectra_mlkem_core)
  add_executable(spectra_mlkem_encaps_interop test/encaps_interop.c)
  target_link_libraries(spectra_mlkem_encaps_interop PRIVATE spectra_mlkem_core)
endif()
