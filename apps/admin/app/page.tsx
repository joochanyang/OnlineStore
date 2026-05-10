import { buildAdminWorkspaceAccess, listPermissions, type AdminSession } from "@commerce/core/auth";
import { listReorderCandidates, summarizeInventory } from "@commerce/core/inventory";
import { canTransitionOrder, createOrderDraft } from "@commerce/core/order";
import { getAdminDashboard, listAdminCatalogProducts } from "@commerce/db";
import { redirect } from "next/navigation";
import { getServerAdminSession } from "./lib/auth-context";
import { ProductCreateForm } from "./product-create-form";

export default async function AdminHome() {
  const session = await getServerAdminSession();

  if (!session) {
    redirect("/login");
  }

  const [dashboard, products] = await Promise.all([getAdminDashboard(session), listAdminCatalogProducts()]);
  const summary = summarizeInventory(dashboard.inventory);
  const reorderCandidates = listReorderCandidates(dashboard.inventory);
  const actor: AdminSession = dashboard.actor;
  const permissions = listPermissions(session);
  const workspaceAccess = buildAdminWorkspaceAccess(session);
  const openWorkspaces = workspaceAccess.filter((workspace) => workspace.allowed);
  const draftOrder = createOrderDraft(dashboard.orderDraft);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Commerce admin</p>
          <h1>카페24형 쇼핑몰 운영을 위한 관리자 콘솔 설계</h1>
        </div>
        <div className="admin-session">
          <strong>{openWorkspaces.length}/{workspaceAccess.length} areas</strong>
          <form action="/api/v1/auth/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>
      <section className="metric-grid" aria-label="Inventory summary">
        <article>
          <span>Total SKUs</span>
          <strong>{summary.skuCount}</strong>
        </article>
        <article>
          <span>Out of stock</span>
          <strong>{summary.outOfStockCount}</strong>
        </article>
        <article>
          <span>Ready stock</span>
          <strong>{summary.totalStock}</strong>
        </article>
        <article>
          <span>Reorder queue</span>
          <strong>{reorderCandidates.length}</strong>
        </article>
        <article>
          <span>Granted workspaces</span>
          <strong>{openWorkspaces.length}</strong>
        </article>
      </section>
      <section className="workspace-panel" aria-labelledby="workspace-title">
        <div className="section-head-row">
          <div>
            <span className="section-label">Cafe24-style admin map</span>
            <h2 id="workspace-title">운영 메뉴와 권한 경계</h2>
          </div>
          <strong>{permissions.length} permissions</strong>
        </div>
        <div className="workspace-grid">
          {workspaceAccess.map((workspace) => (
            <article className={workspace.allowed ? "workspace-card allowed" : "workspace-card locked"} key={workspace.workspace}>
              <div>
                <span>{workspace.allowed ? "enabled" : "locked"}</span>
                <h3>{workspace.label}</h3>
                <p>{workspace.description}</p>
              </div>
              <small>{workspace.requiredPermissions.join(", ")}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="ops-grid" aria-label="Operational readiness">
        <article>
          <div>
            <span className="section-label">Role boundary</span>
            <h2>{session.roles.join(", ")}</h2>
          </div>
          <ul className="permission-list">
            {permissions.slice(0, 6).map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        </article>
        <article>
          <div>
            <span className="section-label">Order draft</span>
            <h2>{draftOrder.totalPrice.toLocaleString("ko-KR")}원</h2>
          </div>
          <dl className="order-breakdown">
            <div>
              <dt>Subtotal</dt>
              <dd>{draftOrder.subtotalPrice.toLocaleString("ko-KR")}원</dd>
            </div>
            <div>
              <dt>Fulfillment next</dt>
              <dd>{canTransitionOrder("PAID", "FULFILLING") ? "ready" : "blocked"}</dd>
            </div>
          </dl>
        </article>
      </section>
      <section className="management-grid" aria-label="Management workbench">
        <article className="wide-panel">
          <ProductCreateForm actorId={session.actorId} />
        </article>
        <article className="wide-panel">
          <div className="section-head-row">
            <div>
              <span className="section-label">Catalog records</span>
              <h2>등록 상품 현황</h2>
            </div>
            <strong>{products.length} items</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>상품</th>
                <th>Status</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <small>{product.slug}</small>
                  </td>
                  <td>{product.status}</td>
                  <td>{product.variants.length}</td>
                  <td>{product.stock}</td>
                  <td>{product.price.toLocaleString("ko-KR")}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article>
          <div className="section-head-row">
            <div>
              <span className="section-label">Inventory editor</span>
              <h2>SKU 재고 관리</h2>
            </div>
            <strong>{reorderCandidates.length} low</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Stock</th>
                <th>Safety</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.inventory.map((item) => (
                <tr key={item.sku}>
                  <td>{item.sku}</td>
                  <td>{item.stock}</td>
                  <td>{item.safetyStock}</td>
                  <td>{item.stock <= item.safetyStock ? "reorder" : "ready"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article>
          <span className="section-label">Product publishing</span>
          <h2>상품 상태 변경</h2>
          <form className="admin-form" action="/api/v1/products/seed-essential-shirt/status" method="post">
            <label>
              Status
              <select name="status" defaultValue="ACTIVE">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <button type="submit">Status API</button>
          </form>
        </article>
        <article>
          <span className="section-label">Order operations</span>
          <h2>주문 처리 단계</h2>
          <ul className="workflow-list">
            <li>{canTransitionOrder("PENDING_PAYMENT", "PAID") ? "결제 확인 가능" : "결제 대기 잠김"}</li>
            <li>{canTransitionOrder("PAID", "FULFILLING") ? "출고 준비 가능" : "출고 준비 잠김"}</li>
            <li>{canTransitionOrder("SHIPPED", "DELIVERED") ? "배송 완료 가능" : "배송 완료 잠김"}</li>
            <li>{canTransitionOrder("DELIVERED", "RETURN_REQUESTED") ? "반품 접수 가능" : "반품 접수 잠김"}</li>
          </ul>
        </article>
        <article>
          <span className="section-label">Customer boundary</span>
          <h2>회원/권한 관리</h2>
          <dl className="customer-list">
            <div>
              <dt>Admin</dt>
              <dd>{actor.email}</dd>
            </div>
            <div>
              <dt>Roles</dt>
              <dd>{actor.roles.join(", ")}</dd>
            </div>
            <div>
              <dt>Readable permissions</dt>
              <dd>{permissions.filter((permission) => permission.endsWith(":read")).length}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
