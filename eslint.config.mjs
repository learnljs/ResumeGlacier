import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * 真正的代码规范检查（ESLint 9 扁平配置）。
 *
 * 旧版 `npm run lint` 实际只跑 `tsc --noEmit`，等于只查类型、不查规矩，
 * 代码里那些「这行跳过检查」注释也就成了空转。现在分三块：
 *   - next/core-web-vitals：Next / React / Hooks 的规则（含图片、链接、依赖数组）
 *   - next/typescript：TypeScript 推荐规则
 *   - 下面补充的自定义规则：调试残留、隐式相等、any、未使用变量等
 *
 * 类型检查仍由 `npm run typecheck` 单独负责，两者在 CI 里都跑。
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.next-*/**',
    'node_modules/**',
    'public/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    '*.traineddata',
  ]),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      // 调试残留不允许进仓库
      'no-debugger': 'error',
      'no-var': 'error',
      // 允许 == null（判空惯用写法），其余要求 ===
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      // 存量代码里 any 较多，先告警不清零，避免一次改崩业务
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Hooks 依赖数组漏项：告警，提示但不阻断
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // 存量代码的兼容层：这些规则是 React Compiler / 严格 ESM 场景下的建议，
    // 直接当 error 会让 40+ 个既有页面一夜之间必须重写（属于行为改动，不在本次范围）。
    // 保留为 warn 或 off，但新增代码仍受上面的 Next/TS 规则约束。
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      // eslint-plugin-react-hooks v6 面向 React Compiler 的自动记忆化规则，
      // 本项目未启用 Compiler，先关闭，避免把正常写法误判为错误
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      // CJS 入口、polyfill、tailwind 插件等确实需要 require()
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'prefer-rest-params': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    // CommonJS 的 polyfill / 自定义启动脚本，require 是唯一正确写法
    files: ['**/*.{js,cjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
])
