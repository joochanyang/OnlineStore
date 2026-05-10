"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CatalogProduct } from "@commerce/db";

type ProductCreateFormProps = {
  actorId: string;
};

type ProductVariantForm = {
  sku: string;
  color: string;
  size: string;
  price: number;
  compareAtPrice: number | "";
  stock: number;
  safetyStock: number;
};

const emptyVariant = (): ProductVariantForm => ({
  sku: "",
  color: "",
  size: "",
  price: 0,
  compareAtPrice: "",
  stock: 0,
  safetyStock: 0,
});

export function ProductCreateForm({ actorId }: ProductCreateFormProps) {
  const [name, setName] = useState("Weekend Oxford Shirt");
  const [slug, setSlug] = useState("weekend-oxford-shirt");
  const [description, setDescription] = useState("A production-ready catalog item created from the admin workbench.");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">("DRAFT");
  const [categorySlugs, setCategorySlugs] = useState("shirts, new-arrivals");
  const [imageUrls, setImageUrls] = useState("/products/weekend-oxford-shirt.jpg");
  const [variants, setVariants] = useState<ProductVariantForm[]>([
    {
      sku: "OXFORD-WHITE-M",
      color: "white",
      size: "M",
      price: 49000,
      compareAtPrice: "",
      stock: 20,
      safetyStock: 3,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<CatalogProduct | undefined>();
  const [error, setError] = useState<string | undefined>();

  const totalStock = useMemo(
    () => variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0),
    [variants],
  );

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setCreatedProduct(undefined);
    setError(undefined);

    try {
      const response = await fetch("/api/v1/products", {
        method: "POST",
        headers: {
          authorization: `Bearer ${actorId}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug,
          description,
          status,
          categorySlugs: splitList(categorySlugs),
          imageUrls: splitList(imageUrls),
          variants: variants.map((variant) => ({
            sku: variant.sku,
            color: variant.color,
            size: variant.size,
            price: Number(variant.price),
            compareAtPrice:
              variant.compareAtPrice === "" ? undefined : Number(variant.compareAtPrice),
            stock: Number(variant.stock),
            safetyStock: Number(variant.safetyStock),
          })),
        }),
      });
      const envelope = await response.json();

      if (!response.ok) {
        throw new Error(envelope.error?.message ?? "상품 등록에 실패했습니다.");
      }

      setCreatedProduct(envelope.data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "상품 등록에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateVariant(index: number, patch: Partial<ProductVariantForm>) {
    setVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index
          ? {
              ...variant,
              ...patch,
            }
          : variant,
      ),
    );
  }

  function addVariant() {
    setVariants((current) => [...current, emptyVariant()]);
  }

  function removeVariant(index: number) {
    setVariants((current) => current.filter((_, variantIndex) => variantIndex !== index));
  }

  return (
    <form className="product-create-form" onSubmit={submitProduct}>
      <div className="section-head-row">
        <div>
          <span className="section-label">Catalog create</span>
          <h2>상품 신규 등록</h2>
        </div>
        <strong>{totalStock} stock</strong>
      </div>
      <div className="form-grid">
        <label>
          상품명
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Slug
          <input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        <label>
          판매 상태
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="DRAFT">DRAFT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label>
          카테고리 Slug
          <input value={categorySlugs} onChange={(event) => setCategorySlugs(event.target.value)} />
        </label>
      </div>
      <label>
        설명
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        이미지 URL
        <textarea value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} />
      </label>
      <div className="variant-editor">
        <div className="section-head-row">
          <span className="section-label">SKU options</span>
          <button type="button" className="secondary-button" onClick={addVariant}>
            옵션 추가
          </button>
        </div>
        {variants.map((variant, index) => (
          <fieldset key={index}>
            <legend>Option {index + 1}</legend>
            <label>
              SKU
              <input value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} />
            </label>
            <label>
              색상
              <input
                value={variant.color}
                onChange={(event) => updateVariant(index, { color: event.target.value })}
              />
            </label>
            <label>
              사이즈
              <input value={variant.size} onChange={(event) => updateVariant(index, { size: event.target.value })} />
            </label>
            <label>
              판매가
              <input
                min="0"
                type="number"
                value={variant.price}
                onChange={(event) => updateVariant(index, { price: Number(event.target.value) })}
              />
            </label>
            <label>
              비교가
              <input
                min="0"
                type="number"
                value={variant.compareAtPrice}
                onChange={(event) =>
                  updateVariant(index, {
                    compareAtPrice: event.target.value === "" ? "" : Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              재고
              <input
                min="0"
                type="number"
                value={variant.stock}
                onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })}
              />
            </label>
            <label>
              안전재고
              <input
                min="0"
                type="number"
                value={variant.safetyStock}
                onChange={(event) => updateVariant(index, { safetyStock: Number(event.target.value) })}
              />
            </label>
            <button
              type="button"
              className="secondary-button danger"
              disabled={variants.length === 1}
              onClick={() => removeVariant(index)}
            >
              삭제
            </button>
          </fieldset>
        ))}
      </div>
      {error ? <strong className="form-error">{error}</strong> : null}
      {createdProduct ? (
        <output className="form-success">
          {createdProduct.name} 등록 완료: {createdProduct.variants.length} SKU / {createdProduct.status}
        </output>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "등록 중" : "상품 등록"}
      </button>
    </form>
  );
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
