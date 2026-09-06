cmake_minimum_required(VERSION 3.22.1)

project(spectra_vdf_android LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

set(VDF_CORE_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
add_subdirectory(
  "${VDF_CORE_ROOT}/vendor/libtommath"
  "${CMAKE_CURRENT_BINARY_DIR}/libtommath"
  EXCLUDE_FROM_ALL
)

add_library(spectra_vdf_core STATIC
  "${VDF_CORE_ROOT}/spectra_vdf_core.c"
)
target_include_directories(spectra_vdf_core PUBLIC "${VDF_CORE_ROOT}")
target_link_libraries(spectra_vdf_core PUBLIC libtommath)

add_library(vdf_jni SHARED vdf_jni.cpp)
target_include_directories(vdf_jni PRIVATE "${VDF_CORE_ROOT}")
target_link_libraries(vdf_jni PRIVATE spectra_vdf_core)
