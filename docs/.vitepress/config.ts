import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Gong Code 架构解析',
  description: '深入理解 Gong Code 的核心架构设计',

  srcDir: 'docs',

  exclude: ['**/superpowers/plans/**', '**/superpowers/specs/**'],

  markdown: {
    lineNumbers: true,
  },

  mermaid: {
    theme: 'base',
  },

  nav: [
    { text: '首页', link: '/' },
    { text: '快速开始', link: '/chapters/1-intro' },
  ],

  sidebar: [
    {
      text: '目录',
      items: [
        { text: '第 1 章：项目概览与设计思想', link: '/chapters/1-intro' },
        { text: '第 2 章：入口与启动流程', link: '/chapters/2-entry' },
        { text: '第 3 章：API 多 Provider 架构', link: '/chapters/3-provider' },
        { text: '第 4 章：Agent 编排核心 - 查询循环', link: '/chapters/4-query-loop' },
        { text: '第 5 章：Agent 编排核心 - 会话与压缩', link: '/chapters/5-session' },
        { text: '第 6 章：Agent 编排核心 - 工具执行', link: '/chapters/6-tool-execution' },
        { text: '第 7 章：沙箱与安全系统', link: '/chapters/7-sandbox' },
        { text: '第 8 章：状态管理', link: '/chapters/8-state' },
      ],
    },
  ],
})
