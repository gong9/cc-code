/**
 * 测试 JSON 解析修复
 */
import { describe, test, expect } from 'bun:test'
import { BaseAdapter } from '../BaseAdapter.js'

// 创建一个测试用的具体实现
class TestAdapter extends BaseAdapter {
  readonly name = 'test'
  readonly displayName = 'Test'
  readonly capabilities = {
    streaming: true,
    toolUse: true,
    vision: false,
    thinking: false,
    systemPrompt: true,
    maxContextLength: 4096,
    maxOutputTokens: 4096,
  }

  async *chat(): AsyncGenerator<any> {
    yield { type: 'message_stop' }
  }

  async chatSync(): Promise<any> {
    return { content: [], stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0 } }
  }

  // 公开 protected 方法用于测试
  public testTryFixToolCallJson(json: string) {
    return this.tryFixToolCallJson(json)
  }

  public testContentFromOpenAIResponse(response: any) {
    return this.contentFromOpenAIResponse(response)
  }
}

describe('JSON 解析修复', () => {
  const adapter = new TestAdapter()

  describe('tryFixToolCallJson', () => {
    test('正常 JSON 不需要修复', () => {
      const result = adapter.testTryFixToolCallJson('{"key": "value"}')
      // 正常 JSON 应该直接被 JSON.parse 处理，不会走到 tryFix
      expect(result).toBeNull()
    })

    test('修复缺失的闭合括号', () => {
      const result = adapter.testTryFixToolCallJson('{"key": "value"')
      expect(result).toEqual({ key: 'value' })
    })

    test('修复多个缺失的闭合括号', () => {
      const result = adapter.testTryFixToolCallJson('{"a": {"b": "c"')
      expect(result).toEqual({ a: { b: 'c' } })
    })

    test('修复尾部逗号', () => {
      const result = adapter.testTryFixToolCallJson('{"key": "value",')
      expect(result).toEqual({ key: 'value' })
    })

    test('修复多余转义', () => {
      const result = adapter.testTryFixToolCallJson('{\\"key\\": \\"value\\"}')
      expect(result).toEqual({ key: 'value' })
    })

    test('无法修复的 JSON 返回 null', () => {
      const result = adapter.testTryFixToolCallJson('not json at all')
      expect(result).toBeNull()
    })
  })

  describe('contentFromOpenAIResponse - tool_calls 处理', () => {
    test('正常的 tool_calls 解析', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "Tokyo"}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }

      const result = adapter.testContentFromOpenAIResponse(response)
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({
        type: 'tool_use',
        id: 'call_123',
        name: 'get_weather',
        input: { location: 'Tokyo' }
      })
    })

    test('无效 JSON arguments 不会崩溃', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'broken_tool',
                arguments: '{"location": "Tokyo"' // 缺少闭合括号
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }

      // 不应该抛出异常
      const result = adapter.testContentFromOpenAIResponse(response)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('tool_use')
      expect(result.content[0].name).toBe('broken_tool')
      // 修复后的结果或降级结果
      expect(result.content[0].input).toBeDefined()
    })

    test('完全无效的 JSON 返回降级结果', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'broken_tool',
                arguments: 'this is not json'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }

      const result = adapter.testContentFromOpenAIResponse(response)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].input._parseError).toBe(true)
      expect(result.content[0].input._raw).toBe('this is not json')
    })

    test('空 arguments 返回空对象', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'no_args_tool',
                arguments: ''
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }

      const result = adapter.testContentFromOpenAIResponse(response)
      expect(result.content[0].input).toEqual({})
    })

    test('缺少 id 时使用 fallback', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '{}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      }

      const result = adapter.testContentFromOpenAIResponse(response)
      expect(result.content[0].id).toContain('tool_call_')
    })
  })
})
