cmake_minimum_required(VERSION 3.22.1)

project(spectra_mlkem_android LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

set(MLKEM_CORE_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
add_subdirectory(
  "${MLKEM_CORE_ROOT}"
  "${CMAKE_CURRENT_BINARY_DIR}/spectra-mlkem-core"
  EXCLUDE_FROM_ALL
)

add_library(mlkem_jni SHARED mlkem_jni.cpp)
target_include_directories(mlkem_jni PRIVATE "${MLKEM_CORE_ROOT}")
target_link_libraries(mlkem_jni PRIVATE spectra_mlkem_core)
set_target_properties(mlkem_jni PROPERTIES
  C_VISIBILITY_PRESET hidden
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON
)
