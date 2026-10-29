(function exposeCore(root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.defineProperty(root, "WebVideoAudioCore", {
      configurable: true,
      enumerable: false,
      value: api,
      writable: false
    });
  }
})(typeof globalThis === "object" ? globalThis : this, function createCore() {
  "use strict";

  const AUDIO_EXTENSIONS = new Set([
    "aac",
    "flac",
    "m4a",
    "mp3",
    "oga",
    "ogg",
    "opus",
    "wav",
    "weba"
  ]);
  const VIDEO_EXTENSIONS = new Set([
    "m3u8",
    "m4s",
    "m4v",
    "mp4",
    "mpd",
    "ts",
    "webm"
  ]);

  function cleanText(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstText(values, fallback = "") {
    for (const value of values) {
      const text = cleanText(value);
      if (text) {
        return text;
      }
    }
    return fallback;
  }

  function sanitizeFilenamePart(value, fallback) {
    let result = cleanText(value)
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();

    if (!result) {
      result = fallback;
    }

    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(result)) {
      result = `${result}_`;
    }

    return Array.from(result).slice(0, 90).join("");
  }

  function normalizeExtension(extension, fallback = "m4a") {
    const normalized = cleanText(extension)
      .replace(/^\.+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!normalized) {
      return fallback;
    }

    if (normalized === "mp4a" || normalized === "m4s") {
      return "m4a";
    }

    return normalized.slice(0, 8);
  }

  function buildAudioFilename(author, title, extension) {
    const safeAuthor = sanitizeFilenamePart(author, "未知创作者");
    const safeTitle = sanitizeFilenamePart(title, "未命名视频");
    const safeExtension = normalizeExtension(extension, "m4a");
    return `${safeAuthor} - ${safeTitle}.${safeExtension}`;
  }

  function safeHttpUrl(value, baseUrl) {
    try {
      const parsed = new URL(String(value), baseUrl || undefined);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function extensionFromUrl(value) {
    try {
      const pathname = new URL(value).pathname;
      const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
      return match ? match[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function extensionForResource(resource) {
    const mimeType = cleanText(resource?.mimeType).toLowerCase();
    const codec = cleanText(resource?.codecs).toLowerCase();
    const urlExtension = extensionFromUrl(resource?.url || "");

    if (mimeType.includes("mpeg") || urlExtension === "mp3") {
      return "mp3";
    }
    if (mimeType.includes("flac") || codec.includes("flac") || urlExtension === "flac") {
      return "flac";
    }
    if (mimeType.includes("ogg") || urlExtension === "ogg" || urlExtension === "oga") {
      return "ogg";
    }
    if (mimeType.includes("wav") || urlExtension === "wav") {
      return "wav";
    }
    if (mimeType.includes("webm") || urlExtension === "weba") {
      return "webm";
    }
    if (
      mimeType.includes("mp4") ||
      codec.includes("mp4a") ||
      urlExtension === "m4a" ||
      urlExtension === "m4s"
    ) {
      return "m4a";
    }
    if (urlExtension === "aac" || mimeType.includes("aac")) {
      return "aac";
    }
    if (AUDIO_EXTENSIONS.has(urlExtension)) {
      return normalizeExtension(urlExtension);
    }
    return "m4a";
  }

  function codecLabel(codecs) {
    const value = cleanText(codecs).toLowerCase();
    if (value.includes("flac")) {
      return "FLAC";
    }
    if (value.includes("mp4a.40.5") || value.includes("mp4a.40.29")) {
      return "HE-AAC";
    }
    if (value.includes("mp4a") || value.includes("aac")) {
      return "AAC";
    }
    if (value.includes("opus")) {
      return "Opus";
    }
    if (value.includes("vorbis")) {
      return "Vorbis";
    }
    return cleanText(codecs) || "音频";
  }

  function bitrateLabel(bandwidth) {
    const numeric = Number(bandwidth);
    return Number.isFinite(numeric) && numeric > 0
      ? `${Math.round(numeric / 1000)} kbps`
      : "码率未知";
  }

  function toArray(value) {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function extractBilibiliAudio(playInfo, baseUrl) {
    const payload = playInfo?.data || playInfo?.result || playInfo || {};
    const dash = payload?.dash || {};
    const groups = [
      { entries: toArray(dash?.flac?.audio), label: "无损音轨", priority: 3 },
      { entries: toArray(dash?.dolby?.audio), label: "杜比音轨", priority: 2 },
      { entries: toArray(dash?.audio), label: "标准音轨", priority: 1 }
    ];
    const seen = new Set();
    const resources = [];

    for (const group of groups) {
      for (const raw of group.entries) {
        const rawUrl = raw?.baseUrl || raw?.base_url || toArray(raw?.backupUrl || raw?.backup_url)[0];
        const url = safeHttpUrl(rawUrl, baseUrl);
        if (!url || seen.has(url)) {
          continue;
        }
        seen.add(url);

        const mimeType = cleanText(raw?.mimeType || raw?.mime_type || "audio/mp4");
        const codecs = cleanText(raw?.codecs);
        const bandwidth = Number(raw?.bandwidth) || 0;
        const resource = {
          bandwidth,
          codecs,
          downloadable: true,
          extension: "",
          id: cleanText(raw?.id || raw?.audioQuality || `${group.label}-${resources.length + 1}`),
          kind: "audio",
          label: `${group.label} · ${bitrateLabel(bandwidth)} · ${codecLabel(codecs)}`,
          mimeType,
          origin: "bilibili-dash",
          priority: group.priority,
          url
        };
        resource.extension = extensionForResource(resource);
        resources.push(resource);
      }
    }

    resources.sort((left, right) => {
      return right.priority - left.priority || right.bandwidth - left.bandwidth;
    });

    return resources.map((resource, index) => ({
      ...resource,
      best: index === 0
    }));
  }

  function inferKind(record, extension) {
    const tagName = cleanText(record?.tagName).toLowerCase();
    const mimeType = cleanText(record?.mimeType).toLowerCase();
    const initiatorType = cleanText(record?.initiatorType).toLowerCase();

    if (tagName === "audio" || mimeType.startsWith("audio/")) {
      return "audio";
    }
    if (extension === "m3u8" || extension === "mpd") {
      return "manifest";
    }
    if (tagName === "video" || mimeType.startsWith("video/")) {
      return "video";
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
      return "audio";
    }
    if (VIDEO_EXTENSIONS.has(extension) || initiatorType === "video") {
      return "video";
    }
    return "unknown";
  }

  function extractGenericResources(records, baseUrl) {
    const seen = new Set();
    const resources = [];

    for (const record of toArray(records)) {
      const url = safeHttpUrl(record?.url, baseUrl);
      if (!url || seen.has(url)) {
        continue;
      }

      const urlExtension = extensionFromUrl(url);
      const kind = inferKind(record, urlExtension);
      if (kind === "unknown") {
        continue;
      }

      seen.add(url);
      const mimeType = cleanText(record?.mimeType);
      const extension = kind === "audio"
        ? extensionForResource({ url, mimeType, codecs: record?.codecs })
        : normalizeExtension(urlExtension, kind === "manifest" ? "m3u8" : "mp4");
      const labelPrefix = kind === "audio"
        ? "网页独立音频"
        : kind === "manifest"
          ? "分段媒体清单"
          : "网页视频资源";

      resources.push({
        bandwidth: Number(record?.bandwidth) || 0,
        best: false,
        codecs: cleanText(record?.codecs),
        downloadable: kind === "audio",
        extension,
        id: `generic-${resources.length + 1}`,
        kind,
        label: `${labelPrefix} · ${extension.toUpperCase()}`,
        mimeType,
        origin: cleanText(record?.origin || record?.tagName || record?.initiatorType || "page"),
        priority: 0,
        url
      });
    }

    return resources.slice(0, 30);
  }

  function hostLabel(value) {
    try {
      return new URL(value).host;
    } catch {
      return "未知来源";
    }
  }

  return Object.freeze({
    bitrateLabel,
    buildAudioFilename,
    cleanText,
    codecLabel,
    extensionForResource,
    extensionFromUrl,
    extractBilibiliAudio,
    extractGenericResources,
    firstText,
    hostLabel,
    normalizeExtension,
    safeHttpUrl,
    sanitizeFilenamePart
  });
});
