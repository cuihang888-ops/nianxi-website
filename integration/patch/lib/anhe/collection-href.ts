import { catalogueHref, type AnheFilters } from "./core.mjs"

export function collectionHref(
  locale: string,
  filters: Partial<AnheFilters> = {},
  campaign: Record<string, string> = {},
  overrides: Partial<AnheFilters> = {},
) {
  const url = new URL(catalogueHref(locale, filters, campaign, overrides), "https://anheli.invalid")
  url.pathname = `/${locale === "en" ? "en" : "zh"}/anheli/collection`
  return `${url.pathname}${url.search}${url.hash}`
}
