import { adminBusinessSnapshot, adminStatus, authenticateAdmin } from './admin.ts'
import { cleanupPendingAccounts, deleteAccount, deletionStatus } from './account.ts'
import { handleAgora, sweepAgora } from './agora.ts'
import { tableRequest } from './appdata.ts'
import { appVersionPolicyResponse, enforceAppVersionPolicy } from './appVersionPolicy.ts'
import {
  issueChallenge,
  logoutSession,
  refreshSession,
  requireBoundIdentityPrincipal,
  requirePrincipal,
  requireWalletPrincipal,
  verifyChallenge,
} from './auth.ts'
import {
  bindPrivateIdentity,
  bundleExists,
  claimSessionOpk,
  contactCardOwnerStatus,
  createContactCard,
  deleteMessages,
  extendActiveDiscoveryLease,
  fetchBundle,
  fetchDiscoverableBundle,
  fetchMessages,
  fetchReceipts,
  issueVdfChallenge,
  listMailboxes,
  markMessage,
  opkCount,
  ownDiscoveryLease,
  patchOwnDiscoveryAlias,
  publishBundle,
  redeemContactCard,
  registerMailboxes,
  replenishOpks,
  searchDiscoveryAliases,
  sendMessage,
  unpublishPublicDiscovery,
  vacuumSealedMessages,
} from './chat.ts'
import { checkDatabase } from './db.ts'
import {
  blindParams,
  closeSpectre,
  currentSpectreAccess,
  issueBlindToken,
  redeemBlindToken,
  SpectreAccessError,
  spectreAccessErrorResponse,
} from './spectreAccess.ts'
import { contributionRecipients, rpcProxy, turnCredentials } from './external.ts'
import {
  activateEpoch,
  beginEpoch,
  claimEpoch,
  createGroup,
  epochStatus,
  insertGroupMessage,
  pendingEpochs,
  updateGroup,
} from './groups.ts'
import {
  allowMethod,
  applyMethodOverride,
  errorResponse,
  HttpError,
  json,
  readJson,
} from './http.ts'
import { currentMarketPrices } from './market.ts'
import { abandonChatMedia, consumeChatMedia } from './media.ts'
import {
  deleteObject,
  downloadRedirect,
  finalizeUpload,
  signDownload,
  signUpload,
} from './objects.ts'
import { realtimeResponse } from './realtime.ts'
import {
  applyRateLimit,
  counterSnapshot,
  observeChatBundle,
  observeChatMessage,
  observeRequest,
  prometheusText,
  verifyInternalRequest,
} from './runtime.ts'
import { addAttachments, assignTicket, createTicket, getTicket } from './support.ts'
import {
  acknowledgeWalletIndexDeliveries,
  activateWalletIndex,
  beginWalletIndexActivation,
  issueWalletIndexActivationVdf,
  runWalletWorker,
  walletIndexDeliveries,
} from './wallet.ts'
import { optionalEnv } from './config.ts'

const groupEpochRoutes = new Set([
  '/v1/groups/epochs/begin',
  '/v1/groups/epochs/activate',
  '/v1/groups/epochs/status',
  '/v1/groups/epochs/pending',
  '/v1/groups/epochs/claim',
])
const groupWriteRoutes = new Set([
  '/v1/groups/create',
  '/v1/groups/update',
  '/v1/groups/messages',
])
const metricRoutes = new Set([
  '/healthz',
  '/readyz',
  '/metrics',
  '/v1/client/version-policy',
  '/v1/admin/session',
  '/v1/admin/status',
  '/v1/admin/metrics',
  '/v1/auth/wallet/challenge',
  '/v1/auth/wallet/verify',
  '/v1/auth/session/refresh',
  '/v1/auth/session/logout',
  '/v1/chat/identity-bindings',
  '/v1/chat/contact-cards',
  '/v1/account/delete',
  '/v1/account/delete/status',
  '/v1/realtime',
  '/v1/chat/sealed/mailboxes',
  '/v1/chat/sealed/messages',
  '/v1/chat/sealed/messages/delivered',
  '/v1/chat/sealed/messages/read',
  '/v1/chat/sealed/messages/delete',
  '/v1/chat/sealed/messages/vacuum',
  '/v1/chat/sealed/receipts',
  '/v1/chat/bundles',
  '/v1/chat/discovery/aliases',
  '/v1/media/consume',
  '/v1/media/abandon',
  '/v1/wallet-index/activations',
  '/v1/wallet-index/activations/vdf-challenge',
  '/v1/wallet-index/activations/complete',
  '/v1/wallet-index/deliveries',
  '/v1/wallet-index/deliveries/ack',
  '/v1/internal/wallet-index/run',
  '/v1/objects/uploads',
  '/v1/objects/finalize',
  '/v1/objects/downloads',
  '/v1/objects/delete',
  '/v1/support/tickets',
  '/v1/calls/turn-credentials',
  '/v1/appdata/table',
  '/v1/groups/epochs/begin',
  '/v1/groups/epochs/activate',
  '/v1/groups/epochs/status',
  '/v1/groups/epochs/pending',
  '/v1/groups/epochs/claim',
  '/v1/groups/create',
  '/v1/groups/update',
  '/v1/groups/messages',
  '/v1/rpc-proxy',
  '/v1/market/prices',
  '/v1/contributions/recipients',
  '/v1/agora/session',
  '/v1/agora/join',
  '/v1/agora/nick',
  '/v1/agora/locale',
  '/v1/agora/rooms',
  '/v1/agora/presence/enter',
  '/v1/agora/presence/heartbeat',
  '/v1/agora/presence/activity',
  '/v1/agora/presence/background',
  '/v1/agora/presence/leave',
  '/v1/agora/occupants',
  '/v1/agora/messages',
  '/v1/agora/media/sign',
  '/v1/agora/media/commit',
  '/v1/agora/whispers',
  '/v1/agora/invites',
  '/v1/agora/invites/redeem',
  '/v1/agora/block',
  '/v1/agora/report',
])

export async function handleApiRequest(incoming: Request): Promise<Response> {
  const request = applyMethodOverride(incoming)
  const started = performance.now()
  const url = new URL(request.url)
  const path = normalizePath(url.pathname)
  let response: Response
  try {
    const preflight = corsPreflight(request)
    if (preflight) {
      response = preflight
    } else {
      const versionPolicyResponse = await enforceAppVersionPolicy(request, path)
      if (versionPolicyResponse) {
        response = versionPolicyResponse
      } else {
        if (!['/healthz', '/readyz', '/metrics'].includes(path)) {
          await applyRateLimit(request, routeLabel(path))
        }
        response = await dispatch(request, url, path)
      }
    }
  } catch (error) {
    response = error instanceof SpectreAccessError
      ? spectreAccessErrorResponse(error)
      : errorResponse(error)
  }
  observeRequest(routeLabel(path), request.method, response.status, performance.now() - started)
  return secureResponse(request, response)
}

async function dispatch(request: Request, url: URL, path: string): Promise<Response> {
  if (path === '/healthz') {
    allowMethod(request, 'GET')
    return json({ status: 'ok' })
  }
  if (path === '/readyz') {
    allowMethod(request, 'GET')
    try {
      await Promise.race([
        checkDatabase(),
        new Promise((_, reject) => setTimeout(() => reject(new Error()), 3_000)),
      ])
      return json({ status: 'ok' })
    } catch {
      throw new HttpError(503, 'not_ready')
    }
  }
  if (path === '/metrics') {
    allowMethod(request, 'GET')
    if (optionalEnv('SPECTRA_METRICS_INTERNAL_ONLY') !== 'false') verifyInternalRequest(request)
    return new Response(prometheusText(), {
      headers: { 'content-type': 'text/plain; version=0.0.4' },
    })
  }
  if (path === '/v1/client/version-policy') {
    allowMethod(request, 'GET')
    return await appVersionPolicyResponse(request)
  }
  if (path === '/v1/admin/session') {
    allowMethod(request, 'GET')
    return json({ user: await authenticateAdmin(request) })
  }
  if (path === '/v1/admin/status') {
    allowMethod(request, 'GET')
    return json(await adminStatus(request))
  }
  if (path === '/v1/admin/metrics') {
    allowMethod(request, 'GET')
    await authenticateAdmin(request)
    return json({
      generatedAt: Date.now(),
      business: await adminBusinessSnapshot(),
      counters: counterSnapshot(),
    })
  }
  if (path === '/v1/auth/wallet/challenge') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['walletAddress'])
    return json(await issueChallenge(body.walletAddress))
  }
  if (path === '/v1/auth/wallet/verify') {
    allowMethod(request, 'POST')
    const body = await readJson(request, [
      'challenge',
      'walletAddress',
      'publicKey',
      'identityId',
      'signature',
      'vdfChallengeId',
      'vdfProof',
    ])
    return json(
      await verifyChallenge({
        challenge: body.challenge,
        walletAddress: body.walletAddress,
        publicKey: body.publicKey,
        identityId: body.identityId,
        signature: body.signature,
        vdfChallengeId: body.vdfChallengeId,
        vdfProof: body.vdfProof,
      }),
    )
  }
  if (path === '/v1/auth/session/refresh') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['refreshToken'])
    return json(await refreshSession(body.refreshToken))
  }
  if (path === '/v1/auth/session/logout') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['refreshToken'])
    await logoutSession(body.refreshToken)
    return json({ revoked: true })
  }
  if (path === '/v1/chat/identity-bindings') {
    allowMethod(request, 'POST')
    const principal = await requireWalletPrincipal(request)
    const body = await readJson(request, [
      'identityId',
      'walletAddress',
      'recipientMailboxToken',
      'bundle',
    ], 3 * 1024 * 1024)
    return json(await bindPrivateIdentity(principal, body))
  }
  if (path === '/v1/account/delete/status') {
    allowMethod(request, 'POST')
    const body = await readJson(request, ['operationToken'])
    return json(await deletionStatus(body.operationToken))
  }
  if (path === '/v1/account/delete') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, [
      'confirmation',
      'operationToken',
    ])
    return json(await deleteAccount(principal, body))
  }
  if (path === '/v1/realtime') {
    return await realtimeResponse(request, await requireBoundIdentityPrincipal(request))
  }
  if (path === '/v1/chat/sealed/mailboxes') {
    const principal = await requireBoundIdentityPrincipal(request)
    if (request.method === 'GET') return json({ mailboxTokens: await listMailboxes(principal) })
    allowMethod(request, 'POST')
    const body = await readJson(request, ['mailboxTokens'])
    return json({ mailboxTokens: await registerMailboxes(principal, body.mailboxTokens) })
  }
  if (path === '/v1/chat/sealed/messages') {
    const principal = await requireBoundIdentityPrincipal(request)
    if (request.method === 'GET') return json(await fetchMessages(principal, url))
    allowMethod(request, 'POST')
    const body = await readJson(request, [
      'recipientMailboxToken',
      'deliveryToken',
      'deliveryClass',
      'sealedEnvelope',
      'pushNotificationEnabled',
    ], 2 * 1024 * 1024 + 16 * 1024)
    const result = await sendMessage(principal, body)
    observeChatMessage(String(body.deliveryClass ?? ''))
    return json(result)
  }
  if (
    path === '/v1/chat/sealed/messages/delivered' ||
    path === '/v1/chat/sealed/messages/read'
  ) {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['messageId'])
    return json(
      await markMessage(
        principal,
        body.messageId,
        path.endsWith('/read') ? 'read' : 'delivered',
      ),
    )
  }
  if (path === '/v1/chat/sealed/messages/delete') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['messageIds'])
    return json(await deleteMessages(principal, body.messageIds))
  }
  if (path === '/v1/chat/sealed/messages/vacuum') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['beforeSequence', 'statuses'])
    return json(await vacuumSealedMessages(principal, body))
  }
  if (path === '/v1/chat/sealed/receipts') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['messages'])
    return json(await fetchReceipts(principal, body.messages))
  }
  if (path === '/v1/chat/bundles') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, [
      'identityId',
      'walletAddress',
      'recipientMailboxToken',
      'bundle',
      'vdfChallengeId',
      'vdfProof',
      'discoveryAlias',
      'aliasAutocomplete',
    ], 3 * 1024 * 1024)
    const result = await publishBundle(principal, body)
    observeChatBundle()
    return json({ success: true, ...result })
  }
  if (path === '/v1/chat/discovery/vdf-challenges') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['action', 'bindingHash'])
    return json(await issueVdfChallenge(principal, body))
  }
  if (path === '/v1/chat/discovery/leases') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, [
      'identityId',
      'walletAddress',
      'recipientMailboxToken',
      'bundle',
      'vdfChallengeId',
      'vdfProof',
      'discoveryAlias',
      'aliasAutocomplete',
    ], 3 * 1024 * 1024)
    return json(await extendActiveDiscoveryLease(principal, body))
  }
  if (path === '/v1/chat/discovery/lease') {
    if (request.method === 'PATCH') {
      const principal = await requireBoundIdentityPrincipal(request)
      const body = await readJson(request, ['discoveryAlias', 'aliasAutocomplete'])
      return json(await patchOwnDiscoveryAlias(principal, body))
    }
    const principal = await requirePrincipal(request)
    if (request.method === 'GET') return json(await ownDiscoveryLease(principal))
    if (request.method === 'DELETE') return json(await unpublishPublicDiscovery(principal))
    throw new HttpError(405, 'method_not_allowed')
  }
  if (path === '/v1/chat/discovery/aliases') {
    allowMethod(request, 'GET')
    const principal = await requireBoundIdentityPrincipal(request)
    return json(await searchDiscoveryAliases(principal, url.searchParams.get('q') ?? ''))
  }
  if (path === '/v1/chat/discovery/session-opk') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, [
      'targetIdentityId',
      'requestorId',
      'vdfChallengeId',
      'vdfProof',
    ])
    return json(await claimSessionOpk(principal, body))
  }
  if (path === '/v1/chat/contact-cards') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, [
      'identityId',
      'walletAddress',
      'recipientMailboxToken',
      'bundle',
      'cardId',
      'cardCapability',
      'cardOpk',
      'profileCapsule',
      'vdfChallengeId',
      'vdfProof',
    ], 3 * 1024 * 1024)
    return json(await createContactCard(principal, body))
  }
  if (path.startsWith('/v1/chat/contact-cards/')) {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const prefix = '/v1/chat/contact-cards/'
    const statusSuffix = '/owner-status'
    if (path.endsWith(statusSuffix)) {
      const cardId = path.slice(prefix.length, -statusSuffix.length)
      if (!cardId || cardId.includes('/')) throw new HttpError(404, 'not_found')
      return json(await contactCardOwnerStatus(principal, cardId))
    }
    const suffix = '/redeem'
    if (!path.endsWith(suffix)) throw new HttpError(404, 'not_found')
    const cardId = path.slice(prefix.length, -suffix.length)
    if (!cardId || cardId.includes('/')) throw new HttpError(404, 'not_found')
    const body = await readJson(request, ['capability'])
    return json(
      await redeemContactCard(
        cardId,
        typeof body.capability === 'string' ? body.capability : '',
      ),
    )
  }
  if (path.startsWith('/v1/chat/discovery/')) {
    const principal = await requireBoundIdentityPrincipal(request)
    const parts = path.slice('/v1/chat/discovery/'.length).split('/').filter(Boolean)
    if (parts.length !== 2) throw new HttpError(404, 'not_found')
    const [resource, value] = parts
    if (resource === 'bundles' && request.method === 'GET') {
      return json(
        await fetchDiscoverableBundle(
          principal,
          value!,
          url.searchParams.get('requestorId') ?? '',
        ),
      )
    }
    throw new HttpError(405, 'method_not_allowed')
  }
  if (path.startsWith('/v1/chat/bundles/')) {
    const principal = await requireBoundIdentityPrincipal(request)
    const parts = path.slice('/v1/chat/bundles/'.length).split('/').filter(Boolean)
    if (parts.length < 1 || parts.length > 2) throw new HttpError(404, 'not_found')
    const [identityId, suffix = ''] = parts
    if (request.method === 'GET' && suffix === '') {
      return json(
        await fetchBundle(
          principal,
          identityId!,
          url.searchParams.get('requestorId') ?? '',
          url.searchParams.get('inviteCapability') ?? '',
        ),
      )
    }
    if (request.method === 'GET' && suffix === 'exists') {
      return json({ exists: await bundleExists(principal, identityId!) })
    }
    if (request.method === 'GET' && suffix === 'opk-count') {
      return json({ count: await opkCount(principal, identityId!) })
    }
    if (request.method === 'POST' && suffix === 'opks') {
      const body = await readJson(request, ['opks'], 3 * 1024 * 1024)
      return json({ availableCount: await replenishOpks(principal, identityId!, body.opks) })
    }
    if (request.method === 'PUT' && suffix === 'signed-prekey') {
      const body = await readJson(request, [
        'identityId',
        'walletAddress',
        'recipientMailboxToken',
        'bundle',
        'vdfChallengeId',
        'vdfProof',
      ], 3 * 1024 * 1024)
      body.identityId = identityId
      await publishBundle(principal, body)
      observeChatBundle()
      return json({ success: true })
    }
    throw new HttpError(405, 'method_not_allowed')
  }
  if (path === '/v1/media/consume') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['mediaId', 'objectRef'])
    return json(await consumeChatMedia(principal, body.mediaId, body.objectRef))
  }
  if (path === '/v1/media/abandon') {
    allowMethod(request, 'POST')
    const principal = await requireBoundIdentityPrincipal(request)
    const body = await readJson(request, ['mediaId', 'objectRef'])
    return json(await abandonChatMedia(principal, body.mediaId, body.objectRef))
  }
  if (path === '/v1/wallet-index/activations') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['address', 'chain'])
    return json(await beginWalletIndexActivation(principal, body))
  }
  if (path === '/v1/wallet-index/activations/vdf-challenge') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['activationId', 'addressProof'])
    return json(await issueWalletIndexActivationVdf(principal, body))
  }
  if (path === '/v1/wallet-index/activations/complete') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['activationId', 'vdfProof'])
    return json(await activateWalletIndex(principal, body))
  }
  if (path === '/v1/wallet-index/deliveries') {
    allowMethod(request, 'GET')
    return json(await walletIndexDeliveries(await requirePrincipal(request), url))
  }
  if (path === '/v1/wallet-index/deliveries/ack') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['eventIds'])
    return json(await acknowledgeWalletIndexDeliveries(principal, body))
  }
  if (path === '/v1/internal/wallet-index/run') {
    allowMethod(request, 'POST')
    verifyInternalRequest(request)
    return json(
      await runWalletWorker(await readJson(request, ['chains', 'limit', 'mode', 'runId'])),
    )
  }
  if (path === '/v1/objects/uploads') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, [
      'size',
      'contentType',
      'purpose',
      'bindingId',
      'ticketId',
    ])
    return json(await signUpload(request, principal, body))
  }
  if (path === '/v1/objects/downloads') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['objectRef', 'purpose'])
    return json(await signDownload(request, principal, body))
  }
  if (path === '/v1/objects/finalize') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['objectRef'])
    return json(await finalizeUpload(principal, body.objectRef))
  }
  if (path === '/v1/objects/delete') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const body = await readJson(request, ['objectRef'])
    await deleteObject(principal, body.objectRef)
    return new Response(null, { status: 204 })
  }
  if (path.startsWith('/v1/objects/download/')) {
    allowMethod(request, 'GET')
    return await downloadRedirect(path.slice('/v1/objects/download/'.length))
  }
  if (path.startsWith('/v1/objects/upload/')) {
    allowMethod(request, 'PUT')
    throw new HttpError(400, 'invalid_object_request')
  }
  if (path === '/v1/support/tickets') {
    allowMethod(request, 'POST')
    return json(
      await createTicket(
        await requirePrincipal(request),
        await readJson(request, [
          'userAddress',
          'category',
          'description',
          'appVersion',
          'os',
          'deviceModel',
        ]),
      ),
      201,
    )
  }
  if (path.startsWith('/v1/support/staff/tickets/')) {
    const principal = await requirePrincipal(request)
    const parts = path.slice('/v1/support/staff/tickets/'.length).split('/').filter(Boolean)
    if (parts.length === 1 && request.method === 'GET') {
      return json(await getTicket(principal, parts[0]!, true))
    }
    if (parts.length === 2 && parts[1] === 'assign' && request.method === 'POST') {
      await assignTicket(principal, parts[0]!, await readJson(request, ['staffUserId']))
      return new Response(null, { status: 204 })
    }
    throw new HttpError(parts.length ? 405 : 404, parts.length ? 'method_not_allowed' : 'not_found')
  }
  if (path.startsWith('/v1/support/tickets/')) {
    const principal = await requirePrincipal(request)
    const parts = path.slice('/v1/support/tickets/'.length).split('/').filter(Boolean)
    if (parts.length === 1 && request.method === 'GET') {
      return json(await getTicket(principal, parts[0]!, false))
    }
    if (parts.length === 2 && parts[1] === 'attachments' && request.method === 'POST') {
      const body = await readJson(request, ['objectRefs'])
      await addAttachments(principal, parts[0]!, body.objectRefs)
      return new Response(null, { status: 204 })
    }
    throw new HttpError(parts.length ? 405 : 404, parts.length ? 'method_not_allowed' : 'not_found')
  }
  if (path === '/v1/calls/turn-credentials') {
    allowMethod(request, 'POST')
    await requirePrincipal(request)
    const body = await readJson(request, ['ttl'])
    return json(await turnCredentials(body.ttl))
  }
  if (path === '/v1/appdata/table') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    return json(
      await tableRequest(
        principal,
        await readJson(request, [
          'table',
          'action',
          'select',
          'mode',
          'payload',
          'filters',
          'orderBy',
          'limit',
          'options',
        ], 3 * 1024 * 1024),
      ),
    )
  }
  if (groupEpochRoutes.has(path)) {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    const action = path.slice('/v1/groups/epochs/'.length)
    const fields: Record<string, string[]> = {
      begin: ['groupId', 'actorIdentityId', 'action', 'targetIdentityIds', 'expectedRevision'],
      activate: ['transitionId', 'actorIdentityId', 'distributionId', 'packageRecipientIds'],
      status: ['transitionId', 'identityId'],
      pending: ['identityId'],
      claim: ['transitionId', 'actorIdentityId'],
    }
    if (!fields[action]) throw new HttpError(404, 'not_found')
    const body = await readJson(request, fields[action])
    if (action === 'begin') return json(await beginEpoch(principal, body))
    if (action === 'activate') return json(await activateEpoch(principal, body))
    if (action === 'status') return json(await epochStatus(principal, body))
    if (action === 'pending') return json(await pendingEpochs(principal, body.identityId))
    return json(await claimEpoch(principal, body))
  }
  if (groupWriteRoutes.has(path)) {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    if (path === '/v1/groups/create') {
      return json(
        await createGroup(
          principal,
          await readJson(request, [
            'groupId',
            'actorIdentityId',
            'title',
            'description',
            'memberIdentityIds',
            'distributionId',
            'disappearingTimerMs',
          ]),
        ),
      )
    }
    if (path === '/v1/groups/update') {
      return json(
        await updateGroup(
          principal,
          await readJson(request, [
            'groupId',
            'actorIdentityId',
            'avatarUrl',
            'disappearingTimerMs',
          ]),
        ),
      )
    }
    return json(
      await insertGroupMessage(
        principal,
        await readJson(request, [
          'id',
          'groupId',
          'senderIdentityId',
          'distributionId',
          'keyVersion',
          'groupRevision',
          'contentType',
          'ciphertext',
          'nonce',
          'tag',
          'signature',
          'disappearingDurationMs',
          'disappearingTrigger',
        ], 256 * 1024),
      ),
    )
  }
  if (path === '/v1/rpc-proxy') {
    allowMethod(request, 'POST')
    await requirePrincipal(request)
    return json(
      await rpcProxy(
        await readJson(request, ['chain', 'method', 'params', 'path', 'body'], 256 * 1024),
      ),
    )
  }
  if (path === '/v1/market/prices') {
    allowMethod(request, 'GET')
    return json(await currentMarketPrices())
  }
  if (path === '/v1/contributions/recipients') {
    allowMethod(request, 'GET')
    return json(contributionRecipients())
  }
  if (path === '/v1/spectre/activation/params') {
    allowMethod(request, 'POST')
    return json(blindParams(url.searchParams.get('ticketPurpose')))
  }
  if (path === '/v1/spectre/access/current') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    await readJson(request, [])
    return json(await currentSpectreAccess(principal))
  }
  if (path === '/v1/spectre/access/close') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    await readJson(request, [])
    return json(await closeSpectre(principal))
  }
  if (path === '/v1/spectre/activation/issue') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    return json(
      await issueBlindToken(
        principal,
        await readJson(request, ['blindedMessageHex', 'ticketPurpose', 'rootWalletAddress']),
      ),
    )
  }
  if (path === '/v1/spectre/activation/redeem') {
    allowMethod(request, 'POST')
    const principal = await requirePrincipal(request)
    return json(
      await redeemBlindToken(
        principal,
        await readJson(request, [
          'keyId',
          'ticketPurpose',
          'nullifierHex',
          'signatureHex',
          'isEphemeral',
          'walletAddress',
        ]),
      ),
    )
  }
  if (path.startsWith('/v1/agora')) {
    const principal = await requireBoundIdentityPrincipal(request)
    return await handleAgora(principal, request, path, url)
  }
  throw new HttpError(404, 'not_found')
}

export async function handleJanitorRequest(request: Request): Promise<Response> {
  try {
    allowMethod(request, 'POST')
    verifyInternalRequest(request)
    const body = await readJson(request, ['accountLimit'])
    const accountLimit = body.accountLimit === undefined ? 25 : Number(body.accountLimit)
    if (!Number.isSafeInteger(accountLimit) || accountLimit < 1 || accountLimit > 100) {
      throw new HttpError(400, 'invalid_request')
    }
    return secureResponse(
      request,
      json({
        accountDeletions: await cleanupPendingAccounts(accountLimit),
        agora: await sweepAgora(),
      }),
    )
  } catch (error) {
    return secureResponse(request, errorResponse(error))
  }
}

function normalizePath(pathname: string): string {
  for (
    const name of [
      'spectra-api',
      'spectra-janitor',
      'spectra-wallet-worker',
      'spectra-market-worker',
    ]
  ) {
    const marker = `/${name}`
    const index = pathname.indexOf(marker)
    if (
      index >= 0 &&
      (index + marker.length === pathname.length || pathname[index + marker.length] === '/')
    ) {
      const path = pathname.slice(index + marker.length)
      return path || '/'
    }
  }
  return pathname
}

function corsPreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  const origin = request.headers.get('origin') ?? ''
  if (!allowedOrigins().has(origin)) return new Response('origin not allowed\n', { status: 403 })
  return new Response(null, { status: 204 })
}

function allowedOrigins(): Set<string> {
  return new Set(
    optionalEnv('SPECTRA_ADMIN_ALLOWED_ORIGINS').split(',').map((value) => value.trim()).filter(
      Boolean,
    ),
  )
}

function secureResponse(request: Request, response: Response): Response {
  if (response.status === 101) {
    try {
      applySecurityHeaders(request, response.headers)
    } catch {
      // Upgrade response headers may be immutable in non-Deno test runtimes.
    }
    return response
  }
  const headers = new Headers(response.headers)
  applySecurityHeaders(request, headers)
  const origin = request.headers.get('origin') ?? ''
  if (allowedOrigins().has(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-credentials', 'false')
    headers.set(
      'access-control-allow-headers',
      'Authorization, Content-Type, X-Request-ID, Traceparent, X-Spectra-App-Version, X-Spectra-Client-Platform, X-Spectra-Internal-Secret, X-HTTP-Method-Override',
    )
    headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    headers.append('vary', 'Origin')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function applySecurityHeaders(request: Request, headers: Headers): void {
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-frame-options', 'DENY')
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  headers.set('x-request-id', requestId(request))
  headers.set('traceparent', traceparent(request))
}

function requestId(request: Request): string {
  const provided = request.headers.get('x-request-id')?.trim() ?? ''
  if (
    provided && !provided.includes(',') &&
    new TextEncoder().encode(provided).byteLength <= 128 &&
    !/[\s\p{C}]/u.test(provided)
  ) return provided
  return randomHex(16)
}

function traceparent(request: Request): string {
  const value = request.headers.get('traceparent')?.trim() ?? ''
  const parts = value.split('-')
  if (
    parts.length === 4 && parts[0] === '00' &&
    /^[0-9a-f]{32}$/.test(parts[1]!) && !/^0{32}$/.test(parts[1]!) &&
    /^[0-9a-f]{16}$/.test(parts[2]!) && !/^0{16}$/.test(parts[2]!) &&
    /^[0-9a-f]{2}$/.test(parts[3]!)
  ) return `00-${parts[1]}-${randomHex(8)}-${parts[3]}`
  return `00-${randomHex(16)}-${randomHex(8)}-01`
}

function randomHex(bytes: number): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

function routeLabel(path: string): string {
  if (path.startsWith('/v1/chat/contact-cards/')) {
    return path.endsWith('/owner-status')
      ? '/v1/chat/contact-cards/:id/owner-status'
      : '/v1/chat/contact-cards/:id/redeem'
  }
  if (path.startsWith('/v1/objects/upload/')) return '/v1/objects/upload/:token'
  if (path.startsWith('/v1/objects/download/')) return '/v1/objects/download/:token'
  if (path.startsWith('/v1/support/staff/tickets/')) {
    return path.endsWith('/assign')
      ? '/v1/support/staff/tickets/:ticket/assign'
      : '/v1/support/staff/tickets/:ticket'
  }
  if (path.startsWith('/v1/support/tickets/')) {
    return path.endsWith('/attachments')
      ? '/v1/support/tickets/:ticket/attachments'
      : '/v1/support/tickets/:ticket'
  }
  if (path.startsWith('/v1/chat/bundles/')) return '/v1/chat/bundles/:identity'
  if (path.startsWith('/v1/spectre/access/')) return '/v1/spectre/access/:operation'
  if (path.startsWith('/v1/spectre/activation/')) return '/v1/spectre/activation/:operation'
  return metricRoutes.has(path) ? path : 'unmatched'
}
