import { describe, expect, it } from "vitest";
import {
  createInMemoryRateLimiter,
  obtenerIdentificadorCliente,
} from "./rate-limit";

describe("createInMemoryRateLimiter", () => {
  it("permite hasta el limite y bloquea despues", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    const bloqueada = limiter.check("1.2.3.4");
    expect(bloqueada.allowed).toBe(false);
    expect(bloqueada.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("aisla buckets entre identificadores distintos", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
  });

  it("retryAfterSeconds nunca es menor a 1", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 1, max: 1 });
    limiter.check("a");
    const r = limiter.check("a");
    if (!r.allowed) {
      expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("obtenerIdentificadorCliente", () => {
  it("prioriza el primer IP en x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(obtenerIdentificadorCliente(h)).toBe("1.2.3.4");
  });

  it("usa x-real-ip si no hay xff", () => {
    const h = new Headers({ "x-real-ip": "5.6.7.8" });
    expect(obtenerIdentificadorCliente(h)).toBe("5.6.7.8");
  });

  it("devuelve anon si no hay headers", () => {
    expect(obtenerIdentificadorCliente(new Headers())).toBe("anon");
  });
});
