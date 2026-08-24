import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { format as prettierFormat } from "prettier";

const kitRoot = new URL("../fixtures/listing-prep-pilot-v1.1/", import.meta.url);
const checkOnly = process.argv.includes("--check");
const width = 800;
const height = 800;
const protocolVersion = "listing_prep_pilot_v1.1.0";
const prettierOptions = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  endOfLine: "auto",
};

const templates = {
  tops_standard_v1: template("tops_standard_v1", "tops", "トップス（標準）", "natural", [
    measurement("shoulder_width", "肩幅", "length"),
    measurement("chest_width", "身幅", "flat_width"),
    measurement("body_length", "着丈", "length"),
    measurement("sleeve_length", "袖丈", "length"),
  ]),
  outer_standard_v1: template("outer_standard_v1", "outer", "アウター（標準）", "natural", [
    measurement("shoulder_width", "肩幅", "length"),
    measurement("chest_width", "身幅", "flat_width"),
    measurement("body_length", "着丈", "length"),
    measurement("sleeve_length", "袖丈", "length"),
  ]),
  pants_standard_v1: template("pants_standard_v1", "pants", "パンツ（標準）", "closed", [
    measurement("waist_flat_width", "ウエスト平置幅", "flat_width"),
    measurement("rise_length", "股上", "length"),
    measurement("inseam_length", "股下", "length"),
    measurement("thigh_width", "わたり幅", "flat_width"),
    measurement("hem_width", "裾幅", "flat_width"),
  ]),
  knit_set_in_v1: template("knit_set_in_v1", "knit", "ニット（セットイン）", "unstretched", [
    measurement("shoulder_width", "肩幅", "length"),
    measurement("chest_width", "自然状態の身幅", "flat_width"),
    measurement("body_length", "着丈", "length"),
    measurement("sleeve_length", "袖丈", "length"),
  ]),
};

const fixtureInputs = [
  fixture(
    "WARMUP-01",
    "tops_standard_v1",
    "PILOT-BRAND-W0",
    "M",
    "ブルー",
    "綿100%",
    [41, 49, 67, 58],
  ),
  fixture(
    "TOP-01",
    "tops_standard_v1",
    "PILOT-BRAND-01",
    "M",
    "ネイビー",
    "綿100%",
    [42, 50, 68, 59],
  ),
  fixture(
    "TOP-02",
    "tops_standard_v1",
    "PILOT-BRAND-02",
    "L",
    "ホワイト",
    "綿100%",
    [44, 53, 71, 61],
  ),
  fixture(
    "TOP-03",
    "tops_standard_v1",
    "PILOT-BRAND-03",
    "S",
    "グレー",
    "ポリエステル100%",
    [40, 48, 66, 57],
  ),
  fixture(
    "TOP-04",
    "tops_standard_v1",
    "PILOT-BRAND-04",
    "XL",
    "ブラック",
    "綿60% ポリエステル40%",
    [46, 56, 74, 63],
  ),
  fixture(
    "OUTER-01",
    "outer_standard_v1",
    "PILOT-BRAND-05",
    "M",
    "カーキ",
    "ポリエステル100%",
    [45, 55, 72, 62],
  ),
  fixture(
    "OUTER-02",
    "outer_standard_v1",
    "PILOT-BRAND-06",
    "L",
    "ベージュ",
    "ナイロン100%",
    [47, 58, 76, 64],
  ),
  fixture(
    "PANTS-01",
    "pants_standard_v1",
    "PILOT-BRAND-07",
    "M",
    "インディゴ",
    "綿98% ポリウレタン2%",
    [39, 28, 72, 31, 19],
  ),
  fixture(
    "PANTS-02",
    "pants_standard_v1",
    "PILOT-BRAND-08",
    "L",
    "チャコール",
    "ポリエステル65% レーヨン35%",
    [41, 30, 75, 33, 20],
  ),
  fixture(
    "KNIT-01",
    "knit_set_in_v1",
    "PILOT-BRAND-09",
    "M",
    "ボルドー",
    "毛50% アクリル50%",
    [43, 52, 69, 60],
  ),
  fixture(
    "KNIT-02",
    "knit_set_in_v1",
    "PILOT-BRAND-10",
    "L",
    "アイボリー",
    "綿70% ナイロン30%",
    [45, 55, 72, 62],
  ),
];

const roles = ["front", "back", "brand_tag", "care_label"];
const generatedFiles = new Map();
const fixtures = [];

async function main() {
  for (const [fixtureIndex, input] of fixtureInputs.entries()) {
    const templateDefinition = templates[input.templateId];
    const images = [];
    for (const [roleIndex, role] of roles.entries()) {
      const bytes = createPng(input.fixtureId, role, fixtureIndex, roleIndex);
      const relativePath = `fixtures/listing-prep-pilot-v1.1/${input.fixtureId}/${role}.png`;
      generatedFiles.set(relativePath, bytes);
      images.push({
        role,
        relativePath,
        sha256: sha256(bytes),
        bytes: bytes.length,
        width,
        height,
        mimeType: "image/png",
      });
    }
    fixtures.push({
      fixtureId: input.fixtureId,
      measured: input.fixtureId !== "WARMUP-01",
      category: templateDefinition.category,
      categoryLabel: templateDefinition.categoryLabel,
      templateId: input.templateId,
      templateVersion: templateDefinition.version,
      title: `架空試験商品 ${input.fixtureId}`,
      attributes: {
        brand: input.brand,
        sizeLabel: input.sizeLabel,
        color: input.color,
      },
      tagText: `${input.brand}\nサイズ: ${input.sizeLabel}\nカラー: ${input.color}\n素材: ${input.material}`,
      measurements: templateDefinition.measurements.map((definition, index) => ({
        ...definition,
        state: templateDefinition.state,
        value: input.values[index],
        unit: "cm",
      })),
      images,
    });
  }

  const manifestPayload = {
    formatVersion: 1,
    protocolVersion,
    imageRules: {
      countPerFixture: 4,
      roles,
      mimeType: "image/png",
      width,
      height,
      maxBytes: 25 * 1024 * 1024,
    },
    measurementTemplates: templates,
    fixtureOrder: fixtures.filter((entry) => entry.measured).map((entry) => entry.fixtureId),
    warmupFixtureId: "WARMUP-01",
    fixtures,
  };
  const canonicalPayloadBytes = Buffer.from(JSON.stringify(manifestPayload), "utf8");
  const manifestSha256 = sha256(canonicalPayloadBytes);
  const manifest = { ...manifestPayload, manifestSha256 };

  generatedFiles.set(
    "fixtures/listing-prep-pilot-v1.1/manifest.json",
    Buffer.from(
      await prettierFormat(JSON.stringify(manifest), { ...prettierOptions, parser: "json" }),
      "utf8",
    ),
  );
  generatedFiles.set(
    "fixtures/listing-prep-pilot-v1.1/CHECKLIST.csv",
    Buffer.from(createChecklist(fixtures), "utf8"),
  );
  generatedFiles.set(
    "fixtures/listing-prep-pilot-v1.1/README.md",
    Buffer.from(createReadme(manifestSha256), "utf8"),
  );
  generatedFiles.set(
    "packages/contracts/src/pilot-fixtures.generated.ts",
    Buffer.from(
      await prettierFormat(createGeneratedContract(manifest, manifestSha256), {
        parser: "typescript",
        ...prettierOptions,
      }),
      "utf8",
    ),
  );

  if (checkOnly) {
    await verifyGeneratedFiles();
    console.log(`pilot-fixtures: PASS (${manifestSha256}, 44 PNG)`);
  } else {
    await writeGeneratedFiles();
    console.log(`pilot-fixtures: generated (${manifestSha256}, 44 PNG)`);
  }
}

function template(id, category, categoryLabel, state, measurements) {
  return { id, version: 1, category, categoryLabel, state, measurements };
}

function measurement(definitionId, label, basis) {
  return { definitionId, label, definitionVersion: 1, basis };
}

function fixture(fixtureId, templateId, brand, sizeLabel, color, material, values) {
  return { fixtureId, templateId, brand, sizeLabel, color, material, values };
}

function createPng(fixtureId, role, fixtureIndex, roleIndex) {
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  const base = palette(fixtureIndex, roleIndex);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 3;
      const stripe = y < 105 || y > 695 || x < 36 || x > 763;
      const checker = Math.floor(x / 80 + y / 80) % 2 === 0;
      const color = stripe ? base.accent : checker ? base.light : base.background;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
    }
  }
  const label = `${fixtureId} ${role.toUpperCase().replace("BRAND_TAG", "BRAND").replace("CARE_LABEL", "CARE")}`;
  drawText(raw, label, 64, 58, 7, [255, 255, 255]);
  drawText(raw, role.toUpperCase(), 150, 360, 10, base.ink);
  drawText(raw, `FIXTURE ${String(fixtureIndex).padStart(2, "0")}`, 184, 620, 6, base.ink);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function palette(fixtureIndex, roleIndex) {
  const accents = [
    [26, 74, 130],
    [28, 112, 93],
    [151, 82, 32],
    [112, 64, 145],
  ];
  const accent = accents[roleIndex];
  const shift = (fixtureIndex * 13) % 38;
  return {
    accent,
    background: [222 - shift, 231 - Math.floor(shift / 2), 242],
    light: [241, 245 - Math.floor(shift / 4), 249 - Math.floor(shift / 5)],
    ink: [20 + roleIndex * 8, 34 + fixtureIndex, 55 + roleIndex * 10],
  };
}

const glyphs = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function drawText(raw, text, startX, startY, scale, color) {
  let cursorX = startX;
  for (const character of text) {
    const glyph = glyphs[character] ?? glyphs[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        fillRect(raw, cursorX + column * scale, startY + row * scale, scale, scale, color);
      }
    }
    cursorX += scale * 6;
  }
}

function fillRect(raw, x, y, rectWidth, rectHeight, color) {
  for (let py = y; py < Math.min(y + rectHeight, height); py += 1) {
    for (let px = x; px < Math.min(x + rectWidth, width); px += 1) {
      if (px < 0 || py < 0) continue;
      const offset = py * (width * 3 + 1) + 1 + px * 3;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
    }
  }
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createChecklist(entries) {
  const headers = [
    "fixture_id",
    "measured",
    "category",
    "template_id",
    "brand",
    "size_label",
    "color",
    "tag_text",
    "measurements",
    "front_path",
    "back_path",
    "brand_tag_path",
    "care_label_path",
    "files_prepared",
    "fixed_values_checked",
  ];
  const rows = entries.map((entry) => {
    const byRole = Object.fromEntries(
      entry.images.map((image) => [image.role, image.relativePath]),
    );
    return [
      entry.fixtureId,
      entry.measured,
      entry.category,
      entry.templateId,
      entry.attributes.brand,
      entry.attributes.sizeLabel,
      entry.attributes.color,
      entry.tagText,
      entry.measurements.map((item) => `${item.label}=${item.value}${item.unit}`).join(" / "),
      byRole.front,
      byRole.back,
      byRole.brand_tag,
      byRole.care_label,
      "",
      "",
    ];
  });
  return `${[headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}

function csv(value) {
  const text = String(value).replaceAll('"', '""');
  return /[",\r\n]/u.test(text) ? `"${text}"` : text;
}

function createReadme(hash) {
  return `# 固定10商品pilot v1.1 素材\n\n- すべて架空のローカル検証データです。実顧客・実在ブランド・個人情報は含みません。\n- 外部AI、外部API、有料サービス、販売サイトへ接続しません。費用は0円です。\n- WARMUP-01は計測外の練習用です。TOP-01〜KNIT-02だけを固定順で本計測します。\n- 各フォルダーの \`front.png\`、\`back.png\`、\`brand_tag.png\`、\`care_label.png\` を対応する4つの写真欄へ選びます。\n- 固定属性と採寸値は \`CHECKLIST.csv\`、機械検証値は \`manifest.json\` を参照します。\n- PNGは800×800、25MB未満です。アプリの上限はJPEG/PNG、1枚25MB以下、1辺12,000px以下です。\n\n## 同一素材の確認\n\n\`node scripts/generate-pilot-fixtures.mjs --check\` を実行します。PASSにならない場合は本計測を始めません。\n\nmanifest SHA-256: \`${hash}\`\n\nSHA-256は素材の取り違えや変更を検出するための64文字の指紋です。manifestの値は、\`manifestSha256\`自身を除くpayloadをJavaScriptの安定した挿入順で\`JSON.stringify\`したUTF-8 bytesから計算します。\n\nこのREADMEは素材準備だけを説明します。P05独立TerraのUI再評価は100/100で完了していますが、実10商品pilotはまだ実施していません。人の準備が整い次第、\`docs/specs/pilot-protocol-v1.1.md\`に従って開始できます。\n`;
}

function createGeneratedContract(value, hash) {
  const warmup = value.fixtures.find((entry) => !entry.measured);
  const measured = value.fixtures.filter((entry) => entry.measured);
  return `// This file is generated by scripts/generate-pilot-fixtures.mjs.\n// Do not edit it by hand.\n\nexport const listingPrepPilotProtocolVersion = ${JSON.stringify(value.protocolVersion)} as const;\nexport const listingPrepPilotFixtureManifestSha256 = ${JSON.stringify(hash)} as const;\nexport const listingPrepPilotMeasurementTemplates = ${JSON.stringify(value.measurementTemplates, null, 2)} as const;\nexport const listingPrepPilotWarmupFixture = ${JSON.stringify(warmup, null, 2)} as const;\nexport const listingPrepPilotFixtureProfiles = ${JSON.stringify(measured, null, 2)} as const;\nexport const listingPrepPilotFixtureIds = ${JSON.stringify(value.fixtureOrder)} as const;\n\nexport type ListingPrepPilotFixtureProfile = (typeof listingPrepPilotFixtureProfiles)[number];\nexport type ListingPrepPilotMeasurementTemplateId = keyof typeof listingPrepPilotMeasurementTemplates;\n`;
}

async function writeGeneratedFiles() {
  for (const [path, bytes] of generatedFiles) {
    const target = new URL(`../${path.replaceAll("\\", "/")}`, import.meta.url);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, bytes);
  }
}

async function verifyGeneratedFiles() {
  const failures = [];
  for (const [path, expected] of generatedFiles) {
    try {
      const actual = await readFile(new URL(`../${path.replaceAll("\\", "/")}`, import.meta.url));
      if (!actual.equals(expected)) failures.push(`${path}: content differs`);
    } catch {
      failures.push(`${path}: missing`);
    }
  }
  const actualPngs = (await listFiles(kitRoot))
    .filter((path) => path.endsWith(".png"))
    .map((path) => `fixtures/listing-prep-pilot-v1.1/${path}`)
    .sort();
  const expectedPngs = [...generatedFiles.keys()].filter((path) => path.endsWith(".png")).sort();
  if (JSON.stringify(actualPngs) !== JSON.stringify(expectedPngs)) {
    failures.push("fixture PNG set differs");
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

async function listFiles(rootUrl) {
  const paths = [];
  const rootPath = fileURLToPath(rootUrl);
  const entries = await readdir(rootUrl, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    paths.push(relative(rootPath, absolute).replaceAll("\\", "/"));
  }
  return paths;
}

await main();
