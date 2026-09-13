<<<<<<< HEAD
const crypto = require("node:crypto");
const { safeEq, signId, verifySignedId } = require("../../src/server/infra/security");

// R4-001: la cookie de identidad se firma con HMAC-SHA256 (secret, id) en
// base64url. El formato del valor de cookie es `<id>.<sig>`; la firma impide
// forjar la cookie de una víctima cuyo UUID es público (rankings).
describe("signId", () => {
  const SECRET = "test-secret-cookie";

  it("produce `<id>.<sig>` donde sig es HMAC-SHA256(secret, id) en base64url", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const value = signId(id, SECRET);

    expect(value).toMatch(/^[0-9a-f-]+\.[A-Za-z0-9_-]+$/);
    const expectedSig = crypto.createHmac("sha256", SECRET).update(id).digest("base64url");
    expect(value).toBe(`${id}.${expectedSig}`);
  });

  it("es determinístico para el mismo id y secret", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(signId(id, SECRET)).toBe(signId(id, SECRET));
  });

  it("produce firmas distintas para ids distintos", () => {
    const a = signId("550e8400-e29b-41d4-a716-446655440000", SECRET);
    const b = signId("6ba7b810-9dad-11d1-80b4-00c04fd430c8", SECRET);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });
});

describe("verifySignedId", () => {
  const SECRET = "test-secret-cookie";
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("devuelve el id cuando la firma es válida", () => {
    expect(verifySignedId(signId(id, SECRET), SECRET)).toBe(id);
  });

  it("devuelve null si la firma fue alterada", () => {
    const value = signId(id, SECRET);
    const tampered = `${value.slice(0, -2)}zz`;
    expect(verifySignedId(tampered, SECRET)).toBeNull();
  });

  it("devuelve null si el secret no coincide (firma de otra instancia)", () => {
    const value = signId(id, "otro-secret");
    expect(verifySignedId(value, SECRET)).toBeNull();
  });

  it("devuelve null para un valor sin el separador `.` (cookie vieja sin firma)", () => {
    expect(verifySignedId(id, SECRET)).toBeNull();
  });

  it("devuelve null para valores vacíos o no string", () => {
    expect(verifySignedId("", SECRET)).toBeNull();
    expect(verifySignedId(undefined, SECRET)).toBeNull();
    expect(verifySignedId(null, SECRET)).toBeNull();
  });

  it("devuelve null si la firma es de OTRO id (swap de id sobre firma válida)", () => {
    const otroId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const value = signId(otroId, SECRET);
    const swapped = `${id}.${value.split(".")[1]}`;
    expect(verifySignedId(swapped, SECRET)).toBeNull();
  });
});

describe("safeEq", () => {
  describe("string inputs", () => {
    it("returns true for equal strings", () => {
      expect(safeEq("historia", "historia")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(safeEq("historia", "quizgame")).toBe(false);
    });

    it("returns false for strings of different length", () => {
      expect(safeEq("short", "much-longer-string")).toBe(false);
    });

    it("returns true for empty strings", () => {
      expect(safeEq("", "")).toBe(true);
    });

    it("returns false for empty vs non-empty", () => {
      expect(safeEq("", "notempty")).toBe(false);
    });
  });

  describe("buffer inputs", () => {
    it("returns true for equal buffers", () => {
      const a = Buffer.from("token-secreto");
      const b = Buffer.from("token-secreto");
      expect(safeEq(a, b)).toBe(true);
    });

    it("returns false for different buffers", () => {
      const a = Buffer.from("token-secreto");
      const b = Buffer.from("otro-token-xx");
      expect(safeEq(a, b)).toBe(false);
    });

    it("returns false for buffers of different length", () => {
      const a = Buffer.from("short");
      const b = Buffer.from("much-longer-buffer");
      expect(safeEq(a, b)).toBe(false);
    });

    it("returns true for empty buffers", () => {
      expect(safeEq(Buffer.alloc(0), Buffer.alloc(0))).toBe(true);
    });
  });

  describe("null / undefined handling", () => {
    it("returns true for null vs null", () => {
      expect(safeEq(null, null)).toBe(true);
    });

    it("returns true for undefined vs undefined", () => {
      expect(safeEq(undefined, undefined)).toBe(true);
    });

    it("returns true for null vs undefined (both coerce to empty string)", () => {
      expect(safeEq(null, undefined)).toBe(true);
    });

    it("returns false for null vs non-empty string", () => {
      expect(safeEq(null, "algo")).toBe(false);
    });

    it("returns false for undefined vs non-empty string", () => {
      expect(safeEq(undefined, "algo")).toBe(false);
    });
  });

  describe("mixed input types", () => {
    it("coerces number to string for comparison", () => {
      expect(safeEq(123, "123")).toBe(true);
    });

    it("coerces number to string — mismatch", () => {
      expect(safeEq(123, "456")).toBe(false);
    });

    it("one buffer + one string falls through to string coercion path", () => {
      // When only one is a Buffer, the Buffer.isBuffer(a) && Buffer.isBuffer(b) check fails.
      // Both get coerced via String(). String(Buffer.from("hello")) === "hello" in Node.js.
      const buf = Buffer.from("hello");
      expect(safeEq(buf, "hello")).toBe(true);
    });

    it("one buffer + one different string returns false", () => {
      const buf = Buffer.from("hello");
      expect(safeEq(buf, "world")).toBe(false);
    });
  });
});
=======
const crypto = require("node:crypto");
const { safeEq, signId, verifySignedId } = require("../../src/server/infra/security");

// R4-001: la cookie de identidad se firma con HMAC-SHA256 (secret, id) en
// base64url. El formato del valor de cookie es `<id>.<sig>`; la firma impide
// forjar la cookie de una víctima cuyo UUID es público (rankings).
describe("signId", () => {
  const SECRET = "test-secret-cookie";

  it("produce `<id>.<sig>` donde sig es HMAC-SHA256(secret, id) en base64url", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const value = signId(id, SECRET);

    expect(value).toMatch(/^[0-9a-f-]+\.[A-Za-z0-9_-]+$/);
    const expectedSig = crypto.createHmac("sha256", SECRET).update(id).digest("base64url");
    expect(value).toBe(`${id}.${expectedSig}`);
  });

  it("es determinístico para el mismo id y secret", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(signId(id, SECRET)).toBe(signId(id, SECRET));
  });

  it("produce firmas distintas para ids distintos", () => {
    const a = signId("550e8400-e29b-41d4-a716-446655440000", SECRET);
    const b = signId("6ba7b810-9dad-11d1-80b4-00c04fd430c8", SECRET);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });
});

describe("verifySignedId", () => {
  const SECRET = "test-secret-cookie";
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("devuelve el id cuando la firma es válida", () => {
    expect(verifySignedId(signId(id, SECRET), SECRET)).toBe(id);
  });

  it("devuelve null si la firma fue alterada", () => {
    const value = signId(id, SECRET);
    const tampered = `${value.slice(0, -2)}zz`;
    expect(verifySignedId(tampered, SECRET)).toBeNull();
  });

  it("devuelve null si el secret no coincide (firma de otra instancia)", () => {
    const value = signId(id, "otro-secret");
    expect(verifySignedId(value, SECRET)).toBeNull();
  });

  it("devuelve null para un valor sin el separador `.` (cookie vieja sin firma)", () => {
    expect(verifySignedId(id, SECRET)).toBeNull();
  });

  it("devuelve null para valores vacíos o no string", () => {
    expect(verifySignedId("", SECRET)).toBeNull();
    expect(verifySignedId(undefined, SECRET)).toBeNull();
    expect(verifySignedId(null, SECRET)).toBeNull();
  });

  it("devuelve null si la firma es de OTRO id (swap de id sobre firma válida)", () => {
    const otroId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const value = signId(otroId, SECRET);
    const swapped = `${id}.${value.split(".")[1]}`;
    expect(verifySignedId(swapped, SECRET)).toBeNull();
  });
});

describe("safeEq", () => {
  describe("string inputs", () => {
    it("returns true for equal strings", () => {
      expect(safeEq("historia", "historia")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(safeEq("historia", "quizgame")).toBe(false);
    });

    it("returns false for strings of different length", () => {
      expect(safeEq("short", "much-longer-string")).toBe(false);
    });

    it("returns true for empty strings", () => {
      expect(safeEq("", "")).toBe(true);
    });

    it("returns false for empty vs non-empty", () => {
      expect(safeEq("", "notempty")).toBe(false);
    });
  });

  describe("buffer inputs", () => {
    it("returns true for equal buffers", () => {
      const a = Buffer.from("token-secreto");
      const b = Buffer.from("token-secreto");
      expect(safeEq(a, b)).toBe(true);
    });

    it("returns false for different buffers", () => {
      const a = Buffer.from("token-secreto");
      const b = Buffer.from("otro-token-xx");
      expect(safeEq(a, b)).toBe(false);
    });

    it("returns false for buffers of different length", () => {
      const a = Buffer.from("short");
      const b = Buffer.from("much-longer-buffer");
      expect(safeEq(a, b)).toBe(false);
    });

    it("returns true for empty buffers", () => {
      expect(safeEq(Buffer.alloc(0), Buffer.alloc(0))).toBe(true);
    });
  });

  describe("null / undefined handling", () => {
    it("returns true for null vs null", () => {
      expect(safeEq(null, null)).toBe(true);
    });

    it("returns true for undefined vs undefined", () => {
      expect(safeEq(undefined, undefined)).toBe(true);
    });

    it("returns true for null vs undefined (both coerce to empty string)", () => {
      expect(safeEq(null, undefined)).toBe(true);
    });

    it("returns false for null vs non-empty string", () => {
      expect(safeEq(null, "algo")).toBe(false);
    });

    it("returns false for undefined vs non-empty string", () => {
      expect(safeEq(undefined, "algo")).toBe(false);
    });
  });

  describe("mixed input types", () => {
    it("coerces number to string for comparison", () => {
      expect(safeEq(123, "123")).toBe(true);
    });

    it("coerces number to string — mismatch", () => {
      expect(safeEq(123, "456")).toBe(false);
    });

    it("one buffer + one string falls through to string coercion path", () => {
      // When only one is a Buffer, the Buffer.isBuffer(a) && Buffer.isBuffer(b) check fails.
      // Both get coerced via String(). String(Buffer.from("hello")) === "hello" in Node.js.
      const buf = Buffer.from("hello");
      expect(safeEq(buf, "hello")).toBe(true);
    });

    it("one buffer + one different string returns false", () => {
      const buf = Buffer.from("hello");
      expect(safeEq(buf, "world")).toBe(false);
    });
  });
});
>>>>>>> origin/main
