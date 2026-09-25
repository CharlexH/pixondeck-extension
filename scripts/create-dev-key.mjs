import { generateKeyPairSync, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
const { publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});
const extensionId = createHash("sha256")
  .update(publicKey)
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (character) =>
    String.fromCharCode(97 + parseInt(character, 16)),
  );
await writeFile(
  "development-key.json",
  JSON.stringify(
    { publicKey: publicKey.toString("base64"), extensionId },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(`Development extension ID: ${extensionId}`);
