import * as React from 'react';
import { Text } from '../../ink.js';
import { gracefulShutdownSync } from '../../utils/gracefulShutdown.js';
import { clearAllApiKeys } from '../../services/api/providers/providerConfig.js';

/**
 * 清除认证相关的缓存
 * 保留此函数以兼容其他模块的调用
 */
export async function clearAuthRelatedCaches(): Promise<void> {
  // 我们使用 API Key 方式，不需要清除 OAuth 缓存
  // 但保留函数签名以兼容现有调用
}

/**
 * 清除 API Key 配置
 */
export async function performLogout({
  clearOnboarding = false
}: { clearOnboarding?: boolean } = {}): Promise<void> {
  clearAllApiKeys();
}

export async function call(): Promise<React.ReactNode> {
  await performLogout({ clearOnboarding: true });
  const message = <Text color="green">✓ 已成功退出登录，API Key 已清除。</Text>;
  setTimeout(() => {
    gracefulShutdownSync(0, 'logout');
  }, 200);
  return message;
}
