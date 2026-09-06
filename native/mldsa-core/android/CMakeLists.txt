cmake_minimum_required(VERSION 3.22.1)

project(spectra_mldsa_android LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

set(MLDSA_CORE_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
add_subdirectory(
  "${MLDSA_CORE_ROOT}"
  "${CMAKE_CURRENT_BINARY_DIR}/spectra-mldsa-core"
  EXCLUDE_FROM_ALL
)

add_library(mldsa_jni SHARED mldsa_jni.cpp)
target_include_directories(mldsa_jni PRIVATE "${MLDSA_CORE_ROOT}")
target_link_libraries(mldsa_jni PRIVATE spectra_mldsa_core)
set_target_properties(mldsa_jni PROPERTIES
  C_VISIBILITY_PRESET hidden
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON
)
