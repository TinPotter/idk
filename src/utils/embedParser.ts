export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedData {
  id: string;
  title?: string;
  description?: string;
  color?: string;
  author?: string;
  footer?: string;
  thumbnail?: string;
  image?: string;
  url?: string;
  fields?: EmbedField[];
  timestamp?: boolean;
  lineStart: number;
  lineEnd: number;
  rawCode: string;
  language: "python" | "javascript";
  varName?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractStringValue(str: string): string {
  const m = str.match(/^['"`](.*)['"`]$|^f['"](.*)['"]$/s);
  if (m) return m[1] ?? m[2] ?? str;
  return str.trim();
}

function extractColor(val: string): string {
  // hex int like 0xFF5733 or 0x5865F2
  const hexInt = val.match(/0[xX]([0-9a-fA-F]+)/);
  if (hexInt) return `#${hexInt[1].padStart(6, "0")}`;
  // discord.Color.xxx
  const colorName = val.match(/discord\.Color\.(\w+)/);
  if (colorName) {
    const colorMap: Record<string, string> = {
      blue: "#3498db",
      red: "#e74c3c",
      green: "#2ecc71",
      gold: "#f1c40f",
      orange: "#e67e22",
      purple: "#9b59b6",
      magenta: "#e91e8c",
      teal: "#1abc9c",
      blurple: "#5865F2",
      greyple: "#99aab5",
      dark_blue: "#206694",
      dark_green: "#1f8b4c",
      dark_red: "#992d22",
      dark_gold: "#c27c0e",
      dark_orange: "#a84300",
      dark_magenta: "#ad1457",
      dark_teal: "#11806a",
      dark_grey: "#607d8b",
      light_grey: "#979c9f",
      dark_theme: "#36393f",
      og_blurple: "#7289da",
      brand_red: "#ed4245",
      brand_yellow: "#fee75c",
      brand_green: "#57f287",
      fuchsia: "#eb459e",
      yellow: "#fee75c",
      og_blurple2: "#5865f2",
    };
    return colorMap[colorName[1]] ?? "#5865F2";
  }
  // plain hex string '#RRGGBB'
  const hexStr = val.match(/#([0-9a-fA-F]{3,6})/);
  if (hexStr) return `#${hexStr[1]}`;
  // decimal int
  const dec = parseInt(val.trim());
  if (!isNaN(dec)) return `#${dec.toString(16).padStart(6, "0")}`;
  return "#5865F2";
}

// ─── Python parser ───────────────────────────────────────────────────────────

export function parsePythonEmbeds(code: string): EmbedData[] {
  const lines = code.split("\n");
  const embeds: EmbedData[] = [];
  let embedIdx = 0;

  // We do a multiline scan
  const fullCode = code;

  // Build a map: varName -> { lineStart, lineEnd, args }
  interface EmbedBlock {
    varName: string;
    lineStart: number;
    lineEnd: number;
    constructorArgs: string;
    methodCalls: Array<{ method: string; args: string; line: number }>;
  }

  const blocks: EmbedBlock[] = [];

  // Pass 1: find all Embed() constructor invocations (handle multiline)
  let idx = 0;
  while (idx < fullCode.length) {
    const embedMatch = /(\w+)\s*=\s*discord\.Embed\s*\(/.exec(
      fullCode.slice(idx)
    );
    if (!embedMatch) break;

    const startPos = idx + embedMatch.index;
    const parenOpen = startPos + embedMatch[0].length - 1; // position of '('
    // find matching close paren
    let depth = 1;
    let i = parenOpen + 1;
    while (i < fullCode.length && depth > 0) {
      if (fullCode[i] === "(") depth++;
      else if (fullCode[i] === ")") depth--;
      i++;
    }
    const parenClose = i - 1;
    const constructorArgs = fullCode.slice(parenOpen + 1, parenClose);
    const lineStart =
      fullCode.slice(0, startPos).split("\n").length - 1; // 0-indexed

    const varName = embedMatch[1];

    // Find method calls on this var after the constructor
    const afterConstructor = fullCode.slice(parenClose + 1);
    const methodRe = new RegExp(
      `${varName}\\.add_field\\s*\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)|` +
        `${varName}\\.set_author\\s*\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)|` +
        `${varName}\\.set_footer\\s*\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)|` +
        `${varName}\\.set_thumbnail\\s*\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)|` +
        `${varName}\\.set_image\\s*\\(([^)]+(?:\\([^)]*\\)[^)]*)*)\\)`,
      "g"
    );

    const methodCalls: EmbedBlock["methodCalls"] = [];
    let lastMethodLine = lineStart;

    let mMatch: RegExpExecArray | null;
    while ((mMatch = methodRe.exec(afterConstructor)) !== null) {
      const methodPos = parenClose + 1 + mMatch.index;
      const methodLine = fullCode.slice(0, methodPos).split("\n").length - 1;

      // Determine which group matched
      let method = "";
      let args = "";
      if (mMatch[1] !== undefined) {
        method = "add_field";
        args = mMatch[1];
      } else if (mMatch[2] !== undefined) {
        method = "set_author";
        args = mMatch[2];
      } else if (mMatch[3] !== undefined) {
        method = "set_footer";
        args = mMatch[3];
      } else if (mMatch[4] !== undefined) {
        method = "set_thumbnail";
        args = mMatch[4];
      } else if (mMatch[5] !== undefined) {
        method = "set_image";
        args = mMatch[5];
      }

      if (method) {
        methodCalls.push({ method, args, line: methodLine });
        lastMethodLine = methodLine;
      }
    }

    const lineEnd = Math.max(lastMethodLine, lineStart);

    blocks.push({
      varName,
      lineStart,
      lineEnd,
      constructorArgs,
      methodCalls,
    });

    idx = parenClose + 1;
  }

  // Pass 2: parse each block into EmbedData
  for (const block of blocks) {
    const embed: EmbedData = {
      id: `embed-${embedIdx++}`,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      rawCode: lines.slice(block.lineStart, block.lineEnd + 1).join("\n"),
      language: "python",
      varName: block.varName,
      fields: [],
    };

    // Parse constructor args: title=, description=, color=, url=, timestamp=
    const args = block.constructorArgs;

    const titleM = args.match(/title\s*=\s*(f?['"`][^'"`]*['"`])/);
    if (titleM) embed.title = extractStringValue(titleM[1]);

    const descM = args.match(/description\s*=\s*(f?['"`][^'"`]*['"`])/);
    if (descM) embed.description = extractStringValue(descM[1]);

    const colorM = args.match(/color\s*=\s*([^,\n)]+)/);
    if (colorM) embed.color = extractColor(colorM[1].trim());

    const urlM = args.match(/url\s*=\s*(f?['"`][^'"`]*['"`])/);
    if (urlM) embed.url = extractStringValue(urlM[1]);

    const tsM = args.match(/timestamp\s*=/);
    if (tsM) embed.timestamp = true;

    // Parse method calls
    for (const mc of block.methodCalls) {
      if (mc.method === "set_author") {
        const nameM = mc.args.match(/name\s*=\s*(f?['"`][^'"`]*['"`])/);
        if (nameM) embed.author = extractStringValue(nameM[1]);
      } else if (mc.method === "set_footer") {
        const textM = mc.args.match(/text\s*=\s*(f?['"`][^'"`]*['"`])/);
        if (textM) embed.footer = extractStringValue(textM[1]);
      } else if (mc.method === "set_thumbnail") {
        const urlM2 = mc.args.match(/url\s*=\s*(f?['"`][^'"`]*['"`])/);
        if (urlM2) embed.thumbnail = extractStringValue(urlM2[1]);
      } else if (mc.method === "set_image") {
        const urlM3 = mc.args.match(/url\s*=\s*(f?['"`][^'"`]*['"`])/);
        if (urlM3) embed.image = extractStringValue(urlM3[1]);
      } else if (mc.method === "add_field") {
        const nameM = mc.args.match(/name\s*=\s*(f?['"`][^'"`]*['"`])/);
        const valueM = mc.args.match(/value\s*=\s*(f?['"`][^'"`]*['"`])/);
        const inlineM = mc.args.match(/inline\s*=\s*(True|False)/);
        embed.fields?.push({
          name: nameM ? extractStringValue(nameM[1]) : "Field",
          value: valueM ? extractStringValue(valueM[1]) : "",
          inline: inlineM ? inlineM[1] === "True" : false,
        });
      }
    }

    embeds.push(embed);
  }

  return embeds;
}

// ─── JavaScript / TypeScript parser ─────────────────────────────────────────

export function parseJSEmbeds(code: string): EmbedData[] {
  const lines = code.split("\n");
  const embeds: EmbedData[] = [];
  let embedIdx = 0;

  // Pattern 1: new EmbedBuilder() or new MessageEmbed()
  // Pattern 2: { title: '...', description: '...', color: ... } object literals passed to embeds:[]

  // Detect EmbedBuilder / MessageEmbed chains
  const builderRe =
    /(?:new\s+(?:EmbedBuilder|MessageEmbed)\s*\(\s*\)|(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:EmbedBuilder|MessageEmbed)\s*\(\s*\))/g;

  const fullCode = code;

  let bMatch: RegExpExecArray | null;
  while ((bMatch = builderRe.exec(fullCode)) !== null) {
    const startPos = bMatch.index;
    const lineStart = fullCode.slice(0, startPos).split("\n").length - 1;

    // Collect chain methods after this position
    const afterStart = fullCode.slice(startPos);

    // Extract all .setXxx(...) calls in the chain
    const chainRe =
      /\.(set(?:Title|Description|Color|Author|Footer|Thumbnail|Image|URL|Timestamp)|add(?:Field|Fields))\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;

    const embed: EmbedData = {
      id: `embed-${embedIdx++}`,
      lineStart,
      lineEnd: lineStart,
      rawCode: "",
      language: "javascript",
      fields: [],
    };

    let lastLineEnd = lineStart;
    let chainMatch: RegExpExecArray | null;

    while ((chainMatch = chainRe.exec(afterStart)) !== null) {
      // Check it's still in the same chain (no blank line break essentially)
      const methodPos = startPos + chainMatch.index;
      const methodLine = fullCode.slice(0, methodPos).split("\n").length - 1;

      // Stop if too far from start (different statement)
      if (methodLine - lineStart > 60) break;

      lastLineEnd = methodLine;
      const method = chainMatch[1].toLowerCase();
      const args = chainMatch[2];

      const strVal = (s: string) => {
        const m = s.match(/^['"`](.*)['"`]$/s) ?? s.match(/^`(.*)`$/s);
        return m ? m[1] : s.trim();
      };

      if (method === "settitle") {
        embed.title = strVal(args.trim().split(",")[0]);
      } else if (method === "setdescription") {
        embed.description = strVal(args.trim());
      } else if (method === "setcolor") {
        embed.color = extractColor(args.trim());
      } else if (method === "setauthor") {
        // setAuthor({ name: '...' }) or setAuthor('name')
        const nameM =
          args.match(/name\s*:\s*['"`]([^'"`]*)['"`]/) ??
          args.match(/^['"`]([^'"`]*)['"`]/);
        if (nameM) embed.author = nameM[1];
      } else if (method === "setfooter") {
        const textM =
          args.match(/text\s*:\s*['"`]([^'"`]*)['"`]/) ??
          args.match(/^['"`]([^'"`]*)['"`]/);
        if (textM) embed.footer = textM[1];
      } else if (method === "setthumbnail") {
        const urlM =
          args.match(/url\s*:\s*['"`]([^'"`]*)['"`]/) ??
          args.match(/^['"`]([^'"`]*)['"`]/);
        if (urlM) embed.thumbnail = urlM[1];
      } else if (method === "setimage") {
        const urlM =
          args.match(/url\s*:\s*['"`]([^'"`]*)['"`]/) ??
          args.match(/^['"`]([^'"`]*)['"`]/);
        if (urlM) embed.image = urlM[1];
      } else if (method === "seturl") {
        embed.url = strVal(args.trim());
      } else if (method === "settimestamp") {
        embed.timestamp = true;
      } else if (method === "addfield" || method === "addfields") {
        const nameM = args.match(/^['"`]([^'"`]*)['"`]/);
        const parts = args.split(",");
        if (parts.length >= 2) {
          const n = strVal(parts[0]);
          const v = strVal(parts[1]);
          const inl =
            parts[2]?.toLowerCase().includes("true") ?? false;
          embed.fields?.push({ name: n, value: v, inline: inl });
        } else if (nameM) {
          embed.fields?.push({ name: nameM[1], value: "", inline: false });
        }
      }
    }

    embed.lineEnd = lastLineEnd;
    embed.rawCode = lines.slice(embed.lineStart, embed.lineEnd + 1).join("\n");
    embeds.push(embed);
  }

  // Pattern 2: object literal embeds: [{ title: ... }]
  // Look for { embeds: [ ... ] } or embeds: [{ ... }]
  const embedsArrayRe = /embeds\s*:\s*\[([^\]]*(?:\{[^}]*\}[^\]]*)*)\]/g;
  let arrMatch: RegExpExecArray | null;
  while ((arrMatch = embedsArrayRe.exec(fullCode)) !== null) {
    const inner = arrMatch[1];
    // Find each { ... } object
    const objRe = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let objMatch: RegExpExecArray | null;
    while ((objMatch = objRe.exec(inner)) !== null) {
      const objContent = objMatch[1];
      const startPos =
        arrMatch.index + arrMatch[0].indexOf(objMatch[0]);
      const lineStart =
        fullCode.slice(0, startPos).split("\n").length - 1;
      const lineEnd =
        fullCode
          .slice(0, startPos + objMatch[0].length)
          .split("\n").length - 1;

      const embed: EmbedData = {
        id: `embed-${embedIdx++}`,
        lineStart,
        lineEnd,
        rawCode: lines.slice(lineStart, lineEnd + 1).join("\n"),
        language: "javascript",
        fields: [],
      };

      const strVal = (s: string) => {
        const m = s.match(/['"`]([^'"`]*)['"`]/);
        return m ? m[1] : s.trim();
      };

      const titleM = objContent.match(/title\s*:\s*(['"`][^'"`]*['"`])/);
      if (titleM) embed.title = strVal(titleM[1]);

      const descM = objContent.match(
        /description\s*:\s*(['"`][^'"`]*['"`])/
      );
      if (descM) embed.description = strVal(descM[1]);

      const colorM = objContent.match(/color\s*:\s*([^,\n}]+)/);
      if (colorM) embed.color = extractColor(colorM[1].trim());

      const urlM = objContent.match(/url\s*:\s*(['"`][^'"`]*['"`])/);
      if (urlM) embed.url = strVal(urlM[1]);

      if (
        embed.title ||
        embed.description ||
        embed.color ||
        embed.fields?.length
      ) {
        embeds.push(embed);
      }
    }
  }

  return embeds;
}

// ─── Auto-detect language & parse ───────────────────────────────────────────

export function detectLanguage(code: string): "python" | "javascript" {
  // Heuristics
  const pyScore =
    (code.match(/discord\.Embed/g)?.length ?? 0) * 3 +
    (code.match(/import discord/g)?.length ?? 0) * 3 +
    (code.match(/def |async def /g)?.length ?? 0) * 2 +
    (code.match(/^\s*#/gm)?.length ?? 0);

  const jsScore =
    (code.match(/EmbedBuilder|MessageEmbed/g)?.length ?? 0) * 3 +
    (code.match(/require\(|import .+ from/g)?.length ?? 0) * 2 +
    (code.match(/const |let |var /g)?.length ?? 0) +
    (code.match(/=>/g)?.length ?? 0);

  return pyScore >= jsScore ? "python" : "javascript";
}

export function parseEmbeds(code: string): EmbedData[] {
  const lang = detectLanguage(code);
  if (lang === "python") return parsePythonEmbeds(code);
  return parseJSEmbeds(code);
}
