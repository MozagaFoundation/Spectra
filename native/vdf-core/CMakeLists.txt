cmake_minimum_required(VERSION 3.10)

project(spectra_vdf_core LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_NO_PACKAGE_REGISTRY ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

add_subdirectory(vendor/libtommath EXCLUDE_FROM_ALL)

add_library(spectra_vdf_core STATIC spectra_vdf_core.c)
target_include_directories(spectra_vdf_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(spectra_vdf_core PUBLIC libtommath)

option(SPECTRA_VDF_CORE_TESTS "Build VDF interoperability tests" OFF)
if(SPECTRA_VDF_CORE_TESTS)
  add_executable(spectra_vdf_core_vectors test/core_vectors.c)
  target_link_libraries(spectra_vdf_core_vectors PRIVATE spectra_vdf_core)
endif()
