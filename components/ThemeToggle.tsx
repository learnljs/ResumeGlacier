'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

/** localStorage 键；根布局里的前置脚本会用同一个键，避免刷新时闪一下白 */
export const THEME_STORAGE_KEY = 'resume-glacier-theme'

type Theme = 'light' | 'dark'

function applyTheme(next: Theme, persist: boolean): void {
  const root = document.documentElement
  root.classList.toggle('dark', next === 'dark')
  // 让原生滚动条、下拉框、输入框底色也跟着切换
  root.style.colorScheme = next
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 隐私模式下 localStorage 可能不可用，仅本次会话生效
    }
  }
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** 服务端渲染时没有 DOM，统一按浅色出，hydration 后再对齐真实状态 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * 订阅主题变化：<html class="dark"> 被改动（点击开关或前置脚本）时触发重渲染；
 * 同时在没有手动选择的情况下跟随系统外观变化。
 */
function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = (event: MediaQueryListEvent) => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
      // 忽略
    }
    if (!saved) applyTheme(event.matches ? 'dark' : 'light', false)
    onStoreChange()
  }
  media.addEventListener('change', onSystemChange)

  return () => {
    observer.disconnect()
    media.removeEventListener('change', onSystemChange)
  }
}

/**
 * 左浅色 / 右深色的双态开关。
 * 选中的模式显示在前面那颗滑块上，未选中的图标留在底层并变淡、被滑块压住。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggle = () => {
    applyTheme(isDark ? 'light' : 'dark', true)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? '当前深色模式，点击切换为浅色' : '当前浅色模式，点击切换为深色'}
      title={isDark ? '切换为浅色' : '切换为深色'}
      className={cn(
        'relative inline-flex h-10 w-[92px] shrink-0 items-center rounded-full border border-border/70 bg-card p-1 shadow-soft',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {/* 底层两个图标：未选中的那个留在后面、变淡，被前面的滑块压住 */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-[15px] text-muted-foreground/70">
        <Sun className="h-[17px] w-[17px]" aria-hidden="true" />
        <Moon className="h-[17px] w-[17px]" aria-hidden="true" />
      </span>

      {/* 前面的滑块：左右移动，只显示当前选中的模式 */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1 top-1 flex h-8 w-[44px] items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-sm transition-transform duration-300 ease-out',
          isDark && 'translate-x-[40px]',
        )}
      >
        {isDark ? (
          <Moon className="h-[17px] w-[17px]" />
        ) : (
          <Sun className="h-[17px] w-[17px]" />
        )}
      </span>
    </button>
  )
}
