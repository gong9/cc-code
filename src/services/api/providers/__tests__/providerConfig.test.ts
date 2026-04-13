import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  applyProviderToEnv,
  hasValidApiKey,
  initializeProviderConfig,
  readProvidersConfig,
} from "../providerConfig"
import { getProviderConfigFromEnv } from "../config"

const ENV_KEYS = [
  "GONG_CONFIG_DIR",
  "MODEL_PROVIDER",
  "GONG_ORIGINAL_PROVIDER",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "MINIMAX_API_KEY",
  "MINIMAX_MODEL",
  "GLM_API_KEY",
  "GLM_MODEL",
  "QWEN_API_KEY",
  "QWEN_MODEL",
  "DASHSCOPE_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
] as const

type EnvKey = (typeof ENV_KEYS)[number]

const originalEnv = new Map<EnvKey, string | undefined>()
let tempConfigDir: string

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe("providerConfig xmapi compatibility", () => {
  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), "gong-provider-config-test-"))
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key])
      delete process.env[key]
    }
    process.env.GONG_CONFIG_DIR = tempConfigDir
  })

  afterEach(() => {
    restoreEnv()
    rmSync(tempConfigDir, { recursive: true, force: true })
  })

  test("clears xmapi bearer token when switching to minimax", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "xmapi-token"
    process.env.ANTHROPIC_API_KEY = "old-key"

    applyProviderToEnv("minimax", "minimax-key", "MiniMax-M2.7")

    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(process.env.ANTHROPIC_API_KEY).toBe("minimax-key")
    expect(process.env.ANTHROPIC_BASE_URL).toBe("https://api.minimaxi.com/anthropic")
  })

  test("clears xmapi bearer token when switching to openai provider", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "xmapi-token"

    applyProviderToEnv("openai", "openai-key", "gpt-4o")

    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBe("openai-key")
  })

  test("recognizes xmapi env when base url has trailing slash", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "xmapi-token"
    process.env.ANTHROPIC_BASE_URL = "https://www.xmapi.cc/"

    expect(initializeProviderConfig()).toBe(true)
    expect(process.env.MODEL_PROVIDER).toBe("anthropic")
    expect(process.env.GONG_ORIGINAL_PROVIDER).toBe("xmapi")
  })

  test("anthropic env config falls back to auth token", () => {
    process.env.MODEL_PROVIDER = "anthropic"
    process.env.ANTHROPIC_AUTH_TOKEN = "xmapi-token"
    process.env.ANTHROPIC_BASE_URL = "https://www.xmapi.cc"
    process.env.ANTHROPIC_MODEL = "gpt-5.4"

    expect(getProviderConfigFromEnv()).toMatchObject({
      provider: "anthropic",
      apiKey: "xmapi-token",
      baseUrl: "https://www.xmapi.cc",
      model: "gpt-5.4",
    })
  })

  test("does not treat arbitrary anthropic auth token as provider setup", () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "some-token"
    process.env.ANTHROPIC_BASE_URL = "https://other-proxy.example.com"

    expect(hasValidApiKey()).toBe(false)
  })

  test("preserves xmapi default model and base url when file only stores api key", () => {
    writeFileSync(
      join(tempConfigDir, "providers.json"),
      JSON.stringify({
        defaultProvider: "xmapi",
        providers: {
          xmapi: {
            provider: "xmapi",
            apiKey: "xmapi-token",
          },
        },
      }),
      "utf-8",
    )

    expect(readProvidersConfig()).toMatchObject({
      defaultProvider: "xmapi",
      providers: {
        xmapi: {
          provider: "xmapi",
          apiKey: "xmapi-token",
          model: "gpt-5.4",
          baseUrl: "https://www.xmapi.cc",
        },
      },
    })
  })
})
