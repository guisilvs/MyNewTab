const ENGINES = {
  google: "https://www.google.com/",
  duckduckgo: "https://duckduckgo.com/",
  yahoo: "https://br.search.yahoo.com/",
  brave: "https://search.brave.com/"
};

chrome.storage.local.get({ engine: "google" }, (res) => {
  const target = ENGINES[res.engine] || ENGINES.google;
  window.location.replace(target);
});