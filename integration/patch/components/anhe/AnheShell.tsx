"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Locale } from "../../lib/i18n"
import styles from "./Anhe.module.css"

function RouteShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const pathname = usePathname()
  const chinese = locale === "zh"
  const base = `/${locale}/anheli`
  const courtyard = pathname?.replace(/\/$/, "") === base
  return <div className={styles.page} data-anhe-section="true">
    {!courtyard && <div className={styles.subnav}>
      <Link href={base} aria-label={chinese ? "安和里庭院" : "Anhe courtyard"}>
        <img src="/images/anhe/brand/anhe-logo-horizontal-jade.svg" alt="安和里 ANHE HOME" width={200} height={69} />
      </Link>
      <nav aria-label={chinese ? "安和里专区导航" : "Anhe Home navigation"}>
        <Link href={base}>{chinese ? "回到庭院" : "Courtyard"}</Link>
        <Link href={`${base}/calendar`}>{chinese ? "万年历" : "Calendar"}</Link>
        <Link href={`${base}/collection#goods`}>{chinese ? "东方好物" : "Objects"}</Link>
        <Link href={`${base}/collection#culture`}>{chinese ? "东方志" : "Journal"}</Link>
        <Link href={`${base}/knowledge`}>{chinese ? "国学问答" : "Culture guide"}</Link>
        <Link href={`${base}/collection#about-anhe`}>{chinese ? "关于安和里" : "Our story"}</Link>
      </nav>
      <Link className={styles.returnLink} href={`/${locale}`}>{chinese ? "返回年禧商城" : "Back to Nianxi"} <span aria-hidden="true">↗</span></Link>
    </div>}
    {children}
    {!courtyard && <div className={styles.signature}><span>安 · 和 · 里</span><p>{chinese ? "文化有根，心意有寄。" : "Rooted in culture. Given with care."}</p><small>ANHE HOME / A NIANXI COLLECTION</small></div>}
  </div>
}

export default function AnheShell(props: { locale: Locale; children: React.ReactNode }) {
  return <Suspense fallback={<div className={styles.page} data-anhe-section="true">{props.children}</div>}>
    <RouteShell {...props} />
  </Suspense>
}
