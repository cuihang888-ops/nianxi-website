import { notFound, redirect } from "next/navigation"
import { hasLocale } from "../../../lib/i18n"
import { anheMetadata } from "../../../lib/anhe/metadata"
import { parseFilters, safeCampaign } from "../../../lib/anhe/core.mjs"
import { collectionHref } from "../../../lib/anhe/collection-href"
import AnheCourtyardFrame from "../../../components/anhe/AnheCourtyardFrame"

export const dynamic = "force-dynamic"
type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  if (!hasLocale(locale)) notFound()
  return anheMetadata(locale,
    locale === "zh" ? "安和里 · 共处一庭｜年禧商城" : "Anhe Home · A Shared Courtyard | Nianxi",
    locale === "zh"
      ? "走进安和里的东方庭院，散步、静坐、喝茶、敲木鱼、拨珠与挂灯。保留玄枢万年历，延续东方好物与文化阅读。"
      : "Walk, pause, share tea and meet in Anhe Home's courtyard. Explore the original Xuanshu calendar, meaningful objects and cultural stories.")
}

export default async function AnhePage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!hasLocale(locale)) notFound()
  const query = await searchParams
  if (query.view === "collection" || ["category", "subcategory", "intent", "edit", "budget", "q", "sort", "page"].some(key => query[key])) {
    redirect(collectionHref(locale, parseFilters(query), safeCampaign(query)))
  }
  return <AnheCourtyardFrame locale={locale} />
}
