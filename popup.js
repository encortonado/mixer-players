// ---- Funções puras (sem DOM) ----
const PLATFORMS = {
  twitchChannel: { host: "twitch.tv", name: "Twitch" },
  kickChannel: { host: "kick.com", name: "Kick" },
  nimoChannel: { host: "nimo.tv", name: "Nimo" }
};
const FIELDS = Object.keys(PLATFORMS);

// Segmentos que vêm ANTES do nome do canal (ex.: twitch.tv/popout/canal/chat, nimo.tv/live/123).
const WRAPPERS = new Set(["popout", "embed", "live", "moderator"]);
// Páginas que não são um canal.
const RESERVED = new Set([
  "directory", "videos", "video", "clips", "clip", "categories", "category", "browse",
  "following", "search", "settings", "dashboard", "downloads", "download", "subscriptions",
  "inventory", "wallet", "drops", "friends", "messages", "turbo", "jobs", "store",
  "lives", "games", "game", "login", "signup"
]);

const clean = (s) => s.trim().replace(/^@/, "");
const same = (a, b) => (a || "").toLowerCase() === (b || "").toLowerCase();
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// Aceita só o nome ("meucanal", "@meucanal") ou um link completo/parcial
// ("https://www.twitch.tv/meucanal?x=1", "kick.com/meucanal", ".../popout/meucanal/chat").
// Devolve "" se não achar um canal.
function parseChannel(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/[\/.:]/.test(s)) {
    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : "https://" + s);
    } catch {
      return "";
    }
    let parts = url.pathname.split("/").filter(Boolean).map(safeDecode);
    if (parts.length > 1 && WRAPPERS.has(parts[0].toLowerCase())) parts = parts.slice(1);
    const name = parts[0] || "";
    return RESERVED.has(name.toLowerCase()) ? "" : clean(name);
  }
  return clean(s);
}

function platformOfUrl(urlStr) {
  try {
    const h = new URL(urlStr).hostname;
    return FIELDS.find((f) => h === PLATFORMS[f].host || h.endsWith("." + PLATFORMS[f].host)) || null;
  } catch {
    return null;
  }
}

// ---- UI ----
const $ = (id) => document.getElementById(id);
let detected = {};

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.style.color = isError ? "#ff8a8a" : "#7dffc0";
}

// O popup do Chrome fecha ao trocar de aba. Por isso tudo que é digitado vai para um
// rascunho na hora; ele só vira configuração real quando você clica em Salvar.
function saveDraft() {
  const draft = { enabled: $("enabled").checked };
  FIELDS.forEach((f) => (draft[f] = $(f).value));
  chrome.storage.local.set({ draft });
}

function normalizeField(f) {
  const parsed = parseChannel($(f).value);
  if (parsed) $(f).value = parsed;
}

function renderChips(f) {
  const box = $("sugg-" + f);
  box.textContent = "";
  const current = parseChannel($(f).value);
  const list = (detected[f] || []).filter((c) => !same(c, current));
  if (!list.length) return;
  box.append("Nas abas abertas: ");
  list.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = c;
    b.title = "Usar este canal";
    b.addEventListener("click", () => {
      $(f).value = c;
      onEdit();
    });
    box.appendChild(b);
  });
}

function onEdit() {
  saveDraft();
  FIELDS.forEach(renderChips);
}

// Procura canais nas abas abertas da Twitch, Kick e Nimo (a mais recente primeiro).
async function detectTabs() {
  const found = Object.fromEntries(FIELDS.map((f) => [f, []]));
  let current = null;
  try {
    const patterns = FIELDS.map((f) => `https://*.${PLATFORMS[f].host}/*`);
    const tabs = await chrome.tabs.query({ url: patterns });
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    for (const tab of tabs) {
      const f = platformOfUrl(tab.url);
      const ch = f ? parseChannel(tab.url) : "";
      if (ch && found[f].length < 3 && !found[f].some((x) => same(x, ch))) found[f].push(ch);
    }

    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const f = active ? platformOfUrl(active.url || "") : null;
    const ch = f ? parseChannel(active.url) : "";
    if (ch) {
      current = { field: f, channel: ch };
      found[f] = [ch, ...found[f].filter((x) => !same(x, ch))].slice(0, 3);
    }
  } catch {
    // sem abas ou sem acesso: segue sem sugestões
  }
  return { found, current };
}

async function init() {
  const stored = await chrome.storage.local.get(["enabled", "draft", ...FIELDS]);
  const src = stored.draft || stored;
  $("enabled").checked = !!src.enabled;
  FIELDS.forEach((f) => ($(f).value = src[f] || ""));

  const dirty =
    !!stored.draft &&
    (!!stored.enabled !== !!src.enabled || FIELDS.some((f) => (stored[f] || "") !== (src[f] || "")));
  if (dirty) setStatus("Rascunho recuperado. Clique em Salvar para aplicar.");

  const { found, current } = await detectTabs();
  detected = found;

  // Se você está numa aba da Twitch/Kick/Nimo e o campo dela está vazio, preenche sozinho.
  if (current && !$(current.field).value.trim()) {
    $(current.field).value = current.channel;
    saveDraft();
    setStatus(`Canal da ${PLATFORMS[current.field].name} preenchido a partir desta aba.`);
  }
  FIELDS.forEach(renderChips);
}

FIELDS.forEach((f) => {
  const el = $(f);
  el.addEventListener("input", onEdit);
  // Ao colar um link, troca na hora pelo nome do canal.
  el.addEventListener("paste", () => setTimeout(() => { normalizeField(f); onEdit(); }, 0));
  el.addEventListener("change", () => { normalizeField(f); onEdit(); });
});
$("enabled").addEventListener("change", saveDraft);

$("save").addEventListener("click", async () => {
  const data = { enabled: $("enabled").checked };
  const bad = [];
  FIELDS.forEach((f) => {
    const raw = $(f).value.trim();
    const parsed = parseChannel(raw);
    if (raw && !parsed) bad.push(PLATFORMS[f].name);
    data[f] = parsed;
  });
  if (bad.length) {
    setStatus(`Não achei o canal no que está em: ${bad.join(", ")}.`, true);
    return;
  }

  FIELDS.forEach((f) => ($(f).value = data[f]));
  await chrome.storage.local.set(data);
  await chrome.storage.local.remove("draft");

  // Recarrega a aba ativa se for da Twitch ou da Kick, para as regras de header valerem.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && /twitch\.tv|kick\.com/.test(tab.url)) chrome.tabs.reload(tab.id);

  FIELDS.forEach(renderChips);
  setStatus("Salvo.");
});

init();
