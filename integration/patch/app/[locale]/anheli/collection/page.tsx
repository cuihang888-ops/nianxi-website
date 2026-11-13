import Link from "next/link"
import { notFound } from "next/navigation"
import { hasLocale, getDictionary } from "../../../../lib/i18n"
import { brand } from "../../../../lib/brand"
import { safeJson } from "../../../../lib/content/core.mjs"
import { categories, intentions, elements, parseFilters, safeCampaign } from "../../../../lib/anhe/core.mjs"
import { collectionHref } from "../../../../lib/anhe/collection-href"
import { getAnheCatalogue } from "../../../../lib/anhe/catalogue"
import { articles } from "../../../../lib/anhe/editorial"
import { anheMetadata } from "../../../../lib/anhe/metadata"
import AnheCatalogue from "../../../../components/anhe/AnheCatalogue"
import AnheInquiryButton from "../../../../components/anhe/AnheInquiryButton"
import styles from "../../../../components/anhe/Anhe.module.css"

export const dynamic = "force-dynamic"
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params, searchParams }: Props) {
  const { locale } = await params
  if (!hasLocale(locale)) notFound()
  const metadata = anheMetadata(locale, locale === "zh" ? "东方好物与文化｜安和里 · 年禧商城" : "Objects & Culture | Anhe Home · Nianxi",
    locale === "zh" ? "年禧商城安和里专区，以东方国学、五行文化、香事与礼赠灵感连接日常，浏览平安随身、手串念珠、香事雅器、书斋茶席和心意礼赠。文化寓意不是商品功效承诺。" : "Explore Chinese cultural ideas, the five phases, everyday rituals and meaningful gifts at Anhe Home, a Nianxi collection. Symbolism expresses good wishes, not guaranteed effects.",
    "/collection")
  const query = await searchParams
  if (["category", "subcategory", "intent", "edit", "budget", "q", "sort", "page"].some(key => query[key])) metadata.robots = { index: false, follow: true }
  return metadata
}

export default async function AnheCollectionPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!hasLocale(locale)) notFound()
  const query = await searchParams
  const filters = parseFilters(query)
  const campaign = safeCampaign(query)
  const [dict, catalogue] = await Promise.all([getDictionary(locale), getAnheCatalogue()])
  const chinese = locale === "zh"
  const base = `/${locale}/anheli`
  const structured = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: chinese ? "安和里 · 东方好物与文化" : "Anhe Home · Objects & Culture",
    url: `${brand.origin}${base}/collection`, inLanguage: chinese ? "zh-CN" : "en",
    isPartOf: { "@id": `${brand.origin}/#website` },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: chinese ? "年禧商城" : "Nianxi", item: `${brand.origin}/${locale}` },
      { "@type": "ListItem", position: 2, name: chinese ? "安和里" : "Anhe Home", item: brand.origin + base },
      { "@type": "ListItem", position: 3, name: chinese ? "东方好物与文化" : "Objects & culture", item: `${brand.origin}${base}/collection` },
    ] },
  }
  return <div className={styles.container}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(structured) }} />
    <nav className={styles.breadcrumb} aria-label={chinese ? "面包屑导航" : "Breadcrumb"}><Link href={`/${locale}`}>{chinese ? "年禧商城" : "Nianxi"}</Link><span>/</span><Link href={base}>{chinese ? "安和里庭院" : "Anhe courtyard"}</Link><span>/</span><span>{chinese ? "东方好物与文化" : "Objects & culture"}</span></nav>
    <nav className={styles.categories} aria-label={chinese ? "按好物类别浏览" : "Browse by category"}>
      {categories.map(category => <Link className={styles.categoryCard} href={collectionHref(locale, {}, campaign, { category: category.id })} key={category.id}><span className={styles.categoryMark} aria-hidden="true">{category.mark}</span><div><strong>{chinese ? category.name : category.en}</strong><small>{category.en.toUpperCase()}</small></div></Link>)}
    </nav>
    <section className={styles.intentionSection} aria-labelledby="anhe-intention-title">
      <div><small className={styles.eyebrow}>FOLLOW YOUR INTENTION</small><h2 id="anhe-intention-title">{chinese ? "循一份心愿" : "A wish to carry"}</h2><p>{chinese ? "寓意由心，日常由你。" : "Meaning is personal. Make it yours."}</p></div>
      <div className={styles.intentionCards}>{intentions.map(intent => <Link href={collectionHref(locale, {}, campaign, { intent: intent.id })} key={intent.id}><span aria-hidden="true">{intent.mark}</span><strong>{chinese ? intent.name : intent.en}</strong><small>{chinese ? intent.description : intent.englishDescription}</small></Link>)}</div>
    </section>
    <AnheCatalogue products={catalogue.products} unavailable={catalogue.unavailable} locale={locale} dict={dict} filters={filters} campaign={campaign} />
    <section className={styles.ritual} aria-labelledby="anhe-elements-title">
      <div><small className={styles.eyebrow}>FIVE PHASES · A CULTURAL LENS</small><h2 id="anhe-elements-title">{chinese ? <>五行之间，<br />寻找日常共鸣。</> : <>Five phases.<br />An everyday perspective.</>}</h2><p>{chinese ? "金木水火土，是理解东方意象的一扇窗。展开一行，读懂它的来处，也留意自己的真实喜好。" : "Wood, fire, earth, metal and water offer a window onto Chinese cultural imagery. Open a phase to discover its everyday associations."}</p><Link href={`${base}/knowledge/five-elements-overview`}>{chinese ? "读懂五行与传统对应" : "Read about the five phases"} →</Link></div>
      <div className={styles.elementList}>{elements.map((element, index) => <details key={element.id} open={index === 0}><summary><span aria-hidden="true">{element.mark}</span><b>{element.en}</b><strong>{chinese ? element.name : element.englishName}</strong></summary><p>{chinese ? element.description : element.englishDescription}</p><small>{chinese ? element.relation : element.englishRelation}</small></details>)}<p className={styles.elementNotice}>{chinese ? "五行是传统文化模型，不是医学诊断或个性命运测算；选物不承诺转运、招财或治病。" : "The five phases are a traditional cultural model, not medical diagnosis or fortune-telling. Objects do not guarantee luck, wealth or health."}</p></div>
    </section>
    <section className={styles.culture} id="culture" aria-labelledby="anhe-culture-heading">
      <div className={styles.sectionHeading}><div><small>READ A LITTLE OF THE EAST</small><h2 id="anhe-culture-heading">{chinese ? "好物之外，读一点东方" : "Stories beyond the objects"}<span>{chinese ? "东方志" : "THE JOURNAL"}</span></h2></div><Link href={`${base}/knowledge`}>{chinese ? "国学基础与常见问答" : "Explore cultural questions"} ↗</Link></div>
      <div className={styles.articleGrid}>{articles.map(article => <Link className={styles.articleCard} href={`${base}/journal/${article.id}`} key={article.id}><div className={styles.articleImage}><img src={`/images/anhe/art/${article.image}`} alt={chinese ? "文化意象示意插画" : "Cultural illustration"} width={640} height={400} loading="lazy" /></div><div className={styles.articleCardContent}><small>{chinese ? article.category : article.englishCategory}</small><h3>{chinese ? article.title : article.englishTitle}</h3><p>{chinese ? article.summary : article.englishSummary}</p><span>{chinese ? "慢慢读" : "Read the story"} ↗</span></div></Link>)}</div>
    </section>
    <section className={styles.gift} aria-labelledby="anhe-gift-heading">
      <div><small className={styles.eyebrow}>A LITTLE GIFT, A LASTING THOUGHT</small><h2 id="anhe-gift-heading">{chinese ? <>把没说出口的牵挂，<br />好好相赠。</> : <>A little gift.<br />A lasting thought.</>}</h2><p>{chinese ? <>远行前的一份平安愿，乔迁时的一点新心意。<br />不必盛大，认真挑选，就有温度。</> : "For journeys, new homes and everyday care. A thoughtful choice can say more than an elaborate gesture."}</p><Link href={collectionHref(locale, {}, campaign, { category: "gifts" })}>{chinese ? "看看心意礼赠" : "Explore thoughtful gifts"} <span>↗</span></Link></div><img src="/images/anhe/art/gift.svg" alt={chinese ? "礼赠文化示意插画，非在售实物" : "Gift illustration, not a product photograph"} width={550} height={320} loading="lazy" />
    </section>
    <section className={styles.about} id="about-anhe" aria-labelledby="anhe-about-heading">
      <div><small className={styles.eyebrow}>A PLACE FOR EVERYDAY MEANING</small><h2 id="anhe-about-heading">{chinese ? "安于日常，和于心意。" : "Rooted in culture. Given with care."}</h2><p>{chinese ? "安和里，是年禧商城内的东方国学生活专区。我们用易读的文化内容与有心意的器物，连接传统与今天的生活。安和里的品牌意象来自东方星宿、五行、纹样与日常礼俗，也回到一份真实的惦念。" : "Anhe Home is Nianxi's collection for Chinese culture and meaningful everyday objects. Through accessible stories, traditional motifs and thoughtful gifts, we connect heritage with life today."}</p><Link href={`/${locale}/about`}>{chinese ? "了解年禧与公开经营资料" : "About Nianxi and our business"} ↗</Link></div>
      <aside><strong>{chinese ? "一套商城，延续原有服务" : "One mall, the same service"}</strong><p>{chinese ? "会员、收藏、购物车、订单与客服继续使用年禧现有系统。实际付款、配送与售后，以相应商品和商家确认的安排为准。" : "Your account, wishlist, cart, orders and customer service continue to use Nianxi. Confirm payment, delivery and after-sales arrangements for each actual product."}</p><strong>{chinese ? "文化是一份祝愿，不是效果保证" : "Symbolism is a wish, not a guarantee"}</strong><p>{chinese ? "不以恐惧促成购买，不承诺改命、招财或医疗效果。国学资料为入门整理；涉及实物、交易与个人问题，请联系人工核实。" : "We do not sell through fear or promise changes to destiny, wealth or health. Cultural materials are introductory. Ask our team to verify actual products and transaction details."}</p><AnheInquiryButton className={styles.textButton}>{chinese ? "联系年禧客服" : "Contact Nianxi"} ↗</AnheInquiryButton></aside>
    </section>
  </div>
}
