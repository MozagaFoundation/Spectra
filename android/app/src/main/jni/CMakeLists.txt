#
# Copyright (c) 2026 MOZAGA FOUNDATION.
# SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
# See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
#

cmake_minimum_required(VERSION 3.22.1)

project(appmodules LANGUAGES C CXX)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

add_subdirectory(
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../native/vdf-core/android"
  "${CMAKE_CURRENT_BINARY_DIR}/spectra-vdf"
)
add_subdirectory(
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../native/mldsa-core/android"
  "${CMAKE_CURRENT_BINARY_DIR}/spectra-mldsa"
)
add_subdirectory(
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../native/mlkem-core/android"
  "${CMAKE_CURRENT_BINARY_DIR}/spectra-mlkem"
)
