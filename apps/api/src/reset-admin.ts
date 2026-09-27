import "reflect-metadata";
import argon2 from "argon2";
import { db } from "./db";
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16)
    throw new Error(
      "Configure ADMIN_EMAIL and ADMIN_PASSWORD (16+ characters) first.",
    );
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE admins SET password_hash=$1 WHERE email=$2 RETURNING id",
      [await argon2.hash(password), email],
    );
    if (!result.rowCount) throw new Error("Administrator not found.");
    await client.query("DELETE FROM sessions WHERE admin_id=$1", [
      result.rows[0].id,
    ]);
    await client.query("COMMIT");
    console.log("Password replaced and existing sessions revoked.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
