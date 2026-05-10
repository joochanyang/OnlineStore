import { customerShoppingSteps } from "@commerce/core/auth";
import { listCatalogProducts } from "@commerce/db";
import { createProductJsonLd } from "@commerce/seo/json-ld";
import { CheckoutWorkbench } from "./checkout-workbench";

const formatPrice = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export default async function StorefrontHome() {
  const products = await listCatalogProducts();
  const featuredProduct = products[0];

  const productJsonLd =
    featuredProduct &&
    createProductJsonLd({
      name: featuredProduct.name,
      slug: featuredProduct.slug,
      price: featuredProduct.price,
      currency: "KRW",
    });

  return (
    <main className="store-shell">
      <section className="store-hero" aria-labelledby="store-title">
        <div>
          <p className="eyebrow">Shopping mall storefront</p>
          <h1 id="store-title">고객 쇼핑 흐름을 기준으로 설계된 전용 쇼핑몰</h1>
          <p className="lede">
            상품 탐색, 회원 계정, 장바구니 견적, 주문 생성, 배송/CS까지 관리자 운영 콘솔과 같은
            도메인 규칙을 공유합니다.
          </p>
        </div>
        <article className="product-panel">
          <span className="status">{featuredProduct?.status ?? "EMPTY"}</span>
          <h2>{featuredProduct?.name ?? "No active products"}</h2>
          <p>
            {featuredProduct?.description ??
              "DATABASE_URL이 설정되면 실제 상품 데이터를 이 영역에 표시합니다."}
          </p>
          <strong>{(featuredProduct?.price ?? 0).toLocaleString("ko-KR")}원</strong>
        </article>
      </section>
      <section className="journey-band" aria-labelledby="journey-title">
        <div className="section-heading">
          <p className="eyebrow">Customer architecture</p>
          <h2 id="journey-title">회원/비회원 구매 여정</h2>
        </div>
        <div className="journey-grid">
          {customerShoppingSteps.map((item) => (
            <article key={item.step}>
              <span>{item.owner}</span>
              <h3>{item.label}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="commerce-band" aria-labelledby="catalog-title">
        <div className="section-heading">
          <p className="eyebrow">Catalog</p>
          <h2 id="catalog-title">상품 상세와 SKU 재고</h2>
        </div>
        <div className="catalog-grid">
          {products.map((product) => (
            <article className="catalog-card" key={product.id}>
              <div>
                <span className="status">{product.status}</span>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
              </div>
              <dl className="sku-list">
                {product.variants.map((variant) => (
                  <div key={variant.sku}>
                    <dt>{variant.sku}</dt>
                    <dd>
                      {variant.color} / {variant.size} / {variant.stock}개 / {formatPrice(variant.price)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>
      <CheckoutWorkbench products={products} />
      {productJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      ) : null}
    </main>
  );
}
