(function () {
  "use strict";

  const core = window.WebVideoAudioCore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const dom = {
    author: $("#author-input"),
    title: $("#title-input"),
    filenamePreview: $("#filename-preview"),
    filenameReset: $("#filename-reset"),
    statusText: $("#status-text"),
    statusDot: $("#status-dot"),
    toast: $("#toast"),
    metaDpr: $("#meta-dpr"),
    metaRec: $("#meta-rec"),

    probeInput: $("#probe-input"),
    probeRun: $("#probe-run"),
    probePaste: $("#probe-paste"),
    probeClear: $("#probe-clear"),
    probeSample: $("#probe-sample"),
    probeFile: $("#probe-file"),
    probeScript: $("#probe-script"),
    probeList: $("#probe-list"),
    probeStats: $("#probe-stats"),
    probeEmpty: $("#probe-empty"),

    recCanvas: $("#rec-canvas"),
    recStage: $(".stage-card"),
    recTimer: $("#rec-timer"),
    recSub: $("#rec-sub"),
    recDot: $("#rec-dot"),
    recStart: $("#rec-start"),
    recPause: $("#rec-pause"),
    recStop: $("#rec-stop"),
    recInfo: $("#rec-info"),
    recSupport: $("#rec-support"),
    recList: $("#rec-list"),
    recEmpty: $("#rec-empty"),
    recCount: $("#rec-count"),
    recClear: $("#rec-clear"),
    levelBar: $("#level-bar"),
    levelDb: $("#level-db"),

    dropzone: $("#dropzone"),
    localFile: $("#local-file"),
    localPick: $("#local-pick"),
    localDetail: $("#local-detail"),
    localName: $("#local-name"),
    localSize: $("#local-size"),
    localCanvas: $("#local-canvas"),
    localLegend: $("#local-legend"),
    localMeta: $("#local-meta"),
    localFormat: $("#local-format"),
    localRate: $("#local-rate"),
    localChannels: $("#local-channels"),
    localExport: $("#local-export"),
    exportEstimate: $("#export-estimate"),
    previewSelection: $("#preview-selection"),
    queueCard: $("#queue-card"),
    queueList: $("#queue-list"),
    queueCount: $("#queue-count"),
    queueClear: $("#queue-clear"),
    trimStart: $("#trim-start"),
    trimEnd: $("#trim-end"),
    trimHint: $("#trim-hint"),
    localEngine: $("#local-engine"),
    cmdModal: $("#cmd-modal"),
    cmdCurl: $("#cmd-curl"),
    cmdAria2: $("#cmd-aria2"),
    cmdClose: $("#cmd-close")
  };

  const state = {
    view: "probe",
    ext: "m4a",
    context: { author: "", title: "" },
    touched: { author: false, title: false },
    tracks: [],
    previewAudio: new Audio(),
    playingNode: null,
    clips: [],
    recording: null,
    local: null,
    queue: [],
    activeId: null,
    previewNode: null,
    toastTimer: null
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const text = index === 0 || value >= 100 ? Math.round(value) : value.toFixed(1);
    return `${text} ${units[index]}`;
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /** 短音频用秒（保留小数），长音频才用 mm:ss，避免刻度出现重复的 00:00 */
  function formatSpan(seconds, digits = 2) {
    const value = Math.max(0, seconds || 0);
    return value < 60 ? `${value.toFixed(digits)}s` : formatClock(value);
  }

  function toast(message, type = "", timeout = 3400) {
    dom.toast.textContent = message;
    dom.toast.className = `toast${type ? ` is-${type}` : ""}`;
    dom.toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      dom.toast.hidden = true;
    }, timeout);
  }

  function setStatus(text, mode = "") {
    dom.statusText.textContent = text;
    dom.statusDot.className = `dot${mode ? ` is-${mode}` : ""}`;
  }

  /**
   * 优先用文件系统保存对话框，避开 IDM 之类下载接管器对 blob: 的拦截。
   * 返回 "picked"=用户选定位置，"download"=落进浏览器下载目录，"cancel"=取消。
   */
  async function saveBlob(blob, filename) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return "picked";
      } catch (error) {
        if (error?.name === "AbortError") return "cancel";
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 90000);
    return "download";
  }

  function savedMessage(result, filename, bytes) {
    const size = bytes ? `（${formatBytes(bytes)}）` : "";
    return result === "picked"
      ? `已保存：${filename}${size}`
      : `已存入浏览器下载目录：${filename}${size}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function icon(path, size = 15) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", path);
    svg.append(p);
    return svg;
  }

  /* ------------------------------------------------------------------ */
  /* filename                                                           */
  /* ------------------------------------------------------------------ */

  function currentFilename(ext) {
    return core.buildAudioFilename(dom.author.value, dom.title.value, ext || state.ext);
  }

  function refreshFilename() {
    dom.filenamePreview.textContent = currentFilename();
  }

  function setAutoName(author, title) {
    state.context = { author: author || "", title: title || "" };
    if ((!state.touched.author || !dom.author.value) && state.context.author) {
      dom.author.value = state.context.author;
    }
    if ((!state.touched.title || !dom.title.value) && state.context.title) {
      dom.title.value = state.context.title;
    }
    refreshFilename();
  }

  dom.author.addEventListener("input", () => {
    state.touched.author = true;
    refreshFilename();
  });
  dom.title.addEventListener("input", () => {
    state.touched.title = true;
    refreshFilename();
  });
  dom.filenameReset.addEventListener("click", () => {
    state.touched.author = false;
    state.touched.title = false;
    dom.author.value = state.context.author || "";
    dom.title.value = state.context.title || "";
    refreshFilename();
    toast("已恢复自动命名", "ok", 1800);
  });

  /* ------------------------------------------------------------------ */
  /* appearance: 主题 / 动效                                            */
  /* ------------------------------------------------------------------ */

  const PREF_KEY = "wae:prefs";
  const prefs = {
    mode: "dark",
    accent: "#35e0a1",
    motion: true,
    export: { format: "wav16", rate: "keep", channels: "keep" }
  };

  const prefEls = {
    toggle: $("#prefs-toggle"),
    panel: $("#prefs-panel"),
    modeSeg: $("#mode-seg"),
    swatches: $("#swatches"),
    custom: $("#accent-custom"),
    motion: $("#motion-toggle")
  };

  let accentCache = null;

  function accentChannels() {
    if (accentCache) return accentCache;
    let hex = prefs.accent.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const value = Number.parseInt(hex, 16);
    accentCache = Number.isFinite(value)
      ? [(value >> 16) & 255, (value >> 8) & 255, value & 255]
      : [53, 224, 161];
    return accentCache;
  }

  function accentColor(alpha) {
    const [r, g, b] = accentChannels();
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** 主题色提亮版，用于波形上下渐变 */
  function accentLight(alpha) {
    const [r, g, b] = accentChannels();
    const lift = (c) => Math.round(c + (255 - c) * 0.42);
    return `rgba(${lift(r)}, ${lift(g)}, ${lift(b)}, ${alpha})`;
  }

  function inkColor(alpha) {
    const light = document.documentElement.dataset.mode === "light";
    return light ? `rgba(16, 26, 43, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
  }

  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
      if (!saved) return;
      if (["dark", "light", "auto"].includes(saved.mode)) prefs.mode = saved.mode;
      if (/^#[0-9a-f]{6}$/i.test(saved.accent)) prefs.accent = saved.accent;
      if (typeof saved.motion === "boolean") prefs.motion = saved.motion;
      if (saved.export && typeof saved.export === "object") {
        prefs.export = { ...prefs.export, ...saved.export };
      }
    } catch {
      /* 忽略损坏的本地配置 */
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      /* 隐私模式下写不进去也不影响使用 */
    }
  }

  function resolvedMode() {
    if (prefs.mode !== "auto") return prefs.mode;
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }

  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.mode = resolvedMode();
    root.style.setProperty("--accent", prefs.accent);
    document.body.classList.toggle("no-motion", !prefs.motion);
    accentCache = null;

    prefEls.motion.checked = prefs.motion;
    prefEls.modeSeg.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === prefs.mode);
    });

    const lower = prefs.accent.toLowerCase();
    const match = Array.from(prefEls.swatches.querySelectorAll(".swatch"))
      .find((node) => node.dataset.accent.toLowerCase() === lower);
    prefEls.swatches.querySelectorAll(".swatch").forEach((node) => {
      node.classList.toggle("is-active", node === match);
    });
    prefEls.custom.parentElement.classList.toggle("is-active", !match);
    prefEls.custom.value = prefs.accent;

    // 恢复上次的导出参数
    if (prefs.export.format) dom.localFormat.value = prefs.export.format;
    if (prefs.export.rate) dom.localRate.value = prefs.export.rate;
    if (prefs.export.channels) dom.localChannels.value = prefs.export.channels;

    // 主题色变了，已经画好的波形要重绘
    if (state.view === "record" && !rec.recorder) drawIdleStage();
    if (state.view === "local" && state.local) drawLocalWave();
  }

  function closePrefs() {
    if (prefEls.panel.hidden) return;
    prefEls.panel.hidden = true;
    prefEls.toggle.setAttribute("aria-expanded", "false");
  }

  prefEls.toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = prefEls.panel.hidden;
    prefEls.panel.hidden = !open;
    prefEls.toggle.setAttribute("aria-expanded", String(open));
  });
  prefEls.panel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closePrefs);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePrefs();
  });

  prefEls.modeSeg.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-mode]");
    if (!btn) return;
    prefs.mode = btn.dataset.mode;
    applyPrefs();
    savePrefs();
  });

  prefEls.swatches.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (!swatch) return;
    prefs.accent = swatch.dataset.accent;
    applyPrefs();
    savePrefs();
  });

  prefEls.custom.addEventListener("input", () => {
    prefs.accent = prefEls.custom.value;
    applyPrefs();
    savePrefs();
  });

  prefEls.motion.addEventListener("change", () => {
    prefs.motion = prefEls.motion.checked;
    applyPrefs();
    savePrefs();
  });

  window.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener?.("change", () => {
    if (prefs.mode === "auto") applyPrefs();
  });

  // 鼠标光晕：跟着指针缓慢收敛，静止时几乎看不见
  function initCursorGlow() {
    const glowEl = $("#cursor-glow");
    if (!glowEl || !window.matchMedia("(pointer: fine)").matches) return;

    const pointer = { x: 0, y: 0 };
    const cursor = { x: 0, y: 0 };
    let active = false;

    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!active) {
        active = true;
        cursor.x = event.clientX;
        cursor.y = event.clientY;
        document.body.classList.add("has-pointer");
      }
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
      active = false;
      document.body.classList.remove("has-pointer");
    });

    const follow = () => {
      cursor.x += (pointer.x - cursor.x) * 0.12;
      cursor.y += (pointer.y - cursor.y) * 0.12;
      glowEl.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;
      window.requestAnimationFrame(follow);
    };
    window.requestAnimationFrame(follow);
  }

  // 按钮点击涟漪
  document.addEventListener("pointerdown", (event) => {
    if (!prefs.motion) return;
    const btn = event.target.closest(".btn");
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    btn.append(ripple);
    setTimeout(() => ripple.remove(), 620);
  });

  /* ------------------------------------------------------------------ */
  /* view switching                                                     */
  /* ------------------------------------------------------------------ */

  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      if (!view || view === state.view) return;
      state.view = view;
      $$(".nav-item").forEach((node) => node.classList.toggle("is-active", node === item));
      $$(".view").forEach((node) => node.classList.toggle("is-active", node.id === `view-${view}`));
      if (view === "record") {
        requestAnimationFrame(() => drawIdleStage());
      }
      if (view === "local" && state.local) {
        requestAnimationFrame(() => drawLocalWave());
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* probe: parse __playinfo__ / html / direct url                      */
  /* ------------------------------------------------------------------ */

  // 给用户复制到 B 站控制台执行：优先 __playinfo__，取不到退回已加载的媒体地址
  const CONSOLE_SNIPPET = String.raw`(() => {
  const info = window.__playinfo__;
  if (info && info.data && info.data.dash) {
    copy(JSON.stringify(info));
    console.log("%c已复制 __playinfo__，粘贴回导出工具即可", "color:#35e0a1");
    return;
  }
  const urls = performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => /\.m4s(\?|$)|\.m4a(\?|$)/.test(name));
  if (urls.length) {
    copy(urls.join("\n"));
    console.log("%c已复制 " + urls.length + " 条媒体地址，直接粘贴回工具", "color:#35e0a1");
    return;
  }
  console.warn("没有可用的音轨数据：先点一下播放，等画面出来再执行一次");
})();`;

  function sliceJsonObject(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return "";
  }

  function extractPlayInfo(text) {
    const raw = String(text || "").trim();
    if (!raw) return { kind: "empty" };

    const lines = raw
      .split(/[\r\n]+/)
      .map((line) => line.trim().replace(/^["'<]|["'>]$/g, ""))
      .filter(Boolean);

    if (lines.length > 0 && lines.every((line) => /^https?:\/\//i.test(line))) {
      return { kind: "urls", urls: lines };
    }

    const jsonCandidate = raw
      .replace(/^\s*(?:window\.)?__playinfo__\s*=\s*/, "")
      .replace(/;\s*$/, "");

    if (jsonCandidate.startsWith("{")) {
      try {
        return { kind: "json", data: JSON.parse(jsonCandidate) };
      } catch {
        /* fall through to html scan */
      }
    }

    const marker = raw.indexOf("__playinfo__");
    if (marker >= 0) {
      const brace = raw.indexOf("{", marker);
      if (brace >= 0) {
        const snippet = sliceJsonObject(raw, brace);
        if (snippet) {
          try {
            return { kind: "html", data: JSON.parse(snippet), source: raw };
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (/^\s*[{[]/.test(raw)) {
      try {
        return { kind: "json", data: JSON.parse(raw) };
      } catch {
        /* ignore */
      }
    }

    return { kind: "unknown" };
  }

  function guessMetaFromHtml(html) {
    const meta = { author: "", title: "" };
    if (!html) return meta;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      meta.title = core.cleanText(titleMatch[1])
        .replace(/[_\-—|]\s*(哔哩哔哩|bilibili).*$/i, "")
        .trim();
    }
    const ownerMatch = html.match(/"owner"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]{1,80})"/);
    if (ownerMatch) meta.author = core.cleanText(ownerMatch[1]);
    return meta;
  }

  function buildLinkTrack(url, index = 0, total = 1) {
    const extension = core.extensionFromUrl(url) || "unknown";
    // m4s 是 B 站 DASH 的分片容器，音频分片改名 m4a 即可播放
    const isAudio = ["aac", "flac", "m4a", "m4s", "mp3", "oga", "ogg", "opus", "wav", "weba"].includes(extension);
    const suffix = total > 1 ? ` ${index + 1}` : "";
    return {
      best: index === 0,
      bandwidth: 0,
      codecs: "",
      downloadable: true,
      extension: isAudio ? core.extensionForResource({ url }) : core.normalizeExtension(extension, "mp4"),
      id: `link-${index + 1}`,
      kind: isAudio ? "audio" : "video",
      label: `媒体直链${suffix} · ${isAudio ? (extension === "m4s" ? "DASH 分片" : "音频") : "视频容器"}`,
      mimeType: "",
      origin: "direct-url",
      priority: 0,
      sourceHost: core.hostLabel(url),
      url
    };
  }

  function shellQuote(value) {
    return '"' + String(value).replace(/(["\\])/g, "\\$1") + '"';
  }

  function refererFor(host) {
    if (/bilibili|bilivideo|hdslb/i.test(host || "")) return "https://www.bilibili.com/";
    return `https://${host}/`;
  }

  function buildDownloadCommands(track) {
    const filename = currentFilename(track.extension);
    const referer = refererFor(track.sourceHost);
    const ua = navigator.userAgent;
    return {
      curl: [
        `curl -L -o ${shellQuote(filename)}`,
        `-H "Referer: ${referer}"`,
        `-H "User-Agent: ${ua}"`,
        shellQuote(track.url)
      ].join(" "),
      aria2: [
        `aria2c -x 8 -s 8 -k 1M -o ${shellQuote(filename)}`,
        `--referer=${shellQuote(referer)}`,
        `--user-agent=${shellQuote(ua)}`,
        shellQuote(track.url)
      ].join(" ")
    };
  }

  function openCommandModal(track) {
    const commands = buildDownloadCommands(track);
    dom.cmdCurl.textContent = commands.curl;
    dom.cmdAria2.textContent = commands.aria2;
    dom.cmdModal.hidden = false;
  }

  function closeCommandModal() {
    dom.cmdModal.hidden = true;
  }

  dom.cmdClose.addEventListener("click", closeCommandModal);
  dom.cmdModal.addEventListener("click", (event) => {
    if (event.target === dom.cmdModal) closeCommandModal();
  });
  dom.cmdModal.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = btn.dataset.copy === "curl" ? dom.cmdCurl : dom.cmdAria2;
      const ok = await copyText(target.textContent);
      toast(ok ? "命令已复制" : "复制失败，请手动选中", ok ? "ok" : "error", 2200);
    });
  });

  function renderTracks(tracks) {
    dom.probeList.replaceChildren();
    dom.tracks = tracks;
    dom.probeEmpty.hidden = tracks.length > 0;

    const direct = tracks.filter((track) => track.downloadable);
    const lossless = tracks.filter((track) => track.label.includes("无损")).length;
    const maxRate = tracks.reduce((max, item) => Math.max(max, item.bandwidth || 0), 0);

    dom.probeStats.replaceChildren();
    const chunks = [
      ["音轨", direct.length],
      ["无损", lossless],
      ["最高", maxRate > 0 ? `${Math.round(maxRate / 1000)}k` : "—"]
    ];
    chunks.forEach(([label, value]) => {
      const span = document.createElement("span");
      span.className = "stat";
      span.append(document.createTextNode(`${label} `));
      const b = document.createElement("b");
      b.textContent = String(value);
      span.append(b);
      dom.probeStats.append(span);
    });

    tracks.forEach((track, index) => {
      const parts = String(track.label || "音轨").split(" · ");
      const kind = parts[0] || "音轨";
      const bitrate = parts[1] || "";
      const codec = parts.slice(2).join(" · ");

      const article = document.createElement("article");
      article.className = `track${index === 0 ? " is-best" : ""}`;

      const badge = document.createElement("span");
      badge.className = "track-badge";
      if (kind.includes("无损")) badge.classList.add("lossless");
      else if (kind.includes("杜比")) badge.classList.add("dolby");
      else if (track.origin === "direct-url") badge.classList.add("link");
      badge.textContent = kind.includes("直链") ? "直链" : kind.replace("音轨", "") || "音频";

      const main = document.createElement("div");
      main.className = "track-main";
      const titleEl = document.createElement("div");
      titleEl.className = "track-title";
      titleEl.textContent = track.kind === "video"
        ? "视频容器（无独立音频轨）"
        : `${kind}${bitrate ? ` · ${bitrate}` : ""}`;

      const metaEl = document.createElement("div");
      metaEl.className = "track-meta";
      const hostSpan = document.createElement("span");
      hostSpan.className = "host";
      hostSpan.textContent = track.sourceHost || "未知来源";
      const specSpan = document.createElement("span");
      specSpan.className = "spec";
      const extLabel = (track.extension || "").toUpperCase();
      const specs = [];
      if (codec) specs.push(codec);
      if (extLabel && extLabel !== codec.toUpperCase()) specs.push(extLabel);
      specSpan.textContent = specs.join(" · ");
      metaEl.append(hostSpan, specSpan);
      main.append(titleEl, metaEl);

      const actions = document.createElement("div");
      actions.className = "track-actions";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "icon-btn";
      playBtn.title = "试听";
      playBtn.append(icon("M8 5l11 7-11 7z"));
      playBtn.addEventListener("click", () => togglePreview(track, playBtn));

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "icon-btn";
      copyBtn.title = "复制音轨地址";
      copyBtn.append(icon("M9 9h10v10H9zM5 15V5h10"));
      copyBtn.addEventListener("click", async () => {
        const ok = await copyText(track.url);
        toast(ok ? "音轨地址已复制" : "复制失败，请手动选择", ok ? "ok" : "error", 2200);
      });

      const cmdBtn = document.createElement("button");
      cmdBtn.type = "button";
      cmdBtn.className = "icon-btn";
      cmdBtn.title = "生成命令行下载（绕过防盗链）";
      cmdBtn.append(icon("M4 17l6-6-6-6M12 19h8"));
      cmdBtn.addEventListener("click", () => openCommandModal(track));

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn sm primary";
      saveBtn.textContent = index === 0 ? "导出" : "保存";
      saveBtn.addEventListener("click", () => downloadTrack(track, saveBtn));

      actions.append(playBtn, copyBtn, cmdBtn, saveBtn);
      article.append(badge, main, actions);
      dom.probeList.append(article);
    });
  }

  function togglePreview(track, button) {
    if (state.playingNode === button && !state.previewAudio.paused) {
      state.previewAudio.pause();
      button.classList.remove("is-playing");
      state.playingNode = null;
      return;
    }
    $$(".icon-btn.is-playing").forEach((node) => node.classList.remove("is-playing"));
    state.previewAudio.src = track.url;
    state.previewAudio.play().then(() => {
      button.classList.add("is-playing");
      state.playingNode = button;
    }).catch(() => {
      toast("无法试听：音轨地址带防盗链或已过期，可直接导出或复制地址", "error", 4600);
    });
  }

  state.previewAudio.addEventListener("ended", () => {
    $$(".icon-btn.is-playing").forEach((node) => node.classList.remove("is-playing"));
    state.playingNode = null;
  });

  async function downloadTrack(track, button) {
    const filename = currentFilename(track.extension);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "获取中";
    try {
      const response = await fetch(track.url, { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("空响应");
      const result = await saveBlob(blob, filename);
      if (result === "cancel") {
        setStatus("已取消保存", "");
      } else {
        toast(savedMessage(result, filename, blob.size), "ok", 4200);
        setStatus(`导出完成 · ${filename}`, "");
      }
    } catch (error) {
      const copied = await copyText(track.url);
      toast(
        `跨域或防盗链拦截，${copied ? "音轨地址已复制，" : ""}可用下载器或新标签页保存`,
        "error",
        5200
      );
      setStatus("导出失败：资源被跨域/防盗链限制", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function runProbe() {
    const parsed = extractPlayInfo(dom.probeInput.value);
    if (parsed.kind === "empty") {
      toast("先粘贴 __playinfo__、页面源码或媒体直链", "error");
      return;
    }

    if (parsed.kind === "urls") {
      const tracks = parsed.urls.map((url, index) => buildLinkTrack(url, index, parsed.urls.length));
      const rawName = decodeURIComponent(parsed.urls[0].split("?")[0].split("/").pop() || "");
      const fallbackTitle = rawName.replace(/\.[a-z0-9]{2,8}$/i, "") || "媒体直链";
      setAutoName(state.context.author, fallbackTitle);
      state.ext = tracks[0].extension;
      refreshFilename();
      renderTracks(tracks);
      setStatus(`已识别 ${tracks.length} 条媒体地址`, "");
      toast(
        tracks.length === 1 ? "已识别媒体直链，可试听或直接导出" : `已识别 ${tracks.length} 条地址，逐条试听确认`,
        "ok",
        2800
      );
      return;
    }

    if (parsed.kind === "unknown") {
      toast("没能从文本里识别出音轨数据，请确认粘贴的是 __playinfo__ 或整页源码", "error", 5200);
      return;
    }

    const payload = parsed.data;
    const tracks = core.extractBilibiliAudio(payload, undefined).map((track) => ({
      ...track,
      sourceHost: core.hostLabel(track.url)
    }));

    if (tracks.length === 0) {
      renderTracks([]);
      toast("数据结构里没有 dash 音轨，可能是不含音轨的接口响应", "error", 4800);
      setStatus("解析完成：没有可用音轨", "error");
      return;
    }

    const meta = parsed.kind === "html" ? guessMetaFromHtml(parsed.source) : { author: "", title: "" };
    setAutoName(meta.author, meta.title);
    state.ext = tracks[0].extension;
    refreshFilename();
    renderTracks(tracks);
    setStatus(`解析完成 · ${tracks.length} 条音轨 · 最高 ${core.bitrateLabel(tracks[0].bandwidth)}`, "");
    toast(`识别到 ${tracks.length} 条音轨，默认推荐第一条`, "ok", 2800);
  }

  dom.probeRun.addEventListener("click", runProbe);
  dom.probeScript.addEventListener("click", async () => {
    const ok = await copyText(CONSOLE_SNIPPET);
    toast(ok ? "脚本已复制，去 B 站控制台粘贴执行" : "复制失败，请手动选中脚本复制", ok ? "ok" : "error", 3200);
  });
  dom.probeClear.addEventListener("click", () => {
    dom.probeInput.value = "";
    renderTracks([]);
    dom.probeStats.replaceChildren();
    setStatus("已清空输入", "");
  });
  dom.probePaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast("剪贴板是空的", "error");
        return;
      }
      dom.probeInput.value = text;
      runProbe();
    } catch {
      toast("浏览器拒绝读取剪贴板，请手动 Ctrl+V 粘贴", "error", 4000);
    }
  });
  dom.probeFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    dom.probeInput.value = await file.text();
    runProbe();
    event.target.value = "";
  });
  dom.probeSample.addEventListener("click", () => {
    const demo = {
      data: {
        dash: {
          duration: 214,
          audio: [
            {
              id: 30280,
              baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/audio-demo-192k.m4s?deadline=1",
              bandwidth: 192000,
              mimeType: "audio/mp4",
              codecs: "mp4a.40.2"
            },
            {
              id: 30232,
              baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/audio-demo-132k.m4s?deadline=1",
              bandwidth: 132000,
              mimeType: "audio/mp4",
              codecs: "mp4a.40.2"
            },
            {
              id: 30216,
              baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/audio-demo-64k.m4s?deadline=1",
              bandwidth: 64000,
              mimeType: "audio/mp4",
              codecs: "mp4a.40.2"
            }
          ],
          dolby: {
            audio: [
              {
                id: 30255,
                baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/audio-demo-dolby.m4s?deadline=1",
                bandwidth: 448000,
                mimeType: "audio/mp4",
                codecs: "ec-3"
              }
            ]
          },
          flac: {
            audio: {
              id: 30251,
              baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/audio-demo-flac.m4s?deadline=1",
              bandwidth: 1000000,
              mimeType: "audio/mp4",
              codecs: "fLaC"
            }
          }
        }
      }
    };
    dom.probeInput.value = JSON.stringify(demo, null, 2);
    setAutoName("示例创作者", "示例视频标题");
    runProbe();
    toast("已载入示例数据结构，可查看排序与码率标注", "ok", 3000);
  });

  /* ------------------------------------------------------------------ */
  /* record                                                            */
  /* ------------------------------------------------------------------ */

  const rec = {
    stream: null,
    audioStream: null,
    recorder: null,
    ctx: null,
    source: null,
    analyser: null,
    chunks: [],
    mime: "",
    startedAt: 0,
    accumulated: 0,
    raf: 0,
    history: [],
    sampleBuffer: null,
    freqBuffer: null,
    paused: false
  };

  function pickRecorderMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    return candidates.find((item) => window.MediaRecorder?.isTypeSupported?.(item)) || "";
  }

  function setupSupportBadges() {
    dom.metaDpr.textContent = String(Number((window.devicePixelRatio || 1).toFixed(2)));
    const mime = pickRecorderMime();
    dom.metaRec.textContent = mime ? mime.split(";")[0].replace("audio/", "") : "不可用";
    if (!navigator.mediaDevices?.getDisplayMedia) {
      dom.recSupport.textContent = "当前浏览器不支持捕获";
      dom.recSupport.classList.add("is-off");
      dom.recStart.disabled = true;
      return;
    }
    dom.recSupport.textContent = mime ? "捕获就绪" : "缺少 MediaRecorder";
    if (!mime) dom.recStart.disabled = true;
    dom.localEngine.textContent = window.OfflineAudioContext ? "WebAudio × Offline" : "WebAudio";
  }

  function sizeCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  function drawIdleStage() {
    if (rec.recorder && rec.recorder.state !== "inactive") return;
    const { ctx, width, height } = sizeCanvas(dom.recCanvas);
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    const mid = height / 2;
    const bars = Math.floor(width / 5);
    const time = performance.now() / 1000;
    ctx.fillStyle = accentColor(document.documentElement.dataset.mode === "light" ? 0.5 : 0.24);
    for (let i = 0; i < bars; i += 1) {
      const amp = 0.1
        + 0.17 * Math.abs(Math.sin(i * 0.21 + time * 0.9))
        + 0.11 * Math.abs(Math.sin(i * 0.068 - time * 0.45));
      const h = Math.max(1.5, amp * mid * 0.95);
      ctx.fillRect(i * 5, mid - h, 2.5, h * 2);
    }
    if (state.view === "record" && !rec.recorder) {
      rec.raf = requestAnimationFrame(drawIdleStage);
    }
  }

  function drawGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = inkColor(0.05);
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = accentColor(0.14);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawLiveWave() {
    const { ctx, width, height } = sizeCanvas(dom.recCanvas);
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    // 频谱底纹：让录音时的画面更有“在采样”的感觉
    if (rec.freqBuffer) {
      const bins = 56;
      const step = Math.max(1, Math.floor(rec.freqBuffer.length / bins));
      const barW = width / bins;
      ctx.fillStyle = accentColor(0.07);
      for (let i = 0; i < bins; i += 1) {
        let sum = 0;
        for (let j = 0; j < step; j += 1) sum += rec.freqBuffer[i * step + j];
        const level = sum / step / 255;
        const barH = Math.max(1.5, level * height * 0.9);
        ctx.fillRect(i * barW, height - barH, Math.max(1, barW - 1.5), barH);
      }
    }

    const mid = height / 2;
    const barWidth = 3;
    const gap = 2;
    const stride = barWidth + gap;
    const maxBars = Math.floor(width / stride);
    const history = rec.history;
    const start = Math.max(0, history.length - maxBars);

    for (let i = start; i < history.length; i += 1) {
      const value = history[i];
      const x = (i - start) * stride;
      const ratio = (i - start) / Math.max(1, maxBars);
      const alpha = 0.25 + ratio * 0.75;
      const h = Math.max(1.2, value * mid * 1.7);
      const grad = ctx.createLinearGradient(0, mid - h, 0, mid + h);
      grad.addColorStop(0, accentLight(alpha));
      grad.addColorStop(0.5, accentColor(alpha));
      grad.addColorStop(1, accentLight(alpha));
      ctx.fillStyle = grad;
      ctx.fillRect(x, mid - h, barWidth, h * 2);
    }

    ctx.fillStyle = accentColor(0.9);
    ctx.fillRect(width - barWidth, mid - 2, barWidth, 4);
  }

  function updateTimer() {
    if (!rec.recorder) return;
    const live = rec.paused ? 0 : performance.now() - rec.startedAt;
    const total = (rec.accumulated + live) / 1000;
    dom.recTimer.textContent = formatClock(total);
  }

  function loop() {
    if (!rec.analyser) return;
    const data = rec.sampleBuffer;
    rec.analyser.getByteTimeDomainData(data);
    if (rec.freqBuffer) rec.analyser.getByteFrequencyData(rec.freqBuffer);

    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
      if (Math.abs(value) > peak) peak = Math.abs(value);
    }
    const rms = Math.sqrt(sum / data.length);
    const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
    const percent = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    dom.levelBar.style.width = `${percent.toFixed(1)}%`;
    dom.levelDb.textContent = db <= -60 ? "−∞ dB" : `${db.toFixed(0)} dB`;

    rec.history.push(Math.min(1, peak * 1.25));
    const limit = Math.floor(dom.recCanvas.getBoundingClientRect().width / 5) + 8;
    while (rec.history.length > limit) rec.history.shift();

    drawLiveWave();
    updateTimer();
    rec.raf = requestAnimationFrame(loop);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast("当前浏览器不支持屏幕捕获，请使用 Chrome / Edge 116+", "error", 4600);
      return;
    }
    dom.recStart.disabled = true;
    setStatus("请求捕获权限…", "busy");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("没有捕获到音频轨道：重新选择时要勾选「同时共享标签页的音频」");
      }

      const audioStream = new MediaStream(audioTracks);
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(audioStream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 192000
      });

      const ctx = new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      rec.stream = stream;
      rec.audioStream = audioStream;
      rec.recorder = recorder;
      rec.ctx = ctx;
      rec.source = source;
      rec.analyser = analyser;
      rec.chunks = [];
      rec.mime = recorder.mimeType || mime || "audio/webm";
      rec.startedAt = performance.now();
      rec.accumulated = 0;
      rec.history = [];
      rec.sampleBuffer = new Uint8Array(analyser.fftSize);
      rec.freqBuffer = new Uint8Array(analyser.frequencyBinCount);
      rec.paused = false;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) rec.chunks.push(event.data);
        const bytes = rec.chunks.reduce((total, chunk) => total + chunk.size, 0);
        dom.recInfo.textContent = `${formatBytes(bytes)} · ${(rec.audioStream?.getAudioTracks()[0]?.getSettings().sampleRate || 48000)} Hz`;
      });

      recorder.addEventListener("stop", finalizeRecording, { once: true });

      audioTracks[0].addEventListener("ended", () => {
        if (rec.recorder && rec.recorder.state !== "inactive") stopRecording();
      }, { once: true });

      recorder.start(1000);

      dom.recTimer.textContent = "00:00";
      dom.recSub.textContent = "正在捕获…";
      dom.recDot.hidden = false;
      dom.recStage.classList.add("is-live");
      dom.recPause.disabled = false;
      dom.recStop.disabled = false;
      dom.recStart.textContent = "捕获进行中";
      dom.recPause.textContent = "暂停";

      cancelAnimationFrame(rec.raf);
      loop();
      setStatus("正在录音：保持目标标签页播放", "busy");
      toast("已开始捕获，录制期间请不要关闭来源标签页", "ok", 3600);
    } catch (error) {
      dom.recStart.disabled = false;
      cleanupRecorder();
      const message = error instanceof Error ? error.message : String(error);
      const isCancel = /denied|abort|cancel|not allowed/i.test(message);
      toast(isCancel ? "已取消捕获" : message, isCancel ? "" : "error", 4800);
      setStatus(isCancel ? "已取消捕获" : "录音启动失败", isCancel ? "" : "error");
    }
  }

  function pauseRecording() {
    if (!rec.recorder) return;
    if (rec.recorder.state === "recording") {
      rec.recorder.pause();
      rec.paused = true;
      rec.accumulated += performance.now() - rec.startedAt;
      dom.recPause.textContent = "继续";
      dom.recSub.textContent = "已暂停";
      dom.recDot.hidden = true;
      setStatus("录音已暂停", "busy");
    } else if (rec.recorder.state === "paused") {
      rec.recorder.resume();
      rec.paused = false;
      rec.startedAt = performance.now();
      dom.recPause.textContent = "暂停";
      dom.recSub.textContent = "正在捕获…";
      dom.recDot.hidden = false;
      setStatus("正在录音：保持目标标签页播放", "busy");
    }
  }

  function stopRecording() {
    if (!rec.recorder) return;
    if (rec.recorder.state !== "inactive") {
      dom.recStop.disabled = true;
      dom.recPause.disabled = true;
      dom.recSub.textContent = "正在封装…";
      setStatus("正在封装录音…", "busy");
      rec.recorder.stop();
    }
  }

  function downsamplePeaks(list, size) {
    if (!list || list.length === 0) return [];
    if (list.length <= size) return list.slice();
    const out = new Array(size).fill(0);
    const step = list.length / size;
    for (let i = 0; i < size; i += 1) {
      const from = Math.floor(i * step);
      const to = Math.min(list.length, Math.floor((i + 1) * step));
      let max = 0;
      for (let j = from; j < to; j += 1) max = Math.max(max, list[j] || 0);
      out[i] = max;
    }
    return out;
  }

  function drawMiniWave(canvas, peaks) {
    const ratio = window.devicePixelRatio || 1;
    const width = 84;
    const height = 26;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!peaks || peaks.length === 0) return;

    const barW = width / peaks.length;
    const mid = height / 2;
    ctx.fillStyle = accentColor(0.72);
    peaks.forEach((value, index) => {
      const h = Math.max(1, Math.min(1, value) * mid * 0.92);
      ctx.fillRect(index * barW, mid - h, Math.max(1, barW - 0.6), h * 2);
    });
  }

  function finalizeRecording() {
    const duration = rec.paused
      ? rec.accumulated / 1000
      : (rec.accumulated + (performance.now() - rec.startedAt)) / 1000;
    const blob = new Blob(rec.chunks, { type: rec.mime });
    cleanupRecorder();

    if (blob.size === 0) {
      toast("没有录到音频数据，确认来源页面在出声后重试", "error", 4800);
      setStatus("录音为空", "error");
      return;
    }

    const filename = currentFilename("webm");
    const clip = {
      id: `clip-${Date.now()}`,
      blob,
      url: URL.createObjectURL(blob),
      filename,
      duration,
      mime: rec.mime,
      peaks: downsamplePeaks(rec.history, 96),
      created: new Date()
    };
    state.clips.unshift(clip);
    renderClips();
    toast(`录音已保存：${filename}（${formatBytes(blob.size)}）`, "ok", 4400);
    setStatus(`录音完成 · ${formatClock(duration)} · ${formatBytes(blob.size)}`, "");
  }

  function cleanupRecorder() {
    cancelAnimationFrame(rec.raf);
    rec.raf = 0;
    try {
      rec.source?.disconnect();
      rec.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    rec.ctx?.close().catch(() => {});
    rec.stream?.getTracks().forEach((track) => track.stop());

    rec.stream = null;
    rec.audioStream = null;
    rec.recorder = null;
    rec.ctx = null;
    rec.source = null;
    rec.analyser = null;
    rec.paused = false;

    dom.recStart.disabled = false;
    dom.recStart.textContent = "开始捕获";
    dom.recStage.classList.remove("is-live");
    dom.recPause.disabled = true;
    dom.recPause.textContent = "暂停";
    dom.recStop.disabled = true;
    dom.recDot.hidden = true;
    dom.recSub.textContent = "待机 · 未开始捕获";
    dom.levelBar.style.width = "0%";
    dom.levelDb.textContent = "−∞ dB";
    dom.recInfo.textContent = "—";
    drawIdleStage();
  }

  function renderClips() {
    dom.recList.replaceChildren();
    dom.recCount.textContent = String(state.clips.length);
    dom.recEmpty.hidden = state.clips.length > 0;

    state.clips.forEach((clip) => {
      const item = document.createElement("article");
      item.className = "clip";

      const wave = document.createElement("canvas");
      wave.className = "clip-wave";
      wave.setAttribute("aria-hidden", "true");
      drawMiniWave(wave, clip.peaks);

      const main = document.createElement("div");
      main.className = "clip-main";
      const titleEl = document.createElement("div");
      titleEl.className = "clip-title";
      titleEl.textContent = clip.filename;
      const metaEl = document.createElement("div");
      metaEl.className = "clip-meta";
      metaEl.textContent = [
        formatClock(clip.duration),
        formatBytes(clip.blob.size),
        clip.mime.replace("audio/", "").split(";")[0],
        `${String(clip.created.getHours()).padStart(2, "0")}:${String(clip.created.getMinutes()).padStart(2, "0")}`
      ].join(" · ");
      main.append(titleEl, metaEl);

      const actions = document.createElement("div");
      actions.className = "clip-actions";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "icon-btn";
      playBtn.title = "试听";
      playBtn.append(icon("M8 5l11 7-11 7z"));
      playBtn.addEventListener("click", () => {
        if (state.playingNode === playBtn && !state.previewAudio.paused) {
          state.previewAudio.pause();
          playBtn.classList.remove("is-playing");
          state.playingNode = null;
          return;
        }
        $$(".icon-btn.is-playing").forEach((node) => node.classList.remove("is-playing"));
        state.previewAudio.src = clip.url;
        state.previewAudio.play().then(() => {
          playBtn.classList.add("is-playing");
          state.playingNode = playBtn;
        }).catch(() => toast("无法试听这个片段", "error"));
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn sm";
      saveBtn.textContent = "下载";
      saveBtn.addEventListener("click", async () => {
        const result = await saveBlob(clip.blob, clip.filename);
        if (result !== "cancel") toast(savedMessage(result, clip.filename, clip.blob.size), "ok", 3200);
      });

      const wavBtn = document.createElement("button");
      wavBtn.type = "button";
      wavBtn.className = "btn sm";
      wavBtn.textContent = "转 WAV";
      wavBtn.addEventListener("click", () => convertClip(clip, wavBtn));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.title = "删除";
      delBtn.append(icon("M6 6l12 12M18 6L6 18", 13));
      delBtn.addEventListener("click", () => {
        URL.revokeObjectURL(clip.url);
        state.clips = state.clips.filter((node) => node.id !== clip.id);
        renderClips();
        toast("片段已删除", "", 1800);
      });

      actions.append(playBtn, saveBtn, wavBtn, delBtn);
      item.append(wave, main, actions);
      dom.recList.append(item);
    });
  }

  async function convertClip(clip, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "转换中";
    try {
      const buffer = await decodeAudio(await clip.blob.arrayBuffer());
      const blob = encodeWav(buffer, 16);
      const name = clip.filename.replace(/\.[^.]+$/, "") + ".wav";
      const result = await saveBlob(blob, name);
      if (result !== "cancel") toast(savedMessage(result, name, blob.size), "ok", 4200);
    } catch (error) {
      toast(`转换失败：${error instanceof Error ? error.message : error}`, "error", 4600);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  dom.recStart.addEventListener("click", startRecording);
  dom.recPause.addEventListener("click", pauseRecording);
  dom.recStop.addEventListener("click", stopRecording);
  dom.recClear.addEventListener("click", () => {
    if (state.clips.length === 0) return;
    state.clips.forEach((clip) => URL.revokeObjectURL(clip.url));
    state.clips = [];
    renderClips();
    toast("已清空录音片段", "", 1800);
  });

  /* ------------------------------------------------------------------ */
  /* audio codecs                                                      */
  /* ------------------------------------------------------------------ */

  const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

  function parseFormat(value) {
    const text = String(value || "");
    if (text.startsWith("mp3-")) {
      return { type: "mp3", kbps: Number(text.split("-")[1]) || 192 };
    }
    return { type: "wav", bits: text === "wav24" ? 24 : 16 };
  }

  function estimateBytes(duration, formatValue, rate, channels) {
    const fmt = parseFormat(formatValue);
    if (fmt.type === "mp3") return (duration * fmt.kbps * 1000) / 8;
    return 44 + (duration * rate * channels * fmt.bits) / 8;
  }

  function floatTo16(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }

  async function encodeMp3(buffer, kbps, onProgress) {
    const encoder = new window.lamejs.Mp3Encoder(
      Math.min(2, buffer.numberOfChannels),
      buffer.sampleRate,
      kbps
    );
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const blockSize = 1152;
    const chunks = [];
    const total = left.length;

    for (let offset = 0; offset < total; offset += blockSize) {
      const end = Math.min(total, offset + blockSize);
      const leftChunk = floatTo16(left.subarray(offset, end));
      const rightChunk = right ? floatTo16(right.subarray(offset, end)) : null;
      const encoded = rightChunk
        ? encoder.encodeBuffer(leftChunk, rightChunk)
        : encoder.encodeBuffer(leftChunk);
      if (encoded.length > 0) chunks.push(encoded);

      // 每 120 块让出一次主线程，顺便刷新进度
      if (offset % (blockSize * 120) === 0) {
        onProgress?.(total ? offset / total : 1);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);
    onProgress?.(1);
    return new Blob(chunks, { type: "audio/mpeg" });
  }

  async function decodeAudio(arrayBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      return await ctx.decodeAudioData(arrayBuffer);
    } finally {
      ctx.close().catch(() => {});
    }
  }

  function createBuffer(length, channels, sampleRate) {
    try {
      return new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
    } catch {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return new Ctx().createBuffer(channels, length, sampleRate);
    }
  }

  function sliceBuffer(buffer, start, end) {
    const from = Math.max(0, Math.floor(start * buffer.sampleRate));
    const to = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
    const length = Math.max(1, to - from);
    const channels = buffer.numberOfChannels;
    const out = createBuffer(length, channels, buffer.sampleRate);
    for (let c = 0; c < channels; c += 1) {
      out.copyToChannel(buffer.getChannelData(c).subarray(from, to), c);
    }
    return out;
  }

  async function resampleBuffer(buffer, rate, channels) {
    if (buffer.sampleRate === rate && buffer.numberOfChannels === channels) return buffer;
    const length = Math.max(1, Math.ceil(buffer.duration * rate));
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return buffer;
    const offline = new Offline(channels, length, rate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    return offline.startRendering();
  }

  function encodeWav(buffer, bitDepth = 16) {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytesPerSample = bitDepth / 8;
    const dataSize = frames * channels * bytesPerSample;
    const view = new DataView(new ArrayBuffer(44 + dataSize));

    const writeTag = (offset, tag) => {
      for (let i = 0; i < tag.length; i += 1) view.setUint8(offset + i, tag.charCodeAt(i));
    };

    writeTag(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeTag(8, "WAVE");
    writeTag(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, bitDepth, true);
    writeTag(36, "data");
    view.setUint32(40, dataSize, true);

    const data = [];
    for (let c = 0; c < channels; c += 1) data.push(buffer.getChannelData(c));

    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let c = 0; c < channels; c += 1) {
        const sample = Math.max(-1, Math.min(1, data[c][frame]));
        if (bitDepth === 16) {
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        } else {
          const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
          view.setUint8(offset, value & 0xff);
          view.setUint8(offset + 1, (value >> 8) & 0xff);
          view.setUint8(offset + 2, (value >> 16) & 0xff);
          offset += 3;
        }
      }
    }

    return new Blob([view.buffer], { type: "audio/wav" });
  }

  /* ------------------------------------------------------------------ */
  /* local file                                                        */
  /* ------------------------------------------------------------------ */

  function applyLocalItem(item) {
    stopPreviewSelection();
    state.local = { file: item.file, buffer: item.buffer, info: item.info };

    const buffer = item.buffer;
    const seconds = buffer.duration;
    dom.localName.textContent = item.name;
    dom.localSize.textContent = formatBytes(item.size);
    dom.localDetail.hidden = false;
    dom.localExport.disabled = false;
    dom.trimStart.value = "0";
    dom.trimEnd.value = seconds.toFixed(2);
    validateTrim();

    const metaItems = [
      ["时长", formatSpan(seconds)],
      ["采样率", `${buffer.sampleRate} Hz`],
      ["声道", buffer.numberOfChannels === 1 ? "单声道" : `${buffer.numberOfChannels} 声道`],
      ["文件大小", formatBytes(item.size)],
      ["视频尺寸", item.info?.width ? `${item.info.width}×${item.info.height}` : "无视频轨"],
      ["容器", (item.file.type || item.name.split(".").pop() || "未知").replace("video/", "").replace("audio/", "")]
    ];
    dom.localMeta.replaceChildren();
    metaItems.forEach(([label, value]) => {
      const cell = document.createElement("div");
      cell.className = "meta-cell";
      const span = document.createElement("span");
      span.textContent = label;
      const b = document.createElement("b");
      b.textContent = String(value);
      cell.append(span, b);
      dom.localMeta.append(cell);
    });

    setAutoName("", item.name.replace(/\.[^.]+$/, ""));
    state.ext = "wav";
    refreshFilename();
    requestAnimationFrame(() => drawLocalWave());
    setStatus(`已解码 · ${formatSpan(seconds)} · ${buffer.sampleRate} Hz`, "");
  }

  function selectQueueItem(id) {
    const item = state.queue.find((entry) => entry.id === id);
    if (!item) return;
    state.activeId = id;
    renderQueue();

    if (item.status === "ready") {
      applyLocalItem(item);
      if (item.buffer.duration > 3600) {
        toast("文件超过 1 小时，导出 WAV 会占用较多内存，建议先截取区间", "", 5200);
      }
    } else if (item.status === "error") {
      dom.localDetail.hidden = true;
      dom.localExport.disabled = true;
      setStatus(`解码失败：${item.error}`, "error");
      toast(`解码失败：${item.error}。MKV 等容器需要先转码`, "error", 5200);
    } else {
      dom.localDetail.hidden = true;
      setStatus(`正在解码 ${item.name}…`, "busy");
    }
  }

  async function decodeQueueItem(item) {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const objectUrl = URL.createObjectURL(item.file);
    probe.src = objectUrl;
    const info = await new Promise((resolve) => {
      const done = () => resolve({
        duration: probe.duration || 0,
        width: probe.videoWidth || 0,
        height: probe.videoHeight || 0
      });
      probe.addEventListener("loadedmetadata", done, { once: true });
      probe.addEventListener("error", done, { once: true });
      setTimeout(done, 1500);
    });
    URL.revokeObjectURL(objectUrl);

    const arrayBuffer = await item.file.arrayBuffer();
    item.buffer = await decodeAudio(arrayBuffer);
    item.info = info;
  }

  let queueRunning = false;
  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    try {
      while (state.queue.some((entry) => entry.status === "pending")) {
        const item = state.queue.find((entry) => entry.status === "pending");
        item.status = "decoding";
        renderQueue();
        if (item.id === state.activeId) setStatus(`正在解码 ${item.name}…`, "busy");

        try {
          await decodeQueueItem(item);
          item.status = "ready";
          if (item.id === state.activeId) {
            applyLocalItem(item);
            toast(`解码完成：${item.name}`, "ok", 2800);
          }
        } catch (error) {
          item.status = "error";
          item.error = error instanceof Error ? error.message : String(error);
          if (item.id === state.activeId) {
            setStatus(`解码失败：${item.error}`, "error");
            dom.localDetail.hidden = true;
            dom.localExport.disabled = true;
          }
        }
        renderQueue();
      }
    } finally {
      queueRunning = false;
    }
  }

  function enqueueFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;

    const wasEmpty = state.queue.length === 0;
    list.forEach((file) => {
      state.queue.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        status: "pending",
        buffer: null,
        info: null,
        error: ""
      });
    });
    renderQueue();

    if (wasEmpty) {
      state.activeId = state.queue[0].id;
      renderQueue();
    }
    setStatus(`已加入 ${list.length} 个文件，开始解码…`, "busy");
    processQueue();
  }

  function removeQueueItem(id) {
    const index = state.queue.findIndex((entry) => entry.id === id);
    if (index < 0) return;

    const wasActive = state.activeId === id;
    state.queue.splice(index, 1);

    if (!wasActive) {
      renderQueue();
      return;
    }

    stopPreviewSelection();
    state.activeId = null;
    state.local = null;
    dom.localDetail.hidden = true;
    dom.localExport.disabled = true;

    const next = state.queue.find((entry) => entry.status === "ready") || state.queue[0];
    if (next) selectQueueItem(next.id);
    else {
      renderQueue();
      setStatus("队列已清空", "");
    }
  }

  function renderQueue() {
    dom.queueCard.hidden = state.queue.length === 0;
    dom.queueCount.textContent = String(state.queue.length);
    dom.queueList.replaceChildren();

    state.queue.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = `queue-item${item.id === state.activeId ? " is-active" : ""}`;
      row.addEventListener("click", () => selectQueueItem(item.id));

      const idx = document.createElement("span");
      idx.className = "q-index";
      idx.textContent = String(index + 1).padStart(2, "0");

      const name = document.createElement("span");
      name.className = "q-name";
      name.textContent = item.name;

      const stateEl = document.createElement("span");
      stateEl.className = "q-state";
      if (item.status === "ready") {
        stateEl.classList.add("is-done");
        const memory = item.buffer.length * 4 * item.buffer.numberOfChannels;
        stateEl.textContent = `${formatSpan(item.buffer.duration)} · 内存 ${formatBytes(memory)}`;
      } else if (item.status === "error") {
        stateEl.classList.add("is-error");
        stateEl.textContent = "解码失败";
        stateEl.title = item.error;
      } else if (item.status === "decoding") {
        stateEl.textContent = "解码中…";
      } else {
        stateEl.textContent = "等待";
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.title = "移出队列";
      del.append(icon("M6 6l12 12M18 6L6 18", 12));
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        removeQueueItem(item.id);
      });

      row.append(idx, name, stateEl, del);
      dom.queueList.append(row);
    });
  }

  function localPeaks(buffer, width) {
    const cached = state.local?.peaks;
    if (cached && cached.width === width && cached.length === buffer.length) return cached.values;

    const channels = buffer.numberOfChannels;
    const data = [];
    for (let c = 0; c < channels; c += 1) data.push(buffer.getChannelData(c));

    const step = Math.max(1, Math.floor(buffer.length / width));
    const values = new Float32Array(width * 2);
    const maxSpan = 1200;

    for (let x = 0; x < width; x += 1) {
      const start = x * step;
      const end = Math.min(buffer.length, start + step);
      let min = 1;
      let max = -1;
      const span = Math.min(maxSpan, end - start) || 1;
      const inc = Math.max(1, Math.floor((end - start) / span));
      for (let i = start; i < end; i += inc) {
        let value = 0;
        for (let c = 0; c < channels; c += 1) value += data[c][i] / channels;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      values[x * 2] = min > max ? 0 : min;
      values[x * 2 + 1] = min > max ? 0 : max;
    }

    if (state.local) state.local.peaks = { width, length: buffer.length, values };
    return values;
  }

  function drawLocalWave() {
    const local = state.local;
    if (!local) return;
    const canvas = dom.localCanvas;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const buffer = local.buffer;
    const duration = buffer.duration;
    const mid = height / 2;
    const peaks = localPeaks(buffer, width);

    const startTime = Math.max(0, Number(dom.trimStart.value) || 0);
    const endTime = Math.min(duration, Number(dom.trimEnd.value) || duration);
    const hasSelection = endTime > startTime;

    if (hasSelection) {
      const x1 = (startTime / duration) * width;
      const x2 = (endTime / duration) * width;
      ctx.fillStyle = accentColor(0.09);
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    }

    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      const max = peaks[x * 2 + 1];
      const min = peaks[x * 2];
      const y1 = mid - max * mid * 0.92;
      const y2 = mid - min * mid * 0.92;
      ctx.moveTo(x + 0.5, y1);
      ctx.lineTo(x + 0.5, Math.max(y2, y1 + 0.6));
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, accentColor(0.95));
    gradient.addColorStop(0.5, accentColor(0.55));
    gradient.addColorStop(1, accentColor(0.95));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (hasSelection) {
      const x1 = (startTime / duration) * width;
      const x2 = (endTime / duration) * width;
      ctx.fillStyle = accentColor(0.8);
      ctx.fillRect(x1, 0, 1.5, height);
      ctx.fillRect(Math.max(0, x2 - 1.5), 0, 1.5, height);
    }

    ctx.strokeStyle = accentColor(0.16);
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    const marks = 5;
    ctx.fillStyle = inkColor(0.32);
    ctx.font = "10px ui-monospace, monospace";
    for (let i = 0; i <= marks; i += 1) {
      const x = (width / marks) * i;
      ctx.fillRect(x, 0, 1, height);
      const time = (buffer.duration / marks) * i;
      ctx.fillText(formatSpan(time, 1), Math.min(width - 40, x + 4), height - 6);
    }

    dom.localLegend.textContent = `${buffer.numberOfChannels === 1 ? "MONO" : "STEREO"} · ${buffer.sampleRate} Hz · ${formatSpan(duration)} · 在波形上拖动可框选片段`;
  }

  function updateEstimate() {
    const local = state.local;
    if (!local) {
      dom.exportEstimate.textContent = "预计 —";
      dom.exportEstimate.classList.remove("is-heavy");
      return;
    }
    const duration = Math.max(
      0,
      (Number(dom.trimEnd.value) || local.buffer.duration) - (Number(dom.trimStart.value) || 0)
    );
    const fmt = parseFormat(dom.localFormat.value);
    let rate = dom.localRate.value === "keep" ? local.buffer.sampleRate : Number(dom.localRate.value);
    let channels = dom.localChannels.value === "keep" ? local.buffer.numberOfChannels : Number(dom.localChannels.value);
    if (fmt.type === "mp3") {
      if (!MP3_RATES.includes(rate)) rate = 44100;
      channels = Math.min(2, channels);
    }
    const bytes = estimateBytes(duration, dom.localFormat.value, rate, channels);
    dom.exportEstimate.textContent = `预计 ${formatBytes(bytes)}`;
    dom.exportEstimate.classList.toggle("is-heavy", bytes > 200 * 1024 * 1024);
  }

  function trimDuration() {
    return state.local?.buffer.duration || 0;
  }

  /** 校验截取区间，返回是否合法；同时更新提示文案与导出按钮状态 */
  function validateTrim() {
    const duration = trimDuration();
    if (!duration) return false;

    const max = duration.toFixed(2);
    dom.trimStart.max = max;
    dom.trimEnd.max = max;

    const startRaw = dom.trimStart.value.trim();
    const endRaw = dom.trimEnd.value.trim();
    const start = startRaw === "" ? 0 : Number(startRaw);
    const end = endRaw === "" ? duration : Number(endRaw);

    const startBad = !Number.isFinite(start) || start < 0 || start >= duration;
    const endBad = !Number.isFinite(end) || end > duration + 0.001 || end <= 0;
    const inverted = Number.isFinite(start) && Number.isFinite(end) && start >= end;

    let message = `可用区间 0 – ${max} 秒 · 终点留空表示整段`;
    if (end > duration + 0.001) message = `终点超出音频长度，最长 ${max} 秒`;
    else if (inverted) message = "起点必须小于终点";
    else if (start < 0) message = "起点不能小于 0";
    else if (start > 0.001 || end < duration - 0.001) {
      message = `已选 ${start.toFixed(2)} – ${end.toFixed(2)} 秒 · 共 ${(end - start).toFixed(2)}s`;
    }

    dom.trimStart.classList.toggle("is-invalid", startBad || inverted);
    dom.trimEnd.classList.toggle("is-invalid", endBad || inverted);
    dom.trimHint.classList.toggle("is-invalid", startBad || endBad || inverted);
    dom.trimHint.textContent = message;
    dom.localExport.disabled = startBad || endBad || inverted;
    updateEstimate();
    return !(startBad || endBad || inverted);
  }

  /** 失焦时把越界值夹回合法范围，避免留下不存在的区间 */
  function clampTrim(input, fallback) {
    const duration = trimDuration();
    if (!duration) return;
    const value = Number(input.value);
    if (input.value.trim() === "") {
      input.value = String(Math.round(fallback * 100) / 100);
      return;
    }
    if (!Number.isFinite(value)) {
      input.value = String(Math.round(fallback * 100) / 100);
      return;
    }
    const clamped = Math.min(duration, Math.max(0, value));
    input.value = String(Math.round(clamped * 100) / 100);
  }

  async function exportLocal() {
    if (!state.local) return;
    const { buffer } = state.local;

    const before = `${dom.trimStart.value}|${dom.trimEnd.value}`;
    clampTrim(dom.trimStart, 0);
    clampTrim(dom.trimEnd, buffer.duration);
    const corrected = before !== `${dom.trimStart.value}|${dom.trimEnd.value}`;

    if (!validateTrim()) {
      toast(dom.trimHint.textContent, "error", 4200);
      return;
    }
    if (corrected) toast(`区间越界，已修正为 0 – ${dom.trimEnd.value} 秒`, "", 3400);

    const start = Math.max(0, Number(dom.trimStart.value) || 0);
    const rawEnd = Number(dom.trimEnd.value) || buffer.duration;
    const end = Math.min(buffer.duration, rawEnd);
    const fmt = parseFormat(dom.localFormat.value);
    const rate = dom.localRate.value === "keep" ? buffer.sampleRate : Number(dom.localRate.value);
    const channels = dom.localChannels.value === "keep" ? buffer.numberOfChannels : Number(dom.localChannels.value);
    const label = dom.localExport.textContent;

    dom.localExport.disabled = true;
    dom.localExport.textContent = "处理中…";
    setStatus("正在渲染音轨…", "busy");

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const sliced = sliceBuffer(buffer, start, end);
      let rendered = await resampleBuffer(sliced, rate, channels);
      let blob;
      let extension;

      if (fmt.type === "mp3") {
        if (!MP3_RATES.includes(rendered.sampleRate)) {
          rendered = await resampleBuffer(rendered, 44100, rendered.numberOfChannels);
        }
        setStatus("正在编码 MP3…", "busy");
        blob = await encodeMp3(rendered, fmt.kbps, (progress) => {
          dom.localExport.textContent = `编码 ${Math.round(progress * 100)}%`;
        });
        extension = "mp3";
      } else {
        blob = encodeWav(rendered, fmt.bits);
        extension = "wav";
      }

      const filename = currentFilename(extension);
      const result = await saveBlob(blob, filename);
      if (result === "cancel") {
        setStatus("已取消导出", "");
      } else {
        toast(savedMessage(result, filename, blob.size), "ok", 4600);
        setStatus(`导出完成 · ${formatSpan(rendered.duration)} · ${formatBytes(blob.size)}`, "");
      }
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : error}`, "error", 5000);
      setStatus("导出失败", "error");
    } finally {
      dom.localExport.textContent = label;
      validateTrim();
    }
  }

  dom.localPick.addEventListener("click", (event) => {
    event.stopPropagation();
    dom.localFile.click();
  });
  dom.dropzone.addEventListener("click", () => dom.localFile.click());
  dom.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dom.localFile.click();
    }
  });
  dom.localFile.addEventListener("change", (event) => {
    enqueueFiles(event.target.files);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((name) => {
    dom.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      dom.dropzone.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    dom.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      dom.dropzone.classList.remove("is-over");
    });
  });
  dom.dropzone.addEventListener("drop", (event) => {
    enqueueFiles(event.dataTransfer?.files);
  });

  dom.queueClear.addEventListener("click", () => {
    if (state.queue.length === 0) return;
    stopPreviewSelection();
    state.queue = [];
    state.activeId = null;
    state.local = null;
    dom.localDetail.hidden = true;
    dom.localExport.disabled = true;
    renderQueue();
    setStatus("队列已清空", "");
  });

  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => {
    if (event.target.closest("#dropzone")) return;
    event.preventDefault();
  });

  dom.localExport.addEventListener("click", exportLocal);

  /* 波形拖选 + 选区试听 */

  const drag = { active: false, anchor: 0 };

  function timeAtPointer(event) {
    const local = state.local;
    if (!local) return 0;
    const rect = dom.localCanvas.getBoundingClientRect();
    if (!rect.width) return 0;
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    return (x / rect.width) * local.buffer.duration;
  }

  function applySelection(a, b) {
    const duration = trimDuration();
    if (!duration) return;
    const startValue = Math.max(0, Math.min(a, b));
    const endValue = Math.min(duration, Math.max(a, b));
    if (endValue - startValue < 0.01) return;
    dom.trimStart.value = startValue.toFixed(2);
    dom.trimEnd.value = endValue.toFixed(2);
    validateTrim();
    drawLocalWave();
  }

  dom.localCanvas.addEventListener("pointerdown", (event) => {
    if (!state.local) return;
    event.preventDefault();
    drag.active = true;
    drag.anchor = timeAtPointer(event);
    dom.localCanvas.classList.add("is-dragging");
    try {
      dom.localCanvas.setPointerCapture(event.pointerId);
    } catch {
      /* 某些环境不支持捕获 */
    }
  });

  dom.localCanvas.addEventListener("pointermove", (event) => {
    if (!drag.active) return;
    applySelection(drag.anchor, timeAtPointer(event));
  });

  function endDrag(event) {
    if (!drag.active) return;
    drag.active = false;
    dom.localCanvas.classList.remove("is-dragging");
    try {
      dom.localCanvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    drawLocalWave();
  }
  dom.localCanvas.addEventListener("pointerup", endDrag);
  dom.localCanvas.addEventListener("pointercancel", endDrag);

  function stopPreviewSelection() {
    const node = state.previewNode;
    if (!node) return;
    state.previewNode = null;
    try {
      node.source.stop();
    } catch {
      /* 已经播完 */
    }
    node.context.close().catch(() => {});
    dom.previewSelection.textContent = "试听选区";
    dom.previewSelection.classList.remove("is-active");
  }

  async function togglePreviewSelection() {
    if (state.previewNode) {
      stopPreviewSelection();
      return;
    }
    if (!state.local) return;

    const duration = state.local.buffer.duration;
    const startValue = Math.max(0, Number(dom.trimStart.value) || 0);
    const endValue = Math.min(duration, Number(dom.trimEnd.value) || duration);
    if (endValue - startValue < 0.05) {
      toast("选区太短，先在波形上拖一段", "error", 2800);
      return;
    }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const context = new Ctx();
    await context.resume();
    const source = context.createBufferSource();
    source.buffer = state.local.buffer;
    source.connect(context.destination);
    source.onended = () => stopPreviewSelection();
    source.start(0, startValue, endValue - startValue);

    state.previewNode = { context, source };
    dom.previewSelection.textContent = "停止试听";
    dom.previewSelection.classList.add("is-active");
    setStatus(`试听 ${formatSpan(startValue)} – ${formatSpan(endValue)}`, "");
  }

  dom.previewSelection.addEventListener("click", togglePreviewSelection);

  [dom.localFormat, dom.localRate, dom.localChannels].forEach((select) => {
    select.addEventListener("change", () => {
      // lamejs 只吃标准采样率，keep 到非标时自动落 44100
      if (
        dom.localFormat.value.startsWith("mp3-") &&
        dom.localRate.value === "keep" &&
        state.local &&
        !MP3_RATES.includes(state.local.buffer.sampleRate)
      ) {
        dom.localRate.value = "44100";
      }
      updateEstimate();
      prefs.export = {
        format: dom.localFormat.value,
        rate: dom.localRate.value,
        channels: dom.localChannels.value
      };
      savePrefs();
    });
  });

  dom.trimStart.addEventListener("input", validateTrim);
  dom.trimEnd.addEventListener("input", validateTrim);
  dom.trimStart.addEventListener("blur", () => {
    clampTrim(dom.trimStart, 0);
    validateTrim();
  });
  dom.trimEnd.addEventListener("blur", () => {
    clampTrim(dom.trimEnd, trimDuration());
    validateTrim();
  });

  /* ------------------------------------------------------------------ */
  /* resize + boot                                                     */
  /* ------------------------------------------------------------------ */

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.view === "record") {
        if (rec.recorder) drawLiveWave();
        else drawIdleStage();
      }
      if (state.view === "local" && state.local) drawLocalWave();
    }, 140);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && state.view === "probe") {
      runProbe();
      return;
    }
    if (event.key !== " " && event.code !== "Space") return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
    if (state.view !== "record") return;
    event.preventDefault();
    if (rec.recorder) stopRecording();
    else startRecording();
  });

  // PWA：装到桌面后双击即开（file:// 下不支持，跳过）
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  setupSupportBadges();
  readPrefs();
  applyPrefs();
  initCursorGlow();
  renderClips();
  refreshFilename();
  requestAnimationFrame(() => {
    if (state.view === "record") drawIdleStage();
  });
  setStatus("就绪 · 所有处理都在本地完成", "");

  // 深链接：?view=record|local 直达对应面板，?demo=1 载入示例数据
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  if (requested) {
    const target = document.querySelector(`.nav-item[data-view="${requested}"]`);
    if (target) target.click();
  }
  if (params.get("demo") === "1") {
    dom.probeSample.click();
  }
  if (params.get("local") === "1") {
    fetch("assets/sample.wav")
      .then((response) => response.blob())
      .then((blob) => enqueueFiles([new File([blob], "示例音频 - 测试波形.wav", { type: "audio/wav" })]));
  }
})();
