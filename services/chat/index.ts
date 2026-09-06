/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

// Chat service
export {
  initializeChat,
  reconcileChat,
  refreshChatList,
  cleanupChat,
  waitForChatQuiescence,
  resolveIdentityId,
  getConversation,
  ensureConversationExists,
  activateConversation,
  deactivateConversation,
  sendMessage,
  retryFailedMessage,
  DIRECT_CHAT_CACHE_PAGE_SIZE,
  loadCachedMessagesForConversation,
  loadCachedContactsList,
  loadCachedConversationsList,
  prewarmRecentDirectMessages,
  getMessagesForConversation,
  clearConversationChat,
  markConversationAsRead,
  persistDirectMessageLocalOrder,
  scheduleDirectSendReadiness,
  setConversationDisappearingTimer,
  getMyPublicKeyBundle,
  getSafetyNumber,
  sendReaction,
  consumeViewOnceMessage,
  revealViewOnceMessage,
  deleteMessageForAll,
  deleteMessageLocally,
  deleteConversation,
  deleteConversationForBoth,
  deleteContact,
  renameContact,
  blockContact,
  unblockContact,
  isContactBlocked,
} from './chatService'
export { activateChatPersona, activateChatPersonaByAddress } from './personaSwitch'

// Group chat
export {
  MAX_GROUP_CHAT_MEMBERS,
  addGroupMembers,
  createEncryptedGroup,
  deleteGroupMessageForAll,
  getGroupIdFromRouteParam,
  getGroupRouteParam,
  isGroupRouteParam,
  leaveGroup,
  loadCachedGroupConversations,
  loadCachedGroupMessages,
  loadGroupMessages,
  loadOlderGroupMessages,
  markGroupAsRead,
  removeGroupMember,
  retryFailedGroupMessage,
  sendGroupCryptoPaymentRequestUpdate,
  sendGroupMessage,
  sendGroupReaction,
  updateGroupAvatar,
  updateGroupDisappearingTimer,
  uploadGroupAvatar,
} from '../groupChat'

// Quantum chat pass-through
export {
  isQuantumChatInitialized,
  getQuantumChatClient,
  getIdentity,
  acceptContactIdentityReplacement,
  addContact,
  addContactByInvite,
  addContactByAddress,
  fetchContactBundle,
  loadOlderMessages,
  pollForNewMessages,
  applyCryptoPaymentRequestUpdate,
  sendDisappearingTimerState,
  sendScreenshotProtectionState,
  syncDisappearingTimerStateIfNeeded,
  syncScreenshotProtectionStateIfNeeded,
  syncScreenshotProtectionStateForRecipients,
} from '../quantumChat'
export type { ContactIdentityReplacement } from '../quantumChat'
