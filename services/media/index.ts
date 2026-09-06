/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export {
  uploadEncryptedMedia,
  downloadAndDecryptMedia,
} from './mediaService'

export type {
  UploadedMedia,
  MediaUploadProgress,
  MediaDownloadProgress,
} from './mediaService'

export {
  initializeMediaCache,
  cacheMediaFromFile,
  registerCachedMedia,
  isMediaCached,
  getLocalMediaUri,
  getMediaCacheDirectory,
  deleteCachedMedia,
  deleteConversationMedia,
  clearMediaCache,
  clearMediaCacheScope,
  resolveAttachmentUris,
} from './localMediaCache'

export type {
  CachedMedia,
} from './localMediaCache'

export {
  clearEncryptedAvatarCache,
  clearEncryptedAvatarMemoryCache,
  evictEncryptedAvatar,
  loadEncryptedAvatar,
  primeEncryptedAvatar,
} from './avatarImageCache'

export {
  clearTransientRenderCache,
  initializeTransientRenderCache,
  isTransientRenderUri,
  protectSensitiveFilePath,
} from './transientRenderCache'

export {
  MediaExportError,
  ensureLocalAttachmentUri,
  openAttachmentExternally,
  saveImageToLibrary,
  shareAttachment,
} from './exportService'

export {
  cleanupEditedAttachments,
  clearEditedImageCache,
  createEditedImageAttachment,
  deleteEditedImageUris,
  deleteEditedImageUri,
  isEditedImageAttachment,
} from './editedImageCache'

export type {
  MediaExportErrorCode,
  MediaExportOptions,
} from './exportService'

export type {
  EditedImageFormat,
  EditedImageResult,
} from './editedImageCache'

export {
  hasMediaLibraryAccess,
  isPreparedOutgoingMediaAttachment,
  normalizeOutgoingFileUri,
  normalizeOutgoingMediaAttachment,
  prepareOutgoingMediaAttachment,
  releasePreparedOutgoingMediaAttachment,
} from './outgoingAttachment'

export type {
  NormalizedOutgoingFile,
  OutgoingFileSource,
  PreparedOutgoingMediaAttachment,
} from './outgoingAttachment'

export {
  flushMediaSendCleanup,
  listMediaSendOutbox,
  markMediaSendRelayAccepted,
  recordMediaSendRelayOutcome,
  registerMediaSendUpload,
  requestMediaSendAbandonment,
  requestMediaSendAbandonmentForSend,
  scheduleMediaSendCleanup,
} from './mediaSendOutbox'

export type {
  MediaSendOutboxEntry,
  MediaSendOutboxState,
  MediaSendRelayOutcome,
  RegisterMediaSendUploadInput,
} from './mediaSendOutbox'

export {
  deleteAppOwnedMediaIngress,
  inspectMediaIngressBytes,
  isAppOwnedMediaIngressUri,
  MediaIngressError,
  stageAndValidateMediaIngress,
} from './mediaIngress'

export type {
  MediaIngressOptions,
  MediaIngressSource,
  ValidatedMediaIngress,
} from './mediaIngress'
