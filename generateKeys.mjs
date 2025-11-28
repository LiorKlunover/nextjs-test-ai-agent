import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import fs from "fs";

const keys = await generateKeyPair("RS256", {
    extractable: true,
});
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

const output = {
    JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, "\\n"), // Convex expects literal \n characters for newlines in the string
    JWKS: jwks
};

fs.writeFileSync("convex-keys.json", JSON.stringify(output, null, 2));
console.log("Keys written to convex-keys.json");
