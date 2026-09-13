<<<<<<< HEAD
const { rateLimit } = require("../../src/server/http/middleware/rate-limit");

describe("rateLimit middleware", () => {
  let req, res;

  beforeEach(() => {
    jest.resetModules();
  });

  function makeMockRes() {
    const headers = {};
    return {
      headers,
      setHeader: jest.fn((name, value) => {
        headers[name] = value;
      }),
      writeHead: jest.fn(),
      end: jest.fn(),
    };
  }

  it("should allow request and set correct headers", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = { headers: {}, socket: { remoteAddress: "192.168.1.1" } };
    res = makeMockRes();

    const allowed = rateLimit(req, res);
    expect(allowed).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 120);
    expect(res.headers["X-RateLimit-Remaining"]).toBe(119);
    expect(res.headers["X-RateLimit-Reset"]).toBeGreaterThan(0);
  });

  it("should block request and return 429 when limit is exceeded", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = { headers: {}, socket: { remoteAddress: "192.168.1.2" } };

    for (let i = 0; i < 120; i++) {
      res = makeMockRes();
      rateLimit(req, res);
    }

    res = makeMockRes();
    const allowed = rateLimit(req, res);
    expect(allowed).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(res.end).toHaveBeenCalled();
    const responseBody = JSON.parse(res.end.mock.calls[0][0]);
    expect(responseBody.error).toBe("Demasiadas solicitudes. Intentá de nuevo en 60 segundos.");
  });

  it("should trust proxy when trustProxy option is enabled", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = {
      headers: { "x-forwarded-for": "10.0.0.1" },
      socket: { remoteAddress: "192.168.1.3" }
    };
    res = makeMockRes();

    const allowed = rateLimit(req, res, { trustProxy: true });
    expect(allowed).toBe(true);

    const res2 = makeMockRes();
    rateLimit({ headers: { "x-forwarded-for": "10.0.0.1" }, socket: { remoteAddress: "192.168.1.3" } }, res2, { trustProxy: false });
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);
  });

  it("should extract and trim the first IP address from comma-separated X-Forwarded-For header", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
      socket: { remoteAddress: "192.168.1.4" }
    };
    res = makeMockRes();

    rateLimit(req, res, { trustProxy: true });

    const req2 = {
      headers: { "x-forwarded-for": "1.2.3.4" },
      socket: { remoteAddress: "192.168.1.4" }
    };
    const res2 = makeMockRes();
    rateLimit(req2, res2, { trustProxy: true });

    expect(res2.headers["X-RateLimit-Remaining"]).toBe(118);
  });

  it("should clean up expired entries on interval, leaving unexpired ones", () => {
    jest.useFakeTimers();
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    
    const req1 = { headers: {}, socket: { remoteAddress: "192.168.1.99" } };
    const res1 = makeMockRes();
    rateLimit(req1, res1);

    jest.advanceTimersByTime(30000);

    const res1_2 = makeMockRes();
    rateLimit(req1, res1_2);
    expect(res1_2.headers["X-RateLimit-Remaining"]).toBe(118);

    jest.advanceTimersByTime(61000);

    const res2 = makeMockRes();
    rateLimit(req1, res2);
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);

    jest.useRealTimers();
  });

  it("should fallback to unknown IP when remoteAddress is not present", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    const req1 = { headers: {}, socket: {} };
    const res1 = makeMockRes();
    rateLimit(req1, res1);
    expect(res1.headers["X-RateLimit-Remaining"]).toBe(119);
  });

  it("should reset window if entry is expired inside rateLimit", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    
    const baseTime = Date.now();
    const dateSpy = jest.spyOn(Date, "now");
    
    dateSpy.mockReturnValue(baseTime);
    req = { headers: {}, socket: { remoteAddress: "192.168.1.102" } };
    res = makeMockRes();
    rateLimit(req, res);
    expect(res.headers["X-RateLimit-Remaining"]).toBe(119);

    dateSpy.mockReturnValue(baseTime + 65000);
    const res2 = makeMockRes();
    rateLimit(req, res2);
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);

    dateSpy.mockRestore();
  });
});
=======
const { rateLimit } = require("../../src/server/http/middleware/rate-limit");

describe("rateLimit middleware", () => {
  let req, res;

  beforeEach(() => {
    jest.resetModules();
  });

  function makeMockRes() {
    const headers = {};
    return {
      headers,
      setHeader: jest.fn((name, value) => {
        headers[name] = value;
      }),
      writeHead: jest.fn(),
      end: jest.fn(),
    };
  }

  it("should allow request and set correct headers", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = { headers: {}, socket: { remoteAddress: "192.168.1.1" } };
    res = makeMockRes();

    const allowed = rateLimit(req, res);
    expect(allowed).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 120);
    expect(res.headers["X-RateLimit-Remaining"]).toBe(119);
    expect(res.headers["X-RateLimit-Reset"]).toBeGreaterThan(0);
  });

  it("should block request and return 429 when limit is exceeded", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = { headers: {}, socket: { remoteAddress: "192.168.1.2" } };

    for (let i = 0; i < 120; i++) {
      res = makeMockRes();
      rateLimit(req, res);
    }

    res = makeMockRes();
    const allowed = rateLimit(req, res);
    expect(allowed).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(res.end).toHaveBeenCalled();
    const responseBody = JSON.parse(res.end.mock.calls[0][0]);
    expect(responseBody.error).toBe("Demasiadas solicitudes. Intentá de nuevo en 60 segundos.");
  });

  it("should trust proxy when trustProxy option is enabled", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = {
      headers: { "x-forwarded-for": "10.0.0.1" },
      socket: { remoteAddress: "192.168.1.3" }
    };
    res = makeMockRes();

    const allowed = rateLimit(req, res, { trustProxy: true });
    expect(allowed).toBe(true);

    const res2 = makeMockRes();
    rateLimit({ headers: { "x-forwarded-for": "10.0.0.1" }, socket: { remoteAddress: "192.168.1.3" } }, res2, { trustProxy: false });
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);
  });

  it("should extract and trim the first IP address from comma-separated X-Forwarded-For header", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
      socket: { remoteAddress: "192.168.1.4" }
    };
    res = makeMockRes();

    rateLimit(req, res, { trustProxy: true });

    const req2 = {
      headers: { "x-forwarded-for": "1.2.3.4" },
      socket: { remoteAddress: "192.168.1.4" }
    };
    const res2 = makeMockRes();
    rateLimit(req2, res2, { trustProxy: true });

    expect(res2.headers["X-RateLimit-Remaining"]).toBe(118);
  });

  it("should clean up expired entries on interval, leaving unexpired ones", () => {
    jest.useFakeTimers();
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    
    const req1 = { headers: {}, socket: { remoteAddress: "192.168.1.99" } };
    const res1 = makeMockRes();
    rateLimit(req1, res1);

    jest.advanceTimersByTime(30000);

    const res1_2 = makeMockRes();
    rateLimit(req1, res1_2);
    expect(res1_2.headers["X-RateLimit-Remaining"]).toBe(118);

    jest.advanceTimersByTime(61000);

    const res2 = makeMockRes();
    rateLimit(req1, res2);
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);

    jest.useRealTimers();
  });

  it("should fallback to unknown IP when remoteAddress is not present", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    const req1 = { headers: {}, socket: {} };
    const res1 = makeMockRes();
    rateLimit(req1, res1);
    expect(res1.headers["X-RateLimit-Remaining"]).toBe(119);
  });

  it("should reset window if entry is expired inside rateLimit", () => {
    const { rateLimit } = require("../../src/server/http/middleware/rate-limit");
    
    const baseTime = Date.now();
    const dateSpy = jest.spyOn(Date, "now");
    
    dateSpy.mockReturnValue(baseTime);
    req = { headers: {}, socket: { remoteAddress: "192.168.1.102" } };
    res = makeMockRes();
    rateLimit(req, res);
    expect(res.headers["X-RateLimit-Remaining"]).toBe(119);

    dateSpy.mockReturnValue(baseTime + 65000);
    const res2 = makeMockRes();
    rateLimit(req, res2);
    expect(res2.headers["X-RateLimit-Remaining"]).toBe(119);

    dateSpy.mockRestore();
  });
});
>>>>>>> origin/main
