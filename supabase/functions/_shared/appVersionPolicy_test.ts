import {
  type AppVersionPolicy,
  compareAppVersions,
  evaluateAppVersionPolicy,
  evaluateClientVersionPolicy,
  isAppVersionPolicyExemptPath,
  parseAppVersion,
  validateAppVersionPolicy,
} from './appVersionPolicy.ts'
import { HttpError } from './http.ts'

const policy: AppVersionPolicy = {
  platform: 'ios',
  minimumSupportedVersion: '1.2.1',
  latestVersion: '1.4.0',
  storeUrl: 'https://apps.apple.com/us/app/spectra-protocol/id6776937247',
  blockUnversionedClients: false,
}

Deno.test('app version parsing and comparison are strict', () => {
  const current = parseAppVersion('1.2.10')
  const latest = parseAppVersion('1.10.0')
  if (!current || !latest) throw new Error('valid versions were rejected')
  if (compareAppVersions(current, latest) >= 0) {
    throw new Error('semantic version ordering is incorrect')
  }
  if (parseAppVersion('1.2') || parseAppVersion('1.02.0') || parseAppVersion('1.2.0-beta')) {
    throw new Error('invalid policy version was accepted')
  }
})

Deno.test('app version policy distinguishes optional and required updates', () => {
  const supported = parseAppVersion('1.4.0')
  const optional = parseAppVersion('1.3.0')
  const required = parseAppVersion('1.1.9')
  if (!supported || !optional || !required) throw new Error('test version parsing failed')

  const supportedDecision = evaluateAppVersionPolicy(policy, supported)
  if (supportedDecision.updateAvailable || supportedDecision.updateRequired) {
    throw new Error('latest version was incorrectly flagged')
  }

  const optionalDecision = evaluateAppVersionPolicy(policy, optional)
  if (!optionalDecision.updateAvailable || optionalDecision.updateRequired) {
    throw new Error('optional update was incorrectly evaluated')
  }

  const requiredDecision = evaluateAppVersionPolicy(policy, required)
  if (!requiredDecision.updateAvailable || !requiredDecision.updateRequired) {
    throw new Error('required update was incorrectly evaluated')
  }
})

Deno.test('equal policy bounds enforce an exact emergency release', () => {
  const exactPolicy: AppVersionPolicy = {
    ...policy,
    minimumSupportedVersion: '1.2.2',
    latestVersion: '1.2.2',
    blockUnversionedClients: true,
  }
  const older = parseAppVersion('1.2.1')
  const exact = parseAppVersion('1.2.2')
  const newer = parseAppVersion('1.2.3')
  if (!older || !exact || !newer) throw new Error('test version parsing failed')

  if (!evaluateAppVersionPolicy(exactPolicy, older).updateRequired) {
    throw new Error('older release was allowed through the exact lock')
  }
  if (evaluateAppVersionPolicy(exactPolicy, exact).updateRequired) {
    throw new Error('the exact release was blocked')
  }
  if (!evaluateAppVersionPolicy(exactPolicy, newer).updateRequired) {
    throw new Error('unapproved newer release was allowed through the exact lock')
  }

  const policies = new Map([['ios' as const, exactPolicy]])
  if (evaluateClientVersionPolicy(policies, 'ios', newer) !== exactPolicy) {
    throw new Error('exact-release enforcement did not block a newer client')
  }
})

Deno.test('invalid app version policies fail closed', () => {
  const version = parseAppVersion('1.2.2')
  if (!version) throw new Error('test version parsing failed')

  for (
    const validate of [
      () => evaluateAppVersionPolicy({ ...policy, minimumSupportedVersion: '1.5.0' }, version),
      () =>
        validateAppVersionPolicy({ ...policy, storeUrl: 'https://untrusted.example.test/update' }),
    ]
  ) {
    try {
      validate()
    } catch (error) {
      if (
        error instanceof HttpError && error.status === 503 &&
        error.code === 'app_version_policy_invalid'
      ) {
        continue
      }
      throw error
    }
    throw new Error('invalid policy was accepted')
  }
})

Deno.test('unversioned clients are blocked only after both platforms opt in', () => {
  const androidPolicy: AppVersionPolicy = {
    ...policy,
    platform: 'android',
    storeUrl: 'https://spectraprotocol.org',
  }
  const policies = new Map([
    ['ios' as const, policy],
    ['android' as const, androidPolicy],
  ])
  const staleVersion = parseAppVersion('1.1.0')
  if (!staleVersion) throw new Error('test version parsing failed')

  if (evaluateClientVersionPolicy(policies, 'ios', staleVersion) !== policy) {
    throw new Error('outdated iOS client was not blocked')
  }
  if (evaluateClientVersionPolicy(policies, 'ios', null) !== null) {
    throw new Error('unversioned client was blocked before rollout opt-in')
  }

  const blockingPolicies = new Map([
    ['ios' as const, { ...policy, blockUnversionedClients: true }],
    ['android' as const, { ...androidPolicy, blockUnversionedClients: true }],
  ])
  if (evaluateClientVersionPolicy(blockingPolicies, null, null) !== 'unversioned') {
    throw new Error('unversioned client was not blocked after rollout opt-in')
  }
})

Deno.test('compatibility enforcement preserves account revocation and deletion cleanup', () => {
  for (
    const path of [
      '/v1/auth/session/logout',
      '/v1/account/delete',
      '/v1/account/delete/status',
    ]
  ) {
    if (!isAppVersionPolicyExemptPath(path)) {
      throw new Error(`required cleanup route is blocked: ${path}`)
    }
  }
  if (isAppVersionPolicyExemptPath('/v1/chat/sealed/messages')) {
    throw new Error('normal API route bypasses compatibility enforcement')
  }
})
