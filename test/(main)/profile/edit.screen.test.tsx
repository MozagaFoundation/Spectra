/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  updateOwnContactProfile: vi.fn(async (_identityId: string, input: { avatarDataUri?: string }) => ({
    version: 1,
    identityId: 'identity-a',
    revision: 2,
    avatarDataUri: input.avatarDataUri,
    signature: '0xsignature',
  })),
  pickImage: vi.fn(async () => ({
    canceled: false,
    assets: [{
      uri: 'file:///avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1_024,
    }],
  })),
  manipulate: vi.fn(async () => ({ uri: 'file:///avatar.jpg', base64: 'AAAA' })),
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  notificationAsync: vi.fn(async () => {}),
}))
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ status: 'granted', accessPrivileges: 'all' })),
  launchImageLibraryAsync: mockState.pickImage,
}))
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: mockState.manipulate,
}))
vi.mock('@spectra/core-crypto', () => ({
  MAX_CONTACT_PROFILE_AVATAR_BYTES: 128 * 1024,
}))
vi.mock('@/services/media/outgoingAttachment', () => ({
  normalizeOutgoingFileUri: vi.fn(async (value) => value),
}))
vi.mock('@/services/chat/contactProfile', () => ({
  ensureOwnContactProfile: vi.fn(async () => ({
    version: 1,
    identityId: 'identity-a',
    revision: 1,
    signature: '0xsignature',
  })),
  updateOwnContactProfile: mockState.updateOwnContactProfile,
}))
vi.mock('@/services/quantumChat', () => ({
  getIdentity: () => ({ id: 'identity-a' }),
}))
vi.mock('@/store', () => ({
  useWalletStore: () => ({
    wallet: { id: 'wallet-a', displayName: 'Auditor' },
    updateWallet: vi.fn(async () => {}),
  }),
}))
vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean }) => unknown) => selector({ enabled: false }),
}))
vi.mock('@/hooks/useGuardedRouter', () => ({ useGuardedRouter: () => ({ back: vi.fn() }) }))
vi.mock('@/lib/i18n', () => ({ translate: (key: string) => key }))
vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})
vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../../test/mainScreenMocks')
  return { Avatar: TestAvatar }
})
vi.mock('@/components/ui', async () => {
  const { MockInput } = await import('../../../test/mainScreenMocks')
  return { Input: MockInput }
})
vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return { Camera: TestIcon, ChevronLeft: TestIcon }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: EditProfileScreen } = await import('../../../app/(main)/profile/edit')

describe('EditProfileScreen', () => {
  beforeEach(() => {
    mockState.updateOwnContactProfile.mockClear()
    mockState.pickImage.mockClear()
    mockState.manipulate.mockClear()
  })

  it('stores a resized profile photo locally', async () => {
    render(<EditProfileScreen />)
    await act(async () => {})

    await fireEvent.press(screen.getByText('Change Photo').parent!)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockState.manipulate).toHaveBeenCalled()
    expect(mockState.updateOwnContactProfile).toHaveBeenCalledWith('identity-a', {
      avatarDataUri: 'data:image/jpeg;base64,AAAA',
    })
  })
})
