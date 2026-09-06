/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { verifyContributionRecipients } from './contributionRecipients'

const payloadBase64 = 'eyJ2ZXJzaW9uIjoxLCJpc3N1ZWRBdCI6IjIwMjYtMDYtMTRUMDA6MDA6MDBaIiwicmVjaXBpZW50cyI6eyJtb3phZ2EiOnsiYWRkcmVzcyI6IkVYTzAwYWM1ZDUwM2YwNjZlNGYwZjlkMTliZTg4YTA1MDY0NGM5NjU3YzUifSwiZXRoZXJldW0iOnsiYWRkcmVzcyI6IjB4Mzk5ZUM2NDYxYmQ3NzQ5RWU3MEVkMDU4QzY2REYxMWNhMDk3NUM0MCJ9LCJiaXRjb2luIjp7ImFkZHJlc3MiOiJiYzFxdXR3NG0yemFmbW0wcWs1a3VrOG51amEzZDd0N2ZlaHZ6ZzVtNXUifSwic29sYW5hIjp7ImFkZHJlc3MiOiI4THV5UHF0elBLQ1BCMnppTUdISHdaSGpUalZObVVYODRtVlN6WXFZWWVrRyJ9LCJ0cm9uIjp7ImFkZHJlc3MiOiJUSk1DaWVEYkhmdTVnM0diM3hoeWhnWWlBSGdndDFoeU5EIn19fQ=='
const signature = 'odfKzMw+1JFfC2W9hnKT+ltoI2Q5GcGm1WEUqQxTxQvBkuhWWH5VkAyjynU8cY2seuvj22Bs1rEKK6FElyteAg=='
const rotatedPayloadBase64 = 'eyJ2ZXJzaW9uIjoxLCJpc3N1ZWRBdCI6IjIwMjYtMDctMjhUMDA6MDA6MDBaIiwicmVjaXBpZW50cyI6eyJtb3phZ2EiOnsiYWRkcmVzcyI6IkVYTzAwMWYwYjhmOTZiOGU0ZWIwMzUzYWQ3YmNhOTkwZGI5YTljNGQ1OTUifSwiZXRoZXJldW0iOnsiYWRkcmVzcyI6IjB4NDgxNjNiRTBCNzhBRTIxMzY3NjlBNWZjOUQ3NDYzM0EyMzVEYzNjNSJ9LCJiaXRjb2luIjp7ImFkZHJlc3MiOiJiYzFxcWMyZ3dlYWg5ZXZtNDd3d2pscmZoNjdybDRuOHl3MnZkbDQ2NHQifSwic29sYW5hIjp7ImFkZHJlc3MiOiI5VEI3QWViWXZxZzJWYks1U1JrZWVWYmd1NGJCcHU2UllWR0h3RmFyNWtESyJ9LCJ0cm9uIjp7ImFkZHJlc3MiOiJURmJVOVNjSnFMWVlDS0NFVnlqVGt3SGM4MW00NlNoMlJ4In19fQ=='
const rotatedSignature = 'FhmF4ukYFFNE5UQcXoQmImTSVyReOlW3Aw94zffB7NduYCpk/REt1R1xtqb1wVSYqy+4K05UpSEE9aELiQzWDA=='

describe('contributionRecipients', () => {
  it('verifies signed recipient config', () => {
    const result = verifyContributionRecipients({
      keyId: 'contrib-2026-06',
      payload: {},
      payloadBase64,
      signature,
    })

    expect(result.recipients.ethereum).toBe('0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40')
    expect(result.recipients.bitcoin).toBe('bc1qutw4m2zafmm0qk5kuk8nuja3d7t7fehvzg5m5u')
  })

  it('rejects tampered payloads', () => {
    expect(() => verifyContributionRecipients({
      keyId: 'contrib-2026-06',
      payload: {},
      payloadBase64: payloadBase64.replace('Mzk5', 'AAAA'),
      signature,
    })).toThrow('Invalid contribution recipients signature')
  })

  it('verifies the backend signing key rotation', () => {
    const result = verifyContributionRecipients({
      keyId: 'contrib-2026-07',
      payload: {},
      payloadBase64: rotatedPayloadBase64,
      signature: rotatedSignature,
    })

    expect(result.recipients).toEqual({
      mozaga: 'EXO001f0b8f96b8e4eb0353ad7bca990db9a9c4d595',
      ethereum: '0x48163bE0B78AE2136769A5fc9D74633A235Dc3c5',
      bitcoin: 'bc1qqc2gweah9evm47wwjlrfh67rl4n8yw2vdl464t',
      solana: '9TB7AebYvqg2VbK5SRkeeVbgu4bBpu6RYVGHwFar5kDK',
      tron: 'TFbU9ScJqLYYCKCEVyjTkwHc81m46Sh2Rx',
    })
  })

  it('rejects unexpected key ids', () => {
    expect(() => verifyContributionRecipients({
      keyId: 'old-key',
      payload: {},
      payloadBase64,
      signature,
    })).toThrow('Unexpected contribution recipients key')
  })
})
