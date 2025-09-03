import express from "express";
import fetch from "node-fetch";
import ytdlp from "yt-dlp-exec";
import NodeCache from "node-cache";

const app = express();
const PORT = process.env.PORT || 3000;
const PLAYLIST_URL = process.env.PLAYLIST_URL;
const YT_DISABLE = process.env.YT_DISABLE === "1"; // YouTube işleme kapatmak için 1 yap

const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1 saat cache

app.get("/health", (_, res) => res.status(200).send("OK"));
app.get("/",   (_, res) => res.type("text/plain").send("BarisHA M3U Maker ✅  /m3u ile liste verilir."));

app.get("/m3u", async (req, res) => {
  try {
    const items = await loadPlaylist();
    const onlyGroup = req.query.group?.trim();
    const lines = ["#EXTM3U"];

    for (const it of items) {
      if (onlyGroup && (it.group || "").trim() !== onlyGroup) continue;

      const title = it.title || "Video";
      const group = it.group || "Videolar";
      const logo  = it.logo  || "";
      const type  = (it.type || "direct").toLowerCase();
      const url   = it.url;

      let streamUrl = null;

      if (type === "youtube") {
        if (YT_DISABLE) {
          console.warn("[YT] disabled, skipping:", url);
          continue; // İstersen direct geçmek yerine atlıyoruz
        }
        const ck = `yt:${url}`;
        streamUrl = cache.get(ck);
        if (!streamUrl) {
          try {
            const out = await ytdlp(url, {
              getUrl: true,
              format: "best[protocol^=m3u8]/best"
            });
            streamUrl = String(out).trim().split(/\r?\n/)[0];
            if (!/^https?:\/\//i.test(streamUrl)) throw new Error("Geçersiz stream URL");
            cache.set(ck, streamUrl, 60 * 60);
          } catch (err) {
            console.error("[YT] yt-dlp hata:", err?.message || err);
            continue; // YT çökerse servisi çökertme, bu öğeyi atla
          }
        }
      } else {
        streamUrl = url; // mp4/m3u8
      }

      if (!streamUrl) continue;

      const attrs = [
        'tvg-id=""',
        `tvg-name="${esc(title)}"`,
        logo ? `tvg-logo="${esc(logo)}"` : null,
        `group-title="${esc(group)}"`
      ].filter(Boolean).join(" ");

      lines.push(`#EXTINF:-1 ${attrs}, ${title}`);
      lines.push(streamUrl);
    }

    res.type("text/plain").send(lines.join("\n"));
  } catch (e) {
    console.error("[/m3u] fatal:", e?.message || e);
    res.status(500).type("text/plain").send("Hata: " + (e?.message || e));
  }
});

function esc(s=""){ return s.replace(/"/g,"'"); }

async function loadPlaylist() {
  if (!PLAYLIST_URL) throw new Error("PLAYLIST_URL eksik.");
  const ck = `pl:${PLAYLIST_URL}`;
  let data = cache.get(ck);
  if (!data) {
    const r = await fetch(PLAYLIST_URL, { headers: { "Cache-Control": "no-cache" }});
    if (!r.ok) throw new Error(`Playlist indirilemedi: HTTP ${r.status}`);
    data = await r.json();
    cache.set(ck, data, 60);
  }
  const arr = Array.isArray(data) ? data : (data.items || []);
  if (!Array.isArray(arr)) throw new Error("Playlist JSON formatı dizi değil.");
  return arr;
}

app.listen(PORT, () => console.log("M3U Maker running on", PORT));
