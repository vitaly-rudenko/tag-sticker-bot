import fs from "fs";
import { parse } from "csv-parse/sync";

const records = parse(fs.readFileSync("./results.csv", "utf8"), {
  columns: true,
  skip_empty_lines: true,
});

const results = records.map((record) => ({
  value: (record["v"].startsWith('"')
    ? JSON.parse(record["v"])
    : record["v"]
  ).trim(),
  createdAt: new Date(Number(record["c"]) * 1000),
  fileId: record["fid"],
  fileUniqueId: record["fuid"],
  mimeType:
    record["mime"] === "1"
      ? "video/mp4"
      : record["mime"] === "2"
      ? "image/gif"
      : null,
  visibility: record["pr"] === "true" ? "private" : "public",
  setName: record["set"] || null,
  authorUserId: record["u"],
}));

const deduped = [];

for (const result of results) {
  const existing = deduped.find(
    (r) =>
      r.authorUserId === result.authorUserId &&
      r.fileUniqueId === result.fileUniqueId
  );
  if (!existing) {
    deduped.push({ ...result, values: [result.value] });
    continue;
  }

  existing.values.push(result.value);
}

for (const result of deduped) {
  result.value = deduplicateAndMerge(result.values).join(", ");
  delete result.values;
}

function deduplicateAndMerge(strings) {
  // Handle edge cases
  if (!strings || !Array.isArray(strings)) return [];
  if (strings.length <= 1) return strings;

  // Filter out empty strings and duplicates
  const uniqueStrings = [
    ...new Set(
      strings.filter(
        (str) => str && typeof str === "string" && str.trim() !== ""
      )
    ),
  ];
  if (uniqueStrings.length <= 1) return uniqueStrings;

  // Sort strings by length (descending) to start with longer strings
  let sortedStrings = [...uniqueStrings].sort((a, b) => b.length - a.length);

  let changed = true;
  while (changed) {
    changed = false;

    // Try to merge any pair of strings
    outerLoop: for (let i = 0; i < sortedStrings.length; i++) {
      for (let j = 0; j < sortedStrings.length; j++) {
        if (i === j) continue;

        const str1 = sortedStrings[i];
        const str2 = sortedStrings[j];

        // Check if str1 contains str2
        if (str1.includes(str2)) {
          // Remove str2 as it's fully contained in str1
          sortedStrings.splice(j, 1);
          changed = true;
          break outerLoop;
        }

        // Find overlap where end of str1 matches start of str2
        let maxOverlap = Math.min(str1.length, str2.length);
        for (let k = maxOverlap; k > 0; k--) {
          if (str1.endsWith(str2.substring(0, k))) {
            // Merge str1 and str2
            const merged = str1 + str2.substring(k);
            // Replace str1 with merged string
            sortedStrings[i] = merged;
            // Remove str2
            sortedStrings.splice(j, 1);
            changed = true;
            break outerLoop;
          }
        }

        // Find overlap where end of str2 matches start of str1
        for (let k = maxOverlap; k > 0; k--) {
          if (str2.endsWith(str1.substring(0, k))) {
            // Merge str2 and str1
            const merged = str2 + str1.substring(k);
            // Replace str1 with merged string
            sortedStrings[i] = merged;
            // Remove str2
            sortedStrings.splice(j, 1);
            changed = true;
            break outerLoop;
          }
        }
      }
    }

    // Re-sort after each merge to always work with the longest strings first
    if (changed) {
      sortedStrings.sort((a, b) => b.length - a.length);
    }
  }

  return sortedStrings;
}

fs.writeFileSync("./results.json", JSON.stringify(deduped, null, 2));
