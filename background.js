// Liga/desliga as regras de headers (que permitem o iframe da Nimo dentro da Twitch)
// conforme o interruptor "enabled" do popup.
async function applyRules() {
  const { enabled } = await chrome.storage.local.get("enabled");
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled
      ? { enableRulesetIds: ["frames"] }
      : { disableRulesetIds: ["frames"] }
  );
}

chrome.runtime.onInstalled.addListener(applyRules);
chrome.runtime.onStartup.addListener(applyRules);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) applyRules();
});
