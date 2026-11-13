import { notFound, redirect } from "next/navigation"
import { hasLocale } from "../../../../lib/i18n"

export default async function AnheJournalIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(locale)) notFound()
  redirect(`/${locale}/anheli/collection#culture`)
}
