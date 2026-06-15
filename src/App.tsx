import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseEmbeds, detectLanguage, type EmbedData } from "./utils/embedParser";
import { pythonSample, jsSample } from "./utils/samples";

// ─── Discord Embed Preview ───────────────────────────────────────────────────
function EmbedPreview({ embed }: { embed: EmbedData }) {
  const color = embed.color ?? "#5865F2";
  return (
    <div className="rounded-lg overflow-hidden" style={{ borderLeft: `4px solid ${color}`, background: "#2b2d31" }}>
      <div className="px-4 py-3 space-y-2">
        {embed.author && (
          <p className="text-xs font-semibold text-gray-300">{embed.author}</p>
        )}
        {embed.title && (
          <p className="text-sm font-bold text-white leading-snug">{embed.title}</p>
        )}
        {embed.description && (
          <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{embed.description}</p>
        )}
        {embed.fields && embed.fields.length > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {embed.fields.slice(0, 4).map((f, i) => (
              <div key={i} className={f.inline ? "" : "col-span-2"}>
                <p className="text-xs font-semibold text-gray-200">{f.name}</p>
                <p className="text-xs text-gray-400 truncate">{f.value}</p>
              </div>
            ))}
          </div>
        )}
        {embed.footer && (
          <p className="text-xs text-gray-500 pt-1 border-t border-white/5">{embed.footer}</p>
        )}
      </div>
    </div>
  );
}

// ─── Code Display ────────────────────────────────────────────────────────────
function CodeDisplay({
  code,
  selectedEmbed,
  onLineClick,
}: {
  code: string;
  selectedEmbed: EmbedData | null;
  onLineClick?: (line: number) => void;
}) {
  const lines = code.split("\n");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedEmbed && containerRef.current) {
      const lineHeight = 24;
      const targetScroll = selectedEmbed.lineStart * lineHeight - 80;
      containerRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
    }
  }, [selectedEmbed]);

  const isHighlighted = (lineIdx: number) => {
    if (!selectedEmbed) return false;
    return lineIdx >= selectedEmbed.lineStart && lineIdx <= selectedEmbed.lineEnd;
  };

  const isStart = (lineIdx: number) =>
    selectedEmbed && lineIdx === selectedEmbed.lineStart;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-auto font-mono text-sm leading-6 scrollbar-thin"
      style={{ scrollbarColor: "#ffffff10 transparent" }}
    >
      {/* Glow overlay for highlighted region */}
      <AnimatePresence>
        {selectedEmbed && (
          <motion.div
            key={selectedEmbed.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute left-0 right-0 pointer-events-none z-10 rounded-lg"
            style={{
              top: selectedEmbed.lineStart * 24 + 4,
              height: (selectedEmbed.lineEnd - selectedEmbed.lineStart + 1) * 24 + 8,
              background: `linear-gradient(90deg, ${selectedEmbed.color ?? "#5865F2"}22, ${selectedEmbed.color ?? "#5865F2"}08)`,
              borderLeft: `2px solid ${selectedEmbed.color ?? "#5865F2"}`,
              boxShadow: `0 0 24px ${selectedEmbed.color ?? "#5865F2"}22`,
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-20">
        {lines.map((line, i) => {
          const hl = isHighlighted(i);
          const start = isStart(i);
          return (
            <div
              key={i}
              onClick={() => onLineClick?.(i)}
              className="flex group cursor-default select-none transition-colors duration-150"
              style={{ height: 24 }}
            >
              {/* Line number */}
              <span
                className="shrink-0 w-12 text-right pr-4 text-xs select-none transition-colors duration-200"
                style={{
                  color: hl ? (selectedEmbed?.color ?? "#5865F2") + "cc" : "#ffffff20",
                  lineHeight: "24px",
                  fontWeight: hl ? 600 : 400,
                }}
              >
                {i + 1}
              </span>
              {/* Code content */}
              <span
                className="flex-1 px-2 whitespace-pre transition-colors duration-200"
                style={{
                  color: hl ? "#ffffff" : "#ffffff55",
                  background: "transparent",
                  lineHeight: "24px",
                }}
              >
                {start && selectedEmbed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="inline-block mr-2 text-xs rounded px-1 py-0 font-sans font-semibold"
                    style={{
                      background: selectedEmbed.color ?? "#5865F2",
                      color: "#fff",
                      fontSize: 10,
                      lineHeight: "18px",
                      verticalAlign: "middle",
                    }}
                  >
                    EMBED
                  </motion.span>
                )}
                <SyntaxLine line={line} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Very lightweight syntax colorizer ───────────────────────────────────────
function SyntaxLine({ line }: { line: string }) {
  // Simple tokenizer for Python/JS keywords, strings, comments
  const tokens: Array<{ text: string; color: string }> = [];
  let remaining = line;

  const pyKeywords = /^(import|from|def|async|await|class|return|if|else|elif|for|while|in|not|and|or|True|False|None|pass|raise|with|as|try|except|finally|yield|lambda|global|nonlocal|del|assert|break|continue)\b/;
  const jsKeywords = /^(const|let|var|function|async|await|class|return|if|else|for|while|in|of|new|this|import|from|export|default|true|false|null|undefined|typeof|instanceof|throw|try|catch|finally|break|continue|switch|case)\b/;
  const stringRe = /^(['"`])(?:(?!\1)[^\\]|\\.)*\1|^`(?:[^`\\]|\\.)*`/;
  const commentRe = /^#.*$|^\/\/.*/;
  const numberRe = /^0[xX][0-9a-fA-F]+|^\d+/;
  const funcRe = /^(\w+)(?=\s*\()/;
  const attrRe = /^(\.\w+)/;
  const wordRe = /^\w+/;
  const otherRe = /^[^\w'"`.#]+/;

  while (remaining.length > 0) {
    let m: RegExpMatchArray | null;
    if ((m = remaining.match(commentRe))) {
      tokens.push({ text: m[0], color: "#6a9955" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(stringRe))) {
      tokens.push({ text: m[0], color: "#ce9178" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(numberRe))) {
      tokens.push({ text: m[0], color: "#b5cea8" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(pyKeywords)) || (m = remaining.match(jsKeywords))) {
      tokens.push({ text: m[0], color: "#569cd6" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(funcRe))) {
      tokens.push({ text: m[0], color: "#dcdcaa" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(attrRe))) {
      tokens.push({ text: m[0], color: "#9cdcfe" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(wordRe))) {
      tokens.push({ text: m[0], color: "inherit" });
      remaining = remaining.slice(m[0].length);
    } else if ((m = remaining.match(otherRe))) {
      tokens.push({ text: m[0], color: "#ffffff40" });
      remaining = remaining.slice(m[0].length);
    } else {
      tokens.push({ text: remaining[0], color: "inherit" });
      remaining = remaining.slice(1);
    }
  }

  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.text}
        </span>
      ))}
    </>
  );
}

// ─── Embed Card ───────────────────────────────────────────────────────────────
function EmbedCard({
  embed,
  isSelected,
  onClick,
  index,
}: {
  embed: EmbedData;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  const color = embed.color ?? "#5865F2";
  return (
    <motion.button
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 300, damping: 30 }}
      onClick={onClick}
      className="w-full text-left group relative"
    >
      <div
        className="relative rounded-xl p-4 border transition-all duration-200 overflow-hidden"
        style={{
          background: isSelected ? `${color}15` : "rgba(255,255,255,0.03)",
          borderColor: isSelected ? `${color}60` : "rgba(255,255,255,0.06)",
          boxShadow: isSelected ? `0 0 20px ${color}22, inset 0 0 20px ${color}08` : "none",
        }}
      >
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full transition-all duration-200"
          style={{
            background: color,
            opacity: isSelected ? 1 : 0.3,
            width: isSelected ? 3 : 2,
          }}
        />

        <div className="pl-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ background: color, outline: `2px solid ${color}40` }}
                            />
              <span className="text-xs font-semibold text-white/80 truncate">
                {embed.title ?? embed.varName ?? `Embed #${embed.id.split("-")[1]}`}
              </span>
            </div>
            <span
              className="text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
              style={{
                background: `${color}20`,
                color: color,
              }}
            >
              L{embed.lineStart + 1}–{embed.lineEnd + 1}
            </span>
          </div>

          {/* Description */}
          {embed.description && (
            <p className="text-xs text-white/40 line-clamp-1 pl-0">{embed.description}</p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {embed.author && (
              <Tag label="author" color={color} />
            )}
            {embed.footer && (
              <Tag label="footer" color={color} />
            )}
            {(embed.fields?.length ?? 0) > 0 && (
              <Tag label={`${embed.fields!.length} field${embed.fields!.length > 1 ? "s" : ""}`} color={color} />
            )}
            {embed.timestamp && (
              <Tag label="timestamp" color={color} />
            )}
            <Tag label={embed.language} color="#ffffff" dim />
          </div>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <motion.div
            layoutId="selected-glow"
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ background: `radial-gradient(ellipse at top left, ${color}12, transparent 70%)` }}
          />
        )}
      </div>
    </motion.button>
  );
}

function Tag({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-md font-mono"
      style={{
        background: dim ? "rgba(255,255,255,0.05)" : `${color}18`,
        color: dim ? "rgba(255,255,255,0.3)" : `${color}`,
        fontSize: 10,
      }}
    >
      {label}
    </span>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode] = useState("");
  const [embeds, setEmbeds] = useState<EmbedData[]>([]);
  const [selectedEmbed, setSelectedEmbed] = useState<EmbedData | null>(null);
  const [_hasAnalyzed, setHasAnalyzed] = useState(false);
  const [language, setLanguage] = useState<"python" | "javascript">("python");
  const [view, setView] = useState<"input" | "results">("input");
  const [showPreview, setShowPreview] = useState(false);

  const analyze = useCallback(() => {
    if (!code.trim()) return;
    const found = parseEmbeds(code);
    const lang = detectLanguage(code);
    setLanguage(lang);
    setEmbeds(found);
    setSelectedEmbed(found[0] ?? null);
    setHasAnalyzed(true);
    setView("results");
  }, [code]);

  const loadSample = (lang: "python" | "javascript") => {
    setCode(lang === "python" ? pythonSample : jsSample);
    setHasAnalyzed(false);
    setView("input");
  };

  const reset = () => {
    setView("input");
    setHasAnalyzed(false);
    setEmbeds([]);
    setSelectedEmbed(null);
  };

  return (
    <div
      className="min-h-screen text-white overflow-hidden"
      style={{ background: "#0e0f13", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #5865F2, transparent 70%)", filter: "blur(80px)" }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #eb459e, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ── Header ── */}
        <header className="flex items-center justify-between px-8 py-5 border-b border-white/5">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "#5865F2" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.014.043.03.053a19.9 19.9 0 005.993 3.03.077.077 0 00.083-.027c.462-.63.874-1.295 1.226-1.995a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" fill="white"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">EmbedFinder</h1>
              <p className="text-xs text-white/30">Discord Code Inspector</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            {view === "results" && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={reset}
                className="text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
              >
                ← Back
              </motion.button>
            )}
            <button
              onClick={() => loadSample("python")}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-white/40 hover:text-white/80 transition-all"
            >
              Python sample
            </button>
            <button
              onClick={() => loadSample("javascript")}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-white/40 hover:text-white/80 transition-all"
            >
              JS sample
            </button>
          </motion.div>
        </header>

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {view === "input" ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex-1 flex flex-col items-center justify-center px-6 py-12"
              >
                {/* Hero text */}
                <div className="text-center mb-10 space-y-3">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-white/10 text-white/40 mb-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Python · JavaScript · TypeScript
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-4xl font-bold tracking-tight"
                    style={{ background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.4) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                  >
                    Find Discord Embeds
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm text-white/30 max-w-sm mx-auto"
                  >
                    Paste your bot code below — we'll detect every embed and highlight exactly where it lives.
                  </motion.p>
                </div>

                {/* Code textarea */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="w-full max-w-3xl"
                >
                  <div
                    className="rounded-2xl overflow-hidden border border-white/8 relative"
                    style={{ background: "#13151a" }}
                  >
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/60" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                        <div className="w-3 h-3 rounded-full bg-green-500/60" />
                      </div>
                      <span className="text-xs text-white/20 font-mono">
                        {code ? `${code.split("\n").length} lines` : "paste your code"}
                      </span>
                    </div>
                    <textarea
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const t = e.currentTarget;
                          const start = t.selectionStart;
                          const end = t.selectionEnd;
                          const newVal = t.value.substring(0, start) + "    " + t.value.substring(end);
                          setCode(newVal);
                          setTimeout(() => { t.selectionStart = t.selectionEnd = start + 4; }, 0);
                        }
                      }}
                      placeholder={`# Paste your Python or JavaScript Discord bot code here\n\nimport discord\n\nembed = discord.Embed(title="Hello!", ...)`}
                      className="w-full bg-transparent resize-none outline-none text-sm font-mono text-white/70 placeholder-white/15 px-4 py-4"
                      style={{ minHeight: 360, lineHeight: "1.6" }}
                      spellCheck={false}
                    />
                  </div>

                  {/* Analyze button */}
                  <div className="flex justify-center mt-6">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={analyze}
                      disabled={!code.trim()}
                      className="relative px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed overflow-hidden"
                      style={{ background: "#5865F2" }}
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        Scan for Embeds
                      </span>
                      <div
                        className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
                        style={{ background: "linear-gradient(135deg, #6875f5, #5865F2)" }}
                      />
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex overflow-hidden"
                style={{ height: "calc(100vh - 65px)" }}
              >
                {/* ── Sidebar: Embed List ── */}
                <div
                  className="w-80 shrink-0 flex flex-col border-r border-white/5 overflow-hidden"
                  style={{ background: "#0e0f13" }}
                >
                  {/* Sidebar header */}
                  <div className="px-4 py-4 border-b border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest">
                        Embeds Found
                      </h2>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "#5865F220", color: "#5865F2" }}
                      >
                        {embeds.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-mono"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
                      >
                        {language}
                      </span>
                      <span className="text-xs text-white/20">
                        {code.split("\n").length} lines
                      </span>
                    </div>
                  </div>

                  {/* Embed cards */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {embeds.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-full text-center px-4 space-y-3"
                      >
                        <div className="w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/20">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4m0 4h.01" />
                          </svg>
                        </div>
                        <p className="text-xs text-white/30">No Discord embeds detected in this code.</p>
                      </motion.div>
                    ) : (
                      embeds.map((embed, i) => (
                        <EmbedCard
                          key={embed.id}
                          embed={embed}
                          isSelected={selectedEmbed?.id === embed.id}
                          onClick={() => {
                            setSelectedEmbed(embed);
                            setShowPreview(false);
                          }}
                          index={i}
                        />
                      ))
                    )}
                  </div>

                  {/* Preview toggle */}
                  {selectedEmbed && (
                    <div className="border-t border-white/5 p-3">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full text-xs text-center py-2 rounded-lg border border-white/8 text-white/40 hover:text-white/70 hover:border-white/15 transition-all"
                      >
                        {showPreview ? "Hide" : "Show"} Discord Preview
                      </button>
                      <AnimatePresence>
                        {showPreview && selectedEmbed && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="overflow-hidden"
                          >
                            <EmbedPreview embed={selectedEmbed} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* ── Main: Code view ── */}
                <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0b0c10" }}>
                  {/* Code toolbar */}
                  <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-4">
                      <AnimatePresence mode="wait">
                        {selectedEmbed ? (
                          <motion.div
                            key={selectedEmbed.id}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            className="flex items-center gap-3"
                          >
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ background: selectedEmbed.color ?? "#5865F2" }}
                            />
                            <span className="text-sm font-semibold text-white/80">
                              {selectedEmbed.title ?? selectedEmbed.varName ?? "Embed"}
                            </span>
                            <span className="text-xs font-mono text-white/30">
                              Lines {selectedEmbed.lineStart + 1}–{selectedEmbed.lineEnd + 1}
                            </span>
                          </motion.div>
                        ) : (
                          <motion.span
                            key="no-sel"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-white/30"
                          >
                            Select an embed to highlight
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Navigation between embeds */}
                    {embeds.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const idx = embeds.findIndex((e) => e.id === selectedEmbed?.id);
                            if (idx > 0) setSelectedEmbed(embeds[idx - 1]);
                          }}
                          disabled={embeds.findIndex((e) => e.id === selectedEmbed?.id) === 0}
                          className="p-1.5 rounded-lg border border-white/8 text-white/40 hover:text-white/80 hover:border-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="m15 18-6-6 6-6" />
                          </svg>
                        </button>
                        <span className="text-xs text-white/20 px-2">
                          {embeds.findIndex((e) => e.id === selectedEmbed?.id) + 1} / {embeds.length}
                        </span>
                        <button
                          onClick={() => {
                            const idx = embeds.findIndex((e) => e.id === selectedEmbed?.id);
                            if (idx < embeds.length - 1) setSelectedEmbed(embeds[idx + 1]);
                          }}
                          disabled={embeds.findIndex((e) => e.id === selectedEmbed?.id) === embeds.length - 1}
                          className="p-1.5 rounded-lg border border-white/8 text-white/40 hover:text-white/80 hover:border-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Code content */}
                  <div className="flex-1 overflow-hidden px-2 py-4">
                    <CodeDisplay
                      code={code}
                      selectedEmbed={selectedEmbed}
                    />
                  </div>

                  {/* Bottom status bar */}
                  <div className="shrink-0 px-6 py-2 border-t border-white/5 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-xs text-white/20">{embeds.length} embed{embeds.length !== 1 ? "s" : ""} found</span>
                    </div>
                    <span className="text-xs text-white/15">·</span>
                    <span className="text-xs text-white/20">{code.split("\n").length} lines</span>
                    <span className="text-xs text-white/15">·</span>
                    <span className="text-xs text-white/20 font-mono">{language === "python" ? "Python" : "JavaScript"}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
