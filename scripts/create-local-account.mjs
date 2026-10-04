#!/usr/bin/env node
// Prints the SQL that creates one admin account, for a fresh *local* stack only.
//
// There's no self-registration endpoint (accounts are admin-created, see AuthController), so a
// brand-new database has nobody who can log in to create the first account. This closes that
// gap for local development: pipe its output into the compose stack's Postgres, log in as the
// account it creates, and add any further accounts from the in-app admin page (/admin/users).
//
//   node scripts/create-local-account.mjs <email> <display-name> <password> \
//     | docker compose -f infra/docker-compose.yml exec -T db psql -U heliograph -d heliograph
//
// The password hash is ASP.NET Core Identity's v3 format (PBKDF2-HMAC-SHA512, 100,000
// iterations, 128-bit salt, 256-bit subkey), the same thing UserManager.CreateAsync writes, so
// the normal login path verifies it. No third-party dependencies — only Node builtins.

import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'

const [email, displayName, password] = process.argv.slice(2).map((a) => a?.trim())
if (!email || !displayName || !password) {
  console.error('usage: node scripts/create-local-account.mjs <email> <display-name> <password>')
  process.exit(1)
}
if (displayName.length > 32) {
  console.error('display name must be 1-32 characters')
  process.exit(1)
}

function identityV3Hash(pw) {
  const iterations = 100_000
  const salt = randomBytes(16)
  const subkey = pbkdf2Sync(pw, salt, iterations, 32, 'sha512')
  const header = Buffer.alloc(13)
  header.writeUInt8(0x01, 0) // format marker: v3
  header.writeUInt32BE(2, 1) // KeyDerivationPrf.HMACSHA512
  header.writeUInt32BE(iterations, 5)
  header.writeUInt32BE(salt.length, 9)
  return Buffer.concat([header, salt, subkey]).toString('base64')
}

const sql = (s) => `'${s.replaceAll("'", "''")}'`
const discriminator = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')

console.log(`INSERT INTO "AspNetUsers" (
  "Id", "DisplayName", "Discriminator", "UserName", "NormalizedUserName", "Email", "NormalizedEmail",
  "EmailConfirmed", "PasswordHash", "SecurityStamp", "ConcurrencyStamp",
  "PhoneNumberConfirmed", "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount", "IsAdmin")
VALUES (
  ${sql(randomUUID())}, ${sql(displayName)}, ${sql(discriminator)}, ${sql(email)}, ${sql(email.toUpperCase())},
  ${sql(email)}, ${sql(email.toUpperCase())},
  false, ${sql(identityV3Hash(password))}, ${sql(randomUUID().replaceAll('-', '').toUpperCase())}, ${sql(randomUUID())},
  false, false, true, 0, true);`)
