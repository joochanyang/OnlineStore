import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import {
  OrderError,
  findShipment,
  insertAuditLog,
  recordShipmentTracking,
  withAuditContext,
} from "@commerce/db";
import {
  ShippingError,
  createShippingProvider,
  normalizeCarrier,
  type ShippingMode,
  type ShippingTrackingResult,
} from "@commerce/integrations/shipping";
import { NextResponse } from "next/server";

import { resolveAdminContext } from "../../../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function fail(requestId: string, status: number, code: string, message: string): NextResponse {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}

function resolveShippingMode(): ShippingMode {
  const raw = (process.env.SHIPPING_MODE ?? process.env.PAYMENT_MODE ?? "mock").toLowerCase();
  // sandbox payment mode → mock shipping until Phase 3 Slice 2 lands real adapters.
  return raw === "live" ? "live" : "mock";
}

export async function POST(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const auth = await resolveAdminContext(request, {
    permission: "order:write",
    requireCsrf: true,
  });
  if (!auth.ok) {
    return fail(auth.failure.code, auth.failure.status, auth.failure.code, auth.failure.message);
  }

  try {
    const result = await withAuditContext(
      {
        actorType: "ADMIN",
        actorId: auth.ctx.session.actorId,
        ip: auth.ctx.ip,
        userAgent: auth.ctx.userAgent,
        requestId: auth.ctx.requestId,
      },
      async () => {
        const shipment = await findShipment(id);
        if (!shipment.trackingNumber) {
          throw new OrderError(
            "INVALID_STATE",
            "shipment has no tracking number to query",
          );
        }
        const carrier = normalizeCarrier(shipment.carrier);
        const provider = createShippingProvider({ carrier, mode: resolveShippingMode() });
        const tracking: ShippingTrackingResult = await provider.track(shipment.trackingNumber);

        const recorded = await recordShipmentTracking({
          shipmentId: shipment.id,
          result: {
            status: tracking.status,
            statusDetail: tracking.events[tracking.events.length - 1]?.description,
            lastUpdatedAt: tracking.lastUpdatedAt,
            deliveredAt: tracking.deliveredAt,
          },
        });

        await insertAuditLog({
          action: "shipment.tracked",
          targetType: "Shipment",
          targetId: shipment.id,
          after: {
            status: tracking.status,
            lastUpdatedAt: tracking.lastUpdatedAt.toISOString(),
            deliveredAt: tracking.deliveredAt?.toISOString() ?? null,
            orderTransitionedToDelivered: recorded.orderTransitionedToDelivered,
          },
        });

        const refreshed = await findShipment(shipment.id);
        return { shipment: refreshed, tracking, recorded };
      },
    );

    const body: ApiEnvelope<{
      shipment: typeof result.shipment;
      tracking: ShippingTrackingResult;
      orderTransitionedToDelivered: boolean;
    }> = {
      requestId: auth.ctx.requestId,
      data: {
        shipment: result.shipment,
        tracking: result.tracking,
        orderTransitionedToDelivered: result.recorded.orderTransitionedToDelivered,
      },
    };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    if (err instanceof OrderError) {
      const status =
        err.code === "SHIPMENT_NOT_FOUND"
          ? 404
          : err.code === "INVALID_STATE"
            ? 409
            : 500;
      return fail(auth.ctx.requestId, status, err.code, err.message);
    }
    if (err instanceof ShippingError) {
      const status =
        err.code === "TRACKING_NOT_FOUND"
          ? 404
          : err.code === "INVALID_TRACKING_NUMBER"
            ? 422
            : err.code === "NOT_IMPLEMENTED"
              ? 501
              : 502;
      return fail(auth.ctx.requestId, status, err.code, err.message);
    }
    return fail(
      auth.ctx.requestId,
      500,
      "TRACK_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }
}
