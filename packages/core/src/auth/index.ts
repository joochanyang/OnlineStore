export type AdminRole = "OWNER" | "MERCHANDISER" | "FULFILLMENT" | "SUPPORT" | "ANALYST";

export type AdminPermission =
  | "product:read"
  | "product:write"
  | "inventory:read"
  | "inventory:reserve"
  | "order:read"
  | "order:write"
  | "customer:read"
  | "customer:write"
  | "promotion:read"
  | "promotion:write"
  | "supplier:read"
  | "supplier:write"
  | "cs:read"
  | "cs:write"
  | "report:read";

export type AdminSession = {
  actorId: string;
  email: string;
  roles: readonly AdminRole[];
};

export type ConsentType = "TERMS" | "PRIVACY" | "MARKETING_SMS" | "MARKETING_EMAIL" | "MARKETING_PUSH";

export type ConsentRecord = {
  customerId: string;
  type: ConsentType;
  granted: boolean;
  recordedAt: Date;
  source: "signup" | "checkout" | "account";
};

export type AdminWorkspace =
  | "catalog"
  | "inventory"
  | "orders"
  | "customers"
  | "promotions"
  | "suppliers"
  | "cs"
  | "reports";

export type AdminWorkspaceAccess = {
  workspace: AdminWorkspace;
  label: string;
  description: string;
  requiredPermissions: AdminPermission[];
  allowed: boolean;
};

export type CustomerShoppingStep = {
  step: "browse" | "account" | "cart" | "checkout" | "fulfillment" | "support";
  label: string;
  description: string;
  owner: "storefront" | "account" | "checkout" | "operations";
};

const permissionsByRole: Record<AdminRole, AdminPermission[]> = {
  OWNER: [
    "product:read",
    "product:write",
    "inventory:read",
    "inventory:reserve",
    "order:read",
    "order:write",
    "customer:read",
    "customer:write",
    "promotion:read",
    "promotion:write",
    "supplier:read",
    "supplier:write",
    "cs:read",
    "cs:write",
    "report:read",
  ],
  MERCHANDISER: [
    "product:read",
    "product:write",
    "inventory:read",
    "promotion:read",
    "promotion:write",
    "supplier:read",
    "supplier:write",
    "report:read",
  ],
  FULFILLMENT: ["inventory:read", "inventory:reserve", "order:read", "order:write"],
  SUPPORT: ["order:read", "customer:read", "customer:write", "cs:read", "cs:write"],
  ANALYST: ["product:read", "inventory:read", "order:read", "report:read"],
};

export const customerShoppingSteps: CustomerShoppingStep[] = [
  {
    step: "browse",
    label: "상품 탐색",
    description: "카테고리, 검색, 상품 상세, SKU 옵션, SEO 구조화 데이터를 고객 화면에서 담당합니다.",
    owner: "storefront",
  },
  {
    step: "account",
    label: "회원 계정",
    description: "약관/개인정보 동의, 주소록, 마케팅 수신 동의, 최근 본 상품을 계정 영역으로 분리합니다.",
    owner: "account",
  },
  {
    step: "cart",
    label: "장바구니",
    description: "SKU 정규화, 재고 가능 수량, 쿠폰/포인트 적용 전 견적을 주문 생성 전에 검증합니다.",
    owner: "checkout",
  },
  {
    step: "checkout",
    label: "주문/결제",
    description: "주문 금액을 확정하고 결제 provider intent를 만들어 외부 결제 교체 지점을 고정합니다.",
    owner: "checkout",
  },
  {
    step: "fulfillment",
    label: "배송 조회",
    description: "결제 완료 이후 출고, 운송장, 배송 완료 상태는 운영 콘솔과 고객 마이페이지가 공유합니다.",
    owner: "operations",
  },
  {
    step: "support",
    label: "취소/교환/반품",
    description: "CS 문의, 반품 접수, 환불 상태를 주문 상태 전이 규칙 안에서 처리합니다.",
    owner: "operations",
  },
];

const adminWorkspaceDefinitions: Omit<AdminWorkspaceAccess, "allowed">[] = [
  {
    workspace: "catalog",
    label: "상품/전시",
    description: "상품 등록, 옵션/SKU, 이미지, 판매 상태, 카테고리 전시를 관리합니다.",
    requiredPermissions: ["product:read", "product:write"],
  },
  {
    workspace: "inventory",
    label: "재고/발주",
    description: "안전 재고, 예약 수량, 품절 및 재입고 후보를 점검합니다.",
    requiredPermissions: ["inventory:read", "inventory:reserve"],
  },
  {
    workspace: "orders",
    label: "주문/배송",
    description: "결제 확인, 출고 준비, 배송 완료, 취소 상태 전이를 처리합니다.",
    requiredPermissions: ["order:read", "order:write"],
  },
  {
    workspace: "customers",
    label: "회원/CRM",
    description: "회원 정보, 주소록, 주문 이력, 고객 등급/동의 기록을 조회하고 정정합니다.",
    requiredPermissions: ["customer:read", "customer:write"],
  },
  {
    workspace: "promotions",
    label: "프로모션",
    description: "쿠폰, 포인트, 이벤트, 무료배송 정책을 운영합니다.",
    requiredPermissions: ["promotion:read", "promotion:write"],
  },
  {
    workspace: "suppliers",
    label: "공급처/수집",
    description: "외부 상품 수집, 후보 검수, 내부 상품 초안 전환을 관리합니다.",
    requiredPermissions: ["supplier:read", "supplier:write"],
  },
  {
    workspace: "cs",
    label: "CS/리뷰",
    description: "문의, 리뷰 검수, 교환/반품/환불 접수 상태를 관리합니다.",
    requiredPermissions: ["cs:read", "cs:write"],
  },
  {
    workspace: "reports",
    label: "리포트/감사",
    description: "매출, 재고, 운영 로그, 감사 추적을 조회합니다.",
    requiredPermissions: ["report:read"],
  },
];

export function listPermissions(session: AdminSession): AdminPermission[] {
  return Array.from(new Set(session.roles.flatMap((role) => permissionsByRole[role])));
}

export function hasPermission(session: AdminSession, permission: AdminPermission): boolean {
  return listPermissions(session).includes(permission);
}

export function buildAdminWorkspaceAccess(session: AdminSession): AdminWorkspaceAccess[] {
  const permissions = new Set(listPermissions(session));

  return adminWorkspaceDefinitions.map((workspace) => ({
    ...workspace,
    allowed: workspace.requiredPermissions.every((permission) => permissions.has(permission)),
  }));
}

export function assertPermission(session: AdminSession, permission: AdminPermission): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export function createConsentRecord(input: Omit<ConsentRecord, "recordedAt"> & { recordedAt?: Date }): ConsentRecord {
  if (!input.customerId.trim()) {
    throw new Error("customerId is required");
  }

  return {
    ...input,
    recordedAt: input.recordedAt ?? new Date(),
  };
}

export function hasActiveConsent(records: ConsentRecord[], type: ConsentType): boolean {
  const latest = records
    .filter((record) => record.type === type)
    .sort((left: ConsentRecord, right: ConsentRecord) => right.recordedAt.getTime() - left.recordedAt.getTime())[0];

  return latest?.granted ?? false;
}
