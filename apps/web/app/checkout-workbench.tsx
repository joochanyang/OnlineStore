"use client";

import type { CheckoutOrderResult, CheckoutPreview } from "@commerce/api/contracts";
import type { CatalogProduct } from "@commerce/db";
import { useMemo, useState } from "react";

type CartLine = {
  sku: string;
  name: string;
  option: string;
  quantity: number;
};

type ApiResult = {
  mode: "preview" | "order";
  data: CheckoutPreview | CheckoutOrderResult;
};

const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

export function CheckoutWorkbench({ products }: { products: CatalogProduct[] }) {
  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({
          sku: variant.sku,
          name: product.name,
          option: `${variant.color} / ${variant.size}`,
          stock: variant.stock,
          price: variant.price,
        })),
      ),
    [products],
  );
  const [selectedSku, setSelectedSku] = useState(variants[0]?.sku ?? "");
  const [customerId, setCustomerId] = useState("customer-seed");
  const [couponCode, setCouponCode] = useState("");
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [result, setResult] = useState<ApiResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVariant = variants.find((variant) => variant.sku === selectedSku);

  function addSelectedVariant() {
    if (!selectedVariant) {
      return;
    }

    setResult(undefined);
    setError(undefined);
    setCartLines((current) => {
      const existing = current.find((line) => line.sku === selectedVariant.sku);

      if (existing) {
        return current.map((line) =>
          line.sku === selectedVariant.sku ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...current,
        {
          sku: selectedVariant.sku,
          name: selectedVariant.name,
          option: selectedVariant.option,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(sku: string, quantity: number) {
    setResult(undefined);
    setCartLines((current) =>
      current
        .map((line) => (line.sku === sku ? { ...line, quantity: Math.max(1, quantity) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitCheckout(mode: ApiResult["mode"]) {
    if (cartLines.length === 0) {
      setError("장바구니에 상품을 먼저 담아주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch(mode === "preview" ? "/api/v1/checkout/preview" : "/api/v1/checkout/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          couponCode: couponCode || undefined,
          paymentProvider: "mock",
          lines: cartLines.map((line) => ({
            sku: line.sku,
            quantity: line.quantity,
          })),
        }),
      });
      const payload = (await response.json()) as
        | { data: CheckoutPreview | CheckoutOrderResult }
        | { error: { message: string } };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error.message : "Checkout request failed");
      }

      setResult({ mode, data: payload.data });
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "체크아웃 요청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="checkout-grid" aria-label="Checkout workflow">
      <div className="checkout-panel">
        <p className="eyebrow">Cart builder</p>
        <h2>장바구니 구성</h2>
        <label>
          Customer ID
          <input value={customerId} onChange={(event) => setCustomerId(event.target.value)} />
        </label>
        <label>
          SKU option
          <select value={selectedSku} onChange={(event) => setSelectedSku(event.target.value)}>
            {variants.map((variant) => (
              <option key={variant.sku} value={variant.sku}>
                {variant.name} / {variant.option} / {money(variant.price)} / {variant.stock}개
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={addSelectedVariant}>
          장바구니 담기
        </button>
        <div className="cart-lines">
          {cartLines.length === 0 ? <p>선택한 SKU가 여기에 표시됩니다.</p> : null}
          {cartLines.map((line) => (
            <div key={line.sku}>
              <span>
                <strong>{line.name}</strong>
                {line.sku} / {line.option}
              </span>
              <input
                aria-label={`${line.sku} quantity`}
                min="1"
                type="number"
                value={line.quantity}
                onChange={(event) => updateQuantity(line.sku, Number(event.target.value))}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="checkout-panel">
        <p className="eyebrow">Member checkout</p>
        <h2>주문 견적과 생성</h2>
        <label>
          Coupon code
          <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="선택 입력" />
        </label>
        <div className="checkout-actions">
          <button type="button" disabled={isSubmitting} onClick={() => submitCheckout("preview")}>
            견적 확인
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => submitCheckout("order")}>
            주문 생성
          </button>
        </div>
        {error ? <strong className="checkout-error">{error}</strong> : null}
        {result ? (
          <dl className="checkout-result">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(result.data.subtotal.amount)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{money(result.data.shippingFee.amount)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>{money(result.data.discount.amount)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{money(result.data.total.amount)}</dd>
            </div>
            {"orderId" in result.data ? (
              <div>
                <dt>Order</dt>
                <dd>{result.data.orderId}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
