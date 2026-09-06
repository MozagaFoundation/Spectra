/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  imageComponent: vi.fn(() => null),
  mediaLightbox: vi.fn(() => null),
  resolveStorageUrl: vi.fn(),
  loadEncryptedAvatar: vi.fn(),
  clearEncryptedAvatarCache: vi.fn(async () => {}),
  spectreEnabled: false,
  torEnabled: false,
  wallet: {
    address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spectreMode: false,
  } as { address: string; spectreMode: boolean } | null,
}))

vi.mock('expo-image', () => ({
  Image: mockState.imageComponent,
}))

vi.mock('@/components/chat/MediaLightbox', () => ({
  MediaLightbox: mockState.mediaLightbox,
}))

vi.mock('@/services/backend/storage', () => ({
  resolveStorageUrl: mockState.resolveStorageUrl,
}))

vi.mock('@/services/media/avatarImageCache', () => ({
  loadEncryptedAvatar: mockState.loadEncryptedAvatar,
  clearEncryptedAvatarCache: mockState.clearEncryptedAvatarCache,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean }) => unknown) => selector({
    enabled: mockState.spectreEnabled,
  }),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: typeof mockState.wallet }) => unknown) => selector({
    wallet: mockState.wallet,
  }),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: (selector: (state: { enabled: boolean }) => unknown) => selector({
    enabled: mockState.torEnabled,
  }),
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeComponentMock } = await import('../../test/componentMocks')
  return createThemeComponentMock()
})

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | undefined | false>) => values.filter(Boolean).join(' '),
}))

const { act, render, screen } = await import('@testing-library/react-native')
const { Avatar } = await import('./Avatar')

describe('Avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.resolveStorageUrl.mockReset()
    mockState.loadEncryptedAvatar.mockReset()
    mockState.clearEncryptedAvatarCache.mockResolvedValue(undefined)
    mockState.spectreEnabled = false
    mockState.torEnabled = false
    mockState.wallet = {
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spectreMode: false,
    }
  })

  it('renders initials fallback when no trusted image resolves', async () => {
    mockState.resolveStorageUrl.mockResolvedValueOnce(null)
    render(<Avatar name="Alice Ada" imageUrl="https://evil.example/avatar.png" />)

    await act(async () => {})

    expect(screen.getByText('AA')).toBeTruthy()
    expect(mockState.mediaLightbox).not.toHaveBeenCalled()
  })

  it('renders resolved storage images and gates preview behind previewable', async () => {
    mockState.resolveStorageUrl.mockResolvedValue('https://backend.test/avatar.jpg')
    mockState.loadEncryptedAvatar.mockResolvedValue('data:image/jpeg;base64,encrypted-cache')
    const view = render(<Avatar name="Alice" imageUrl="backend://avatars/alice.jpg" previewable />)

    await act(async () => {})

    const image = view.root.findByType(mockState.imageComponent as any)
    expect(image.props.source).toEqual({
      uri: 'data:image/jpeg;base64,encrypted-cache',
    })
    expect(image.props.cachePolicy).toBe('memory')

    const stopPropagation = vi.fn()
    await act(async () => {
      view.root.findByType('Pressable' as any).props.onPress({ stopPropagation })
    })

    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(mockState.mediaLightbox).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaType: 'image',
        title: 'Alice',
        uri: 'data:image/jpeg;base64,encrypted-cache',
        visible: true,
        cachePolicy: 'memory',
      }),
      undefined,
    )
  })

  it('renders local contact profile images without a storage lookup', () => {
    const view = render(
      <Avatar name="Alice" imageUrl="data:image/png;base64,AAAA" previewable />,
    )

    expect(view.root.findByType(mockState.imageComponent as any).props.source).toEqual({
      uri: 'data:image/png;base64,AAAA',
    })
    expect(mockState.resolveStorageUrl).not.toHaveBeenCalled()
    expect(mockState.loadEncryptedAvatar).not.toHaveBeenCalled()
  })

  it('hides avatars and clears encrypted avatar caches in Spectre Mode', async () => {
    mockState.spectreEnabled = true

    render(<Avatar name="Alice" imageUrl="backend://avatars/alice.jpg" />)
    await act(async () => {})

    expect(screen.getByText('A')).toBeTruthy()
    expect(mockState.resolveStorageUrl).not.toHaveBeenCalled()
    expect(mockState.loadEncryptedAvatar).not.toHaveBeenCalled()
    expect(mockState.clearEncryptedAvatarCache).toHaveBeenCalled()
  })

  it('does not render the previous avatar after the image source changes', async () => {
    mockState.resolveStorageUrl
      .mockResolvedValueOnce('https://backend.test/alice.jpg')
      .mockImplementationOnce(() => new Promise(() => {}))
    mockState.loadEncryptedAvatar.mockResolvedValueOnce('data:image/jpeg;base64,alice')
    const view = render(<Avatar name="Alice" imageUrl="backend://avatars/alice.jpg" />)
    await act(async () => {})

    await act(async () => {
      view.update(<Avatar name="Bob" imageUrl="backend://avatars/bob.jpg" />)
    })

    expect(screen.getByText('B')).toBeTruthy()
    expect(view.root.findAllByType(mockState.imageComponent as any)).toHaveLength(0)
  })

  it('renders online status without enabling preview for fallback avatars', () => {
    render(<Avatar name="Bob" showOnlineStatus isOnline previewable />)

    expect(screen.getByText('B')).toBeTruthy()
    expect(() => screen.getByTestId('avatar-preview')).toThrow()
  })
})
