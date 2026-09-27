import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const seed = JSON.parse(readFileSync("apps/api/src/seed.json", "utf8"));
test("Five substantive paired translations, unique slugs and valid content", () => {
  assert.equal(seed.posts.length, 10);
  for (const locale of ["es", "en"]) {
    const posts = seed.posts.filter((p) => p.locale === locale);
    assert.equal(new Set(posts.map((p) => p.slug)).size, 5);
    for (const p of posts) {
      assert.ok(p.body.split(/\s+/).length > 190);
      assert.ok(
        seed.posts.some(
          (other) => other.key === p.key && other.locale !== p.locale,
        ),
      );
    }
  }
});
test("Production never publishes host ports or uses source bind mounts", () => {
  const compose = readFileSync("compose.prod.yml", "utf8");
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.doesNotMatch(compose, /\.\//);
  assert.match(compose, /internal: true/);
  assert.match(compose, /read_only: true/);
});
