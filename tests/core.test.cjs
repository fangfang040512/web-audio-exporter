const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/core.js");

test("文件名：非法字符替换并压缩空格", () => {
  assert.equal(core.buildAudioFilename("a/b:c*d", "e?f<g>", "m4a"), "a b c d - e f g.m4a");
});

test("文件名：空值走兜底", () => {
  assert.equal(core.buildAudioFilename("", "", "m4a"), "未知创作者 - 未命名视频.m4a");
});

test("文件名：Windows 保留字加后缀", () => {
  assert.equal(core.buildAudioFilename("con", "aux", "m4a"), "con_ - aux_.m4a");
});

test("文件名：超长标题截断到 90 字符", () => {
  const name = core.buildAudioFilename("作者", "标".repeat(200), "m4a");
  const title = name.split(" - ")[1].replace(".m4a", "");
  assert.equal(Array.from(title).length, 90);
});

test("扩展名：mp4a/m4s 归一为 m4a", () => {
  assert.equal(core.normalizeExtension("mp4a"), "m4a");
  assert.equal(core.normalizeExtension(".M4S"), "m4a");
  assert.equal(core.normalizeExtension("  MP3 "), "mp3");
});

test("扩展名：按 mime 与 codec 推断", () => {
  assert.equal(core.extensionForResource({ mimeType: "audio/mpeg" }), "mp3");
  assert.equal(core.extensionForResource({ mimeType: "audio/mp4" }), "m4a");
  assert.equal(core.extensionForResource({ mimeType: "audio/mp4", codecs: "fLaC" }), "flac");
  assert.equal(core.extensionForResource({ url: "https://a/b.flac" }), "flac");
  assert.equal(core.extensionForResource({ url: "https://a/b.m4s" }), "m4a");
});

test("B 站音轨：无损/杜比/标准按优先级排序并标记最优", () => {
  const tracks = core.extractBilibiliAudio({
    data: {
      dash: {
        audio: [{ baseUrl: "https://cdn/a-132.m4s", bandwidth: 132000, mimeType: "audio/mp4", codecs: "mp4a.40.2" }],
        dolby: { audio: [{ baseUrl: "https://cdn/a-dolby.m4s", bandwidth: 448000, mimeType: "audio/mp4", codecs: "ec-3" }] },
        flac: { audio: { baseUrl: "https://cdn/a-flac.m4s", bandwidth: 1000000, mimeType: "audio/mp4", codecs: "fLaC" } }
      }
    }
  });

  assert.equal(tracks.length, 3);
  assert.equal(tracks[0].url, "https://cdn/a-flac.m4s");
  assert.equal(tracks[0].extension, "flac");
  assert.equal(tracks[0].best, true);
  assert.equal(tracks[1].url, "https://cdn/a-dolby.m4s");
  assert.equal(tracks[2].url, "https://cdn/a-132.m4s");
  assert.ok(tracks[0].label.includes("无损"));
  assert.ok(tracks[0].label.includes("1000 kbps"));
});

test("B 站音轨：重复地址去重", () => {
  const dup = { baseUrl: "https://cdn/same.m4s", bandwidth: 64000, mimeType: "audio/mp4" };
  const tracks = core.extractBilibiliAudio({ data: { dash: { audio: [dup, { ...dup }] } } });
  assert.equal(tracks.length, 1);
});

test("B 站音轨：空响应返回空数组", () => {
  assert.deepEqual(core.extractBilibiliAudio(null), []);
  assert.deepEqual(core.extractBilibiliAudio({ data: {} }), []);
});

test("通用资源：音频可下载、视频与清单只作展示", () => {
  const resources = core.extractGenericResources([
    { url: "https://x/a.mp3", tagName: "audio" },
    { url: "https://x/b.mp4", tagName: "video" },
    { url: "https://x/c.m3u8" },
    { url: "https://x/a.mp3", tagName: "audio" }
  ]);

  assert.equal(resources.length, 3);
  assert.equal(resources[0].kind, "audio");
  assert.equal(resources[0].downloadable, true);
  assert.equal(resources[1].kind, "video");
  assert.equal(resources[1].downloadable, false);
  assert.equal(resources[2].kind, "manifest");
});

test("通用资源：最多保留 30 条", () => {
  const records = Array.from({ length: 60 }, (_, i) => ({ url: `https://x/${i}.mp3`, tagName: "audio" }));
  assert.equal(core.extractGenericResources(records).length, 30);
});

test("URL 校验：拒绝非 http 协议与相对地址", () => {
  assert.equal(core.safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(core.safeHttpUrl("data:text/html,x"), "");
  assert.equal(core.safeHttpUrl("https://ok.com/a"), "https://ok.com/a");
  assert.equal(core.safeHttpUrl("/rel", "https://site.com"), "https://site.com/rel");
});

test("展示文案：码率与编码标签", () => {
  assert.equal(core.bitrateLabel(192000), "192 kbps");
  assert.equal(core.bitrateLabel(0), "码率未知");
  assert.equal(core.codecLabel("mp4a.40.2"), "AAC");
  assert.equal(core.codecLabel("mp4a.40.5"), "HE-AAC");
  assert.equal(core.codecLabel("fLaC"), "FLAC");
  assert.equal(core.codecLabel("opus"), "Opus");
});
