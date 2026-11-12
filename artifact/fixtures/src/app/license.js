function checksum(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function validateLicense(key, product, expected) {
  if (!key || !key.startsWith("ENT-")) return { valid: false, tier: "none" };
  const actual = checksum(key + ":" + product + ":enterprise-v4");
  const valid = actual === (expected >>> 0);
  return { valid, tier: valid ? "enterprise-unlimited" : "invalid", checksum: actual };
}

function issueLease(accountId, days) {
  const base = checksum(accountId + ":lease");
  return { accountId, days, lease: base.toString(16).padStart(8, "0") };
}

module.exports = { checksum, validateLicense, issueLease };
