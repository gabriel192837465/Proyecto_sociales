const { MAX_BODY_SIZE } = require("../../domain/constants");

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        if (typeof req.destroy === 'function') req.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(body);
      }
    });
    req.on("error", reject);
  });
}

module.exports = {
  parseBody,
  MAX_BODY_SIZE
};
