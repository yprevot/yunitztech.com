import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLegalAddress,
  formatJurisdiction,
  cleanLegalText,
  addressEndsWithCountry,
} from "../apps/web/src/lib/legal.ts";

test("C2: addressEndsWithCountry handles various formats and normalizations", () => {
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos, México", "México"),
    true,
  );
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos, Mexico", "México"),
    true,
  );
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos, MEXICO", "México"),
    true,
  );
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos, MÉXICO", "méxico"),
    true,
  );
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos - México", "México"),
    true,
  );
  assert.equal(
    addressEndsWithCountry("Cuernavaca, Morelos", "México"),
    false,
  );
  assert.equal(
    addressEndsWithCountry("Calle México 123", "México"),
    false,
  );
  assert.equal(
    addressEndsWithCountry("Paseo Nuevo México", "México"),
    true,
  );
  assert.equal(addressEndsWithCountry("México", "México"), true);
  assert.equal(addressEndsWithCountry("", "México"), false);
  assert.equal(addressEndsWithCountry("Cuernavaca", ""), false);
});

test("C2: cleanLegalText strips trailing punctuation and whitespace", () => {
  assert.equal(
    cleanLegalText("Cuernavaca, Morelos, México."),
    "Cuernavaca, Morelos, México",
  );
  assert.equal(
    cleanLegalText("Cuernavaca, Morelos, México..  "),
    "Cuernavaca, Morelos, México",
  );
  assert.equal(
    cleanLegalText("Cuernavaca, Morelos, "),
    "Cuernavaca, Morelos",
  );
  assert.equal(cleanLegalText("México."), "México");
  assert.equal(cleanLegalText("  "), "");
  assert.equal(cleanLegalText(null), "");
});

test("C2: formatLegalAddress covers all combinations with/without trailing dot and with/without country", () => {
  const cases = [
    {
      description: "Address with trailing dot, containing country",
      address: "Cuernavaca, Morelos, México.",
      country: "México",
      expected: "Cuernavaca, Morelos, México.",
    },
    {
      description: "Address without trailing dot, containing country",
      address: "Cuernavaca, Morelos, México",
      country: "México",
      expected: "Cuernavaca, Morelos, México.",
    },
    {
      description: "Address with trailing dot, without country",
      address: "Cuernavaca, Morelos.",
      country: "México",
      expected: "Cuernavaca, Morelos. México.",
    },
    {
      description: "Address without trailing dot, without country",
      address: "Cuernavaca, Morelos",
      country: "México",
      expected: "Cuernavaca, Morelos. México.",
    },
    {
      description: "Address with multiple trailing dots/spaces and country in lowercase/unaccented",
      address: "Cuernavaca, Morelos, mexico...   ",
      country: "México",
      expected: "Cuernavaca, Morelos, mexico.",
    },
    {
      description: "Address with country in UPPERCASE",
      address: "Cuernavaca, Morelos, MÉXICO.",
      country: "México",
      expected: "Cuernavaca, Morelos, MÉXICO.",
    },
    {
      description: "Country with trailing dot",
      address: "Cuernavaca, Morelos",
      country: "México.",
      expected: "Cuernavaca, Morelos. México.",
    },
    {
      description: "Address without country, and country empty/undefined",
      address: "Cuernavaca, Morelos.",
      country: "",
      expected: "Cuernavaca, Morelos.",
    },
    {
      description: "Address with trailing comma, without country",
      address: "Cuernavaca, Morelos, ",
      country: "México",
      expected: "Cuernavaca, Morelos. México.",
    },
    {
      description: "Address empty/pending, country provided",
      address: "",
      country: "México",
      placeholder: "[Pendiente]",
      expected: "[Pendiente]. México.",
    },
    {
      description: "Address empty/pending, country empty",
      address: "",
      country: "",
      placeholder: "[Pendiente]",
      expected: "[Pendiente].",
    },
    {
      description: "English placeholder, address without country",
      address: "123 Main Street",
      country: "United States",
      placeholder: "[Pending]",
      expected: "123 Main Street. United States.",
    },
    {
      description: "English placeholder, address already with country",
      address: "123 Main Street, United States.",
      country: "United States",
      placeholder: "[Pending]",
      expected: "123 Main Street, United States.",
    },
  ];

  for (const c of cases) {
    const result = formatLegalAddress(c.address, c.country, c.placeholder);
    assert.equal(
      result,
      c.expected,
      `Failed case: ${c.description} -> received "${result}", expected "${c.expected}"`,
    );

    // In all cases, there must never be double dots (..)
    assert.doesNotMatch(
      result,
      /\.\./,
      `Result contains double dots: "${result}" (case: ${c.description})`,
    );

    // If country is present, its normalized form must appear at most once in the output
    if (c.country) {
      const cleanCountry = cleanLegalText(c.country);
      const occurrences = (
        result.match(new RegExp(cleanCountry, "gi")) || []
      ).length;
      assert.ok(
        occurrences <= 1,
        `Country "${cleanCountry}" appears ${occurrences} times in "${result}" (case: ${c.description})`,
      );
    }
  }
});

test("C2: formatJurisdiction ensures line 176 coherence without double dots", () => {
  assert.equal(formatJurisdiction("México"), "México");
  assert.equal(formatJurisdiction("México."), "México");
  assert.equal(formatJurisdiction("México..  "), "México");
  assert.equal(formatJurisdiction(""), "[Jurisdicción pendiente]");
  assert.equal(
    formatJurisdiction(null, "[Jurisdiction pending]"),
    "[Jurisdiction pending]",
  );

  // Appending a dot to jurisdiction should never result in double dots
  for (const raw of ["México", "México.", "México.. ", null, ""]) {
    const formatted = `${formatJurisdiction(raw)}.`;
    assert.doesNotMatch(formatted, /\.\./);
  }
});
