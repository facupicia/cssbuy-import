import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { loadEnvConfig } from "@next/env";
import { recoverAccount } from "../src/lib/account-recovery";
import { getPool } from "../src/lib/db";

async function main() {
  if (!process.stdin.isTTY) throw new Error("Usá una terminal interactiva para no exponer tu contraseña.");
  loadEnvConfig(process.cwd());
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const email = await input.question("Email de la cuenta: ");
    process.stdout.write("Nueva contraseña (no se muestra): ");
    hidden = true;
    const password = await input.question("");
    process.stdout.write("\nRepetí la contraseña: ");
    const confirmation = await input.question("");
    hidden = false;
    process.stdout.write("\n");
    if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
    await recoverAccount(email, password);
    console.log("Contraseña actualizada. Todas las sesiones de esa cuenta se cerraron.");
  } finally { input.close(); await getPool().end(); }
}

main().catch(() => {
  console.error("No se pudo recuperar la cuenta. Revisá el email, PostgreSQL y que ambas contraseñas coincidan y tengan de 12 a 128 caracteres.");
  process.exitCode = 1;
});
