import express from "express";
import fetch from "node-fetch";
import ytdlp from "yt-dlp-exec";
import NodeCache from "node-cache";

const app = express();
const PORT = process.env.PORT || 3000;

// Dış veri kaynağı: GitHub RAW JSON gibi
// Örn: https://raw.githubusercontent.com/kullanici/repo/main/playlist.json
const PLAYLIST_URL = process.env.PLAYLIST_URL;

const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1 saat cache

app.get("/", (_, res) => {
  res.type("text/plain").send("BarisHA M3U Maker ✅ /m3u ile liste verilir.");
});

app.get("/m3u", async (req, res) => {
  try {
    const items = await loadPlaylist();
    const lines = ["#EXTM3U"];

    // İsteğe bağlı: ?group=Filmler gibi filtre
    const onlyGroup = req.query.group?.trim();

    for (const it of items) {
      if (onlyGroup && (it.group || "").trim() !== onlyGroup) continue;

      const title = it.title || "Video";
      const group = it.group || "Videolar";
      const logo  = it.logo  || "";
      const type  = (it.type || "direct").toLowerCase();
      const url   = it.url;

      let streamUrl = null;

      if (type === "youtube") {
        // Cache anahtarı: YouTube linki
        const ck = `yt:${url}`;
        streamUrl = cache.get(ck);
        if (!streamUrl) {
          // HLS (m3u8) tercih, yoksa best
          const out = await ytdlp(url, {
            dumpSingleJson: false,
            getUrl: true,
            // best[protocol^=m3u8]/best -> önce HLS, yoksa best
            format: 'best[protocol^=m3u8]/best'
          });

          // yt-dlp-exec getUrl çıktısı bazen tek satır döner
          streamUrl = String(out).trim().split(/\r?\n/)[0];
          if (!/^https?:\/\//i.test(streamUrl)) throw new Error("Stream URL bulunamadı");
          cache.set(ck, streamUrl, 60 * 60); // 1 saat tut
        }
      } else if (type === "direct") {
        streamUrl = url; // mp4/m3u8 vs direkt
      } else {
        // ileride 'proxy' gibi tipler eklemek istersen burada ele al
        continue;
      }

      const attrs = [
        'tvg-id=""',
        `tvg-name="${escapeAttr(title)}"`,
        logo ? `tvg-logo="${escapeAttr(logo)}"` : null,
        `group-title="${escapeAttr(group)}"`
      ].filter(Boolean).join(" ");

      lines.push(`#EXTINF:-1 ${attrs}, ${title}`);
      lines.push(streamUrl);
    }

    res.type("text/plain").send(lines.join("\n"));
  } catch (e) {
    res.status(500).type("text/plain").send("Hata: " + (e?.message || e));
  }
});

function escapeAttr(s="") {
  return s.replace(/"/g, "'");
}

async function loadPlaylist() {
  if (!PLAYLIST_URL) throw new Error("PLAYLIST_URL env değişkeni yok.");
  const cacheKey = `playlist:${PLAYLIST_URL}`;
  let data = cache.get(cacheKey);
  if (!data) {
    const r = await fetch(PLAYLIST_URL, { headers: { "Cache-Control": "no-cache" }});
    if (!r.ok) throw new Error("Playlist indirilemedi: " + r.status);
    data = await r.json();
    cache.set(cacheKey, data, 60); // 60 sn list cache (içerik sık değişiyorsa yükselt)
  }
  return Array.isArray(data) ? data : (data.items || []);
}

app.listen(PORT, () => console.log("M3U Maker running on", PORT));
