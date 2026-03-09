import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { legacyPhraseDictionaries, translationDictionaries, type UILanguage } from './dictionaries'

type TemplateParams = Record<string, string | number | boolean | null | undefined>

interface I18nContextValue {
  locale: UILanguage
  t: (key: string, params?: TemplateParams, fallback?: string) => string
  text: (raw: string, params?: TemplateParams) => string
}

function normalizeLocale(locale: UILanguage | string): UILanguage {
  return String(locale || '').toLowerCase() === 'en' ? 'en' : 'vi'
}

function template(value: string, params?: TemplateParams): string {
  if (!params || typeof value !== 'string') return value
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_all, key: string) => {
    const next = params[key]
    if (next === undefined || next === null) return ''
    return String(next)
  })
}

function getMessage(locale: UILanguage, key: string, fallback?: string): string {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return ''
  const local = translationDictionaries[locale]?.[normalizedKey]
  if (local) return local
  const english = translationDictionaries.en?.[normalizedKey]
  if (english) return english
  return fallback ?? normalizedKey
}

function localizeRawText(locale: UILanguage, raw: string): string {
  const normalizedRaw = String(raw || '').trim()
  if (!normalizedRaw) return ''
  if (locale === 'en') return normalizedRaw

  const legacyMap = legacyPhraseDictionaries[locale] || {}
  if (legacyMap[normalizedRaw]) return legacyMap[normalizedRaw]

  // Support strings with quoted action names, e.g. Action "resume" completed.
  const actionCompleted = /^Action "([^"]+)" completed$/i.exec(normalizedRaw)
  if (actionCompleted) {
    return `Thao tác "${actionCompleted[1]}" đã hoàn tất`
  }
  const actionApplied = /^Action "([^"]+)" applied$/i.exec(normalizedRaw)
  if (actionApplied) {
    return `Thao tác "${actionApplied[1]}" đã được áp dụng`
  }
  const createdProfiles = /^Created\s+(\d+)\s+profiles$/i.exec(normalizedRaw)
  if (createdProfiles) {
    return `Đã tạo ${createdProfiles[1]} profile`
  }
  const rowsLoaded = /^(\d+)\s+rows loaded$/i.exec(normalizedRaw)
  if (rowsLoaded) {
    return `Đã tải ${rowsLoaded[1]} dòng`
  }

  return normalizedRaw
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  t: (key, _params, fallback) => fallback ?? key,
  text: (raw) => raw
})

export function I18nProvider({
  locale,
  children
}: {
  locale: UILanguage
  children: ReactNode
}) {
  const resolvedLocale = normalizeLocale(locale)

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale: resolvedLocale,
      t: (key: string, params?: TemplateParams, fallback?: string) =>
        template(getMessage(resolvedLocale, key, fallback), params),
      text: (raw: string, params?: TemplateParams) => template(localizeRawText(resolvedLocale, raw), params)
    }
  }, [resolvedLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
