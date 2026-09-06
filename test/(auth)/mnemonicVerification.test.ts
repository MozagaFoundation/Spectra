/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  areMnemonicAnswersCorrect,
  createMnemonicVerificationChallenge,
  splitMnemonicWords,
} from '../../app/(auth)/mnemonicVerification'

const words = Array.from({ length: 24 }, (_, index) => `word${index + 1}`)

function sequenceRandom(values: number[]) {
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
}

describe('mnemonic verification helpers', () => {
  it('splits mnemonic text into normalized words', () => {
    expect(splitMnemonicWords(' word1   word2\nword3 ')).toEqual(['word1', 'word2', 'word3'])
    expect(splitMnemonicWords(undefined)).toEqual([])
  })

  it('creates a deterministic three-word challenge with unique answer options', () => {
    const challenge = createMnemonicVerificationChallenge(
      words,
      sequenceRandom([0.1, 0.5, 0.9, 0.2, 0.3, 0.4, 0.7, 0.8]),
    )

    expect(challenge.indices).toEqual([2, 12, 21])
    expect(challenge.options).toHaveLength(3)
    challenge.options.forEach((options, questionIndex) => {
      expect(options).toHaveLength(4)
      expect(new Set(options).size).toBe(4)
      expect(options).toContain(words[challenge.indices[questionIndex]])
    })
  })

  it('does not loop forever when handed an incomplete mnemonic', () => {
    expect(createMnemonicVerificationChallenge(['alpha', 'beta'])).toEqual({
      indices: expect.arrayContaining([0, 1]),
      options: expect.arrayContaining([
        expect.arrayContaining(['alpha']),
        expect.arrayContaining(['beta']),
      ]),
    })
  })

  it('checks answers against the selected word positions', () => {
    const indices = [0, 4, 23]

    expect(areMnemonicAnswersCorrect(words, indices, ['word1', 'word5', 'word24'])).toBe(true)
    expect(areMnemonicAnswersCorrect(words, indices, ['word1', 'word6', 'word24'])).toBe(false)
  })
})
