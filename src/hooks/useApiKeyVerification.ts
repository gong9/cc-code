import { useCallback, useState } from 'react'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { verifyApiKey } from '../services/api/claude.js'
import {
  getAnthropicApiKeyWithSource,
  getApiKeyFromApiKeyHelper,
  isAnthropicAuthEnabled,
  isClaudeAISubscriber,
} from '../utils/auth.js'

export type VerificationStatus =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'missing'
  | 'error'

export type ApiKeyVerificationResult = {
  status: VerificationStatus
  reverify: () => Promise<void>
  error: Error | null
}

// Helper to check if we should skip Anthropic auth
// This is called at runtime, so it reads the current env value
function shouldSkipAnthropicAuth(): boolean {
  // Default to 'minimax' if MODEL_PROVIDER is not set
  // This ensures non-Anthropic providers skip authentication entirely
  const modelProvider = (process.env.MODEL_PROVIDER || 'minimax').toLowerCase()
  const skip = modelProvider !== 'anthropic'
  return skip
}

export function useApiKeyVerification(): ApiKeyVerificationResult {
  // IMPORTANT: Check MODEL_PROVIDER directly at initialization time
  // to ensure we skip auth for non-Anthropic providers immediately
  const modelProvider = (process.env.MODEL_PROVIDER || 'minimax').toLowerCase()
  const isNonAnthropic = modelProvider !== 'anthropic'
  
  const [status, setStatus] = useState<VerificationStatus>(() => {
    // Skip verification for non-Anthropic providers - check directly here
    if (isNonAnthropic) {
      return 'valid'
    }
    // Also check function for consistency
    if (shouldSkipAnthropicAuth()) {
      return 'valid'
    }
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      return 'valid'
    }
    // Use skipRetrievingKeyFromApiKeyHelper to avoid executing apiKeyHelper
    // before trust dialog is shown (security: prevents RCE via settings.json)
    const { key, source } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true,
    })
    // If apiKeyHelper is configured, we have a key source even though we
    // haven't executed it yet - return 'loading' to indicate we'll verify later
    if (key || source === 'apiKeyHelper') {
      return 'loading'
    }
    return 'missing'
  })
  const [error, setError] = useState<Error | null>(null)

  const verify = useCallback(async (): Promise<void> => {
    // Skip verification for non-Anthropic providers - use fresh check
    const currentProvider = (process.env.MODEL_PROVIDER || 'minimax').toLowerCase()
    if (currentProvider !== 'anthropic') {
      setStatus('valid')
      return
    }
    // Also check via function
    if (shouldSkipAnthropicAuth()) {
      setStatus('valid')
      return
    }
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      setStatus('valid')
      return
    }
    // Warm the apiKeyHelper cache (no-op if not configured), then read from
    // all sources. getAnthropicApiKeyWithSource() reads the now-warm cache.
    await getApiKeyFromApiKeyHelper(getIsNonInteractiveSession())
    const { key: apiKey, source } = getAnthropicApiKeyWithSource()
    if (!apiKey) {
      if (source === 'apiKeyHelper') {
        setStatus('error')
        setError(new Error('API key helper did not return a valid key'))
        return
      }
      const newStatus = 'missing'
      setStatus(newStatus)
      return
    }

    try {
      const isValid = await verifyApiKey(apiKey, false)
      const newStatus = isValid ? 'valid' : 'invalid'
      setStatus(newStatus)
      return
    } catch (error) {
      // This happens when there an error response from the API but it's not an invalid API key error
      // In this case, we still mark the API key as invalid - but we also log the error so we can
      // display it to the user to be more helpful
      setError(error as Error)
      const newStatus = 'error'
      setStatus(newStatus)
      return
    }
  }, [])

  return {
    status,
    reverify: verify,
    error,
  }
}
