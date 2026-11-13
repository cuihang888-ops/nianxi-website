"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { Locale } from "../../lib/i18n"
import styles from "./AnheCourtyard.module.css"

export default function AnheCourtyardFrame({ locale }: { locale: Locale }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const section = useRef<HTMLElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [height, setHeight] = useState<number>()
  const chinese = locale === "zh"
  const base = `/${locale}/anheli`

  useEffect(() => {
    const legacyHashes = new Set(["#goods", "#culture", "#about-anhe"])
    const legacy = () => {
      if (legacyHashes.has(window.location.hash)) {
        window.location.replace(`${base}/collection${window.location.search}${window.location.hash}`)
      }
    }
    legacy()
    window.addEventListener("hashchange", legacy)
    const measure = () => {
      const top = section.current?.getBoundingClientRect().top ?? 0
      setHeight(Math.max(440, window.innerHeight - Math.max(0, top)))
    }
    measure()
    window.addEventListener("resize", measure)
    const destinations: Record<string, string> = {
      collection: `${base}/collection#goods`,
      culture: `${base}/collection#culture`,
      knowledge: `${base}/knowledge`,
      calendar: `${base}/calendar`,
      mall: `/${locale}`,
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      if (!event.data || typeof event.data !== "object" || event.data.type !== "anheli:navigate") return
      const destination = typeof event.data.destination === "string" ? event.data.destination : ""
      if (Object.hasOwn(destinations, destination)) window.location.assign(destinations[destination])
    }
    window.addEventListener("message", receive)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("hashchange", legacy)
      window.removeEventListener("message", receive)
    }
  }, [base, locale])

  return <section ref={section} className={styles.courtyard} style={height ? { height } : undefined} aria-label={chinese ? "安和里庭院" : "Anhe courtyard"}>
    {!loaded && <div className={styles.loading} role="status">{chinese ? "正在走进安和里…" : "Entering the courtyard…"}</div>}
    <iframe
      ref={frame}
      className={styles.frame}
      src={`/images/anhe/courtyard-20261113/index.html?locale=${locale}&embedded=1`}
      title={chinese ? "安和里 · 共处一庭" : "Anhe Home · A shared courtyard"}
      allow="fullscreen"
      allowFullScreen
      onLoad={() => setLoaded(true)}
    />
    <noscript>
      <div className={styles.alternatives}>
        <Link href={`${base}/calendar`}>{chinese ? "玄枢万年历" : "Xuanshu calendar"}</Link>
        <Link href={`${base}/collection`}>{chinese ? "东方好物与文化" : "Objects and culture"}</Link>
      </div>
    </noscript>
  </section>
}
