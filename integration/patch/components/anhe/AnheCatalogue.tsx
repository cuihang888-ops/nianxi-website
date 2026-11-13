import Link from "next/link"
import type { Dictionary, Locale } from "../../lib/i18n"
import type { VendureProduct } from "../../lib/queries"
import { categories, intentions, edits, productTags, selectCatalogue, subcategoryLabel, type AnheFilters } from "../../lib/anhe/core.mjs"
import { collectionHref } from "../../lib/anhe/collection-href"
import ProductCard from "../products/ProductCard"
import AnheInquiryButton from "./AnheInquiryButton"
import styles from "./Anhe.module.css"

export default function AnheCatalogue({ products, unavailable, locale, dict, filters, campaign }: {
  products: VendureProduct[]; unavailable: boolean; locale: Locale; dict: Dictionary; filters: AnheFilters; campaign: Record<string, string>
}) {
  const chinese = locale === "zh"
  const selection = selectCatalogue(products, filters)
  const href = (overrides: Partial<AnheFilters>) => collectionHref(locale, filters, campaign, { page: 1, ...overrides })
  const activeCategory = categories.find(category => category.id === filters.category)
  const pageNumbers = [...new Set([1, selection.page - 1, selection.page, selection.page + 1, selection.pages])].filter(page => page >= 1 && page <= selection.pages).sort((left, right) => left - right)
  const filtered = Boolean(filters.category || filters.intent || filters.subcategory || filters.edit || filters.query || filters.budget)
  return <section className={styles.catalogue} id="goods" aria-labelledby="anhe-goods-heading">
    <div className={styles.sectionHeading}><div><small>OBJECTS WITH A MEANING</small><h2 id="anhe-goods-heading">{chinese ? "好物有形，心意无声" : "Objects to cherish"}<span>{chinese ? "东方好物" : "THE COLLECTION"}</span></h2></div><Link href={`/${locale}/anheli/knowledge`}>{chinese ? "先读一点选物灵感" : "Read our culture guide"} ↗</Link></div>
    <div className={styles.edits}>
      {edits.map(edit => <Link key={edit.id} href={href({ edit: filters.edit === edit.id ? "" : edit.id })} aria-current={filters.edit === edit.id ? "page" : undefined}>{chinese ? edit.name : edit.en}</Link>)}
      <Link href={href({ budget: filters.budget ? "" : "under200" })} aria-current={filters.budget ? "page" : undefined}>{chinese ? "平价心意 · ¥200以内" : "Everyday value · under ¥200"}</Link>
    </div>
    <div className={styles.cataloguePanel}>
      <div className={styles.categoryFilters} aria-label={chinese ? "商品分类" : "Categories"}>
        <Link href={href({ category: "", subcategory: "" })} aria-current={!filters.category ? "page" : undefined}>{chinese ? "全部好物" : "All objects"}</Link>
        {categories.map(category => <Link key={category.id} href={href({ category: category.id, subcategory: "" })} aria-current={filters.category === category.id ? "page" : undefined}>{chinese ? category.name : category.en}</Link>)}
      </div>
      {activeCategory && <div className={styles.subcategories}><span>{chinese ? "细分选物" : "Refine"}</span>{activeCategory.children.map(child => <Link key={child} href={href({ subcategory: filters.subcategory === child ? "" : child })} aria-current={filters.subcategory === child ? "page" : undefined}>{subcategoryLabel(child, locale)}</Link>)}</div>}
      <div className={styles.intentionFilters}><span>{chinese ? "循心愿" : "By intention"}</span><Link href={href({ intent: "" })} aria-current={!filters.intent ? "page" : undefined}>{chinese ? "不限" : "All"}</Link>{intentions.map(intent => <Link key={intent.id} href={href({ intent: intent.id })} aria-current={filters.intent === intent.id ? "page" : undefined}>{chinese ? intent.name : intent.en}</Link>)}</div>
      <form action={`/${locale}/anheli/collection#goods`} method="get" className={styles.catalogueForm} role="search">
        {Object.entries({ ...campaign, category: filters.category, subcategory: filters.subcategory, intent: filters.intent, edit: filters.edit, budget: filters.budget }).filter(([, value]) => value).map(([key, value]) => <input type="hidden" key={key} name={key} value={value} />)}
        <label className={styles.searchLabel}><span>{chinese ? "搜索好物" : "Search objects"}</span><input type="search" name="q" maxLength={100} defaultValue={filters.query} placeholder={chinese ? "名称、材质或文化心意…" : "Name, material or meaning…"} /></label>
        <label className={styles.sortLabel}><span>{chinese ? "排序" : "Sort"}</span><select name="sort" defaultValue={filters.sort} aria-label={chinese ? "安和里商品排序" : "Sort Anhe products"}><option value="newest">{chinese ? "最新上架" : "Newest first"}</option><option value="price-asc">{chinese ? "价格从低到高" : "Price: low to high"}</option><option value="price-desc">{chinese ? "价格从高到低" : "Price: high to low"}</option></select></label>
        <button type="submit">{chinese ? "查看" : "Apply"} ↗</button>
      </form>
    </div>
    <div className={styles.resultLine}><p role="status">{unavailable ? (chinese ? "商品目录暂不可用" : "Collection unavailable") : (chinese ? `共 ${selection.total} 件好物` : `${selection.total} objects`)}{filtered && <> · <Link href={collectionHref(locale, {}, campaign)}>{chinese ? "清除筛选" : "Clear filters"}</Link></>}</p><span>{chinese ? "实物信息、库存与价格以商品详情为准" : "See product details for materials, prices and availability"}</span></div>
    {unavailable ? <div className={styles.empty}><span>↻</span><h3>{chinese ? "商品资料暂时无法加载" : "The collection is temporarily unavailable"}</h3><p>{chinese ? "请稍后重试，或通过年禧客服了解商品情况。" : "Please try again later or contact Nianxi for details."}</p><Link href={href({})}>{chinese ? "重新加载" : "Try again"} ↗</Link></div> : selection.items.length ? <div className={styles.productGrid}>
      {selection.items.map(product => {
        const tags = productTags(product)
        const category = categories.find(entry => tags.has(entry.name) || tags.has(`anhe:category:${entry.id}`))
        const displayProduct = { ...product, customFields: { ...product.customFields, tag: category ? (chinese ? category.name : category.en) : "" } }
        return <ProductCard key={product.id} product={displayProduct} dict={dict} locale={locale} />
      })}
    </div> : <div className={styles.empty}>
      <span>安</span><small>A THOUGHTFUL COLLECTION TAKES TIME</small><h3>{chinese ? (filtered ? "这份心意，还在甄选中" : "首批实物好物，正在认真甄选") : "Thoughtful objects are being selected"}</h3><p>{chinese ? "我们会在材质、实物照片、价格与库存确认后上架。不以示意插画代替真实货品。" : "Objects appear here after their actual photos, materials, prices and stock are confirmed. Illustrations are not products for sale."}</p><div><Link href={`/${locale}/anheli/collection#culture`}>{chinese ? "先逛东方志" : "Explore the journal"} ↗</Link><AnheInquiryButton>{chinese ? "向年禧客服咨询" : "Ask Nianxi"} ↗</AnheInquiryButton></div>
    </div>}
    {selection.pages > 1 && <nav className={styles.pagination} aria-label={chinese ? "安和里商品分页" : "Collection pages"}>
      {selection.page > 1 ? <Link href={href({ page: selection.page - 1 })}>{chinese ? "上一页" : "Previous"}</Link> : <span aria-disabled="true">{chinese ? "上一页" : "Previous"}</span>}
      {pageNumbers.map((page, index) => <span className={styles.pageNumberGroup} key={page}>{index > 0 && page - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}<Link href={href({ page })} aria-current={page === selection.page ? "page" : undefined} aria-label={chinese ? `第${page}页` : `Page ${page}`}>{page}</Link></span>)}
      {selection.page < selection.pages ? <Link href={href({ page: selection.page + 1 })}>{chinese ? "下一页" : "Next"}</Link> : <span aria-disabled="true">{chinese ? "下一页" : "Next"}</span>}
    </nav>}
    {!unavailable && <p className={styles.catalogueFootnote}>{chinese ? `每页最多30款 · 新品默认优先 · 当前第${selection.page}/${selection.pages}页` : `Up to 30 per page · newest first · page ${selection.page}/${selection.pages}`}</p>}
  </section>
}
