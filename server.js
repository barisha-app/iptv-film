import express from "express";
import fetch from "node-fetch";
import NodeCache from "node-cache";
import YTDlpWrap from "yt-dlp-wrap";

const app = express();
const PORT = process.env.PORT || 3000;
const PLAYLIST_URL = process.env.PLAYLIST_URL;
const YT_DISABLE = process.env.YT_DISABLE === "1";

const cache = new NodeCache({ stdTTL: 60 * 60 }); // 1 saat
const ytdlp = new YTDlpWrap(); // binary'i gerekirse indirir

app.get("/health", (_, res) => res.status(200).send("OK"));
app.get("/", (_, res) => res.type("text/plain").send("BarisHA M3U Maker ✅  /m3u ile liste verilir."));

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
        if (YT_DISABLE) continue;

        const ck = `yt:${url}`;
        streamUrl = cache.get(ck);
        if (!streamUrl) {
          try {
            // Önce HLS (m3u8), yoksa best
            const out = await ytdlp.execPromise([
              url, "-g", "-f", "best[protocol^=m3u8]/best"
            ]);
            streamUrl = String(out).trim().split(/\r?\n/)[0];
            if (!/^https?:\/\//i.test(streamUrl)) throw new Error("Geçersiz stream URL");
            cache.set(ck, streamUrl, 60 * 60);
          } catch (err) {
            console.error("[YT] yt-dlp error:", err?.message || err);
            continue; // YouTube'da problem varsa öğeyi atla, servis çökmesin
          }
        }
      } else {
        streamUrl = url; // mp4/m3u8 gibi direkt link
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
  if (!Array.isArray(arr)) throw new Error("Playlist JSON dizi değil.");
  return arr;
}

app.listen(PORT, () => console.log("M3U Maker running on", PORT));
