/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const VERIFICATION_QUESTION_COUNT = 3
const OPTIONS_PER_QUESTION = 4

export interface MnemonicVerificationChallenge {
  indices: number[]
  options: string[][]
}

type RandomSource = () => number

function pickUniqueIndex(used: Set<number>, wordCount: number, random: RandomSource): number {
  let index = Math.floor(random() * wordCount)

  while (used.has(index)) {
    index = (index + 1) % wordCount
  }

  used.add(index)
  return index
}

function shuffle<T>(values: T[], random: RandomSource): T[] {
  const shuffled = [...values]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

export function splitMnemonicWords(mnemonic: string | undefined): string[] {
  return mnemonic?.trim().split(/\s+/).filter(Boolean) ?? []
}

export function createMnemonicVerificationChallenge(
  words: string[],
  random: RandomSource = Math.random,
): MnemonicVerificationChallenge {
  if (words.length === 0) {
    return { indices: [], options: [] }
  }

  const questionCount = Math.min(VERIFICATION_QUESTION_COUNT, words.length)
  const usedIndices = new Set<number>()
  const indices = Array.from({ length: questionCount }, () => (
    pickUniqueIndex(usedIndices, words.length, random)
  )).sort((a, b) => a - b)
  const uniqueWords = Array.from(new Set(words))

  const options = indices.map((correctIndex) => {
    const correctWord = words[correctIndex]
    const choices = new Set<string>([correctWord])

    while (choices.size < Math.min(OPTIONS_PER_QUESTION, uniqueWords.length)) {
      const candidate = uniqueWords[Math.floor(random() * uniqueWords.length)]
      if (candidate) {
        choices.add(candidate)
      }
    }

    return shuffle(Array.from(choices), random)
  })

  return { indices, options }
}

export function areMnemonicAnswersCorrect(
  words: string[],
  indices: number[],
  answers: Array<string | null>,
): boolean {
  return indices.every((wordIndex, answerIndex) => answers[answerIndex] === words[wordIndex])
}
