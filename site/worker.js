// Serves wallofpsplus.com from the repository's files (Cloudflare Workers static assets).
// Its only job beyond that is sending www.wallofpsplus.com to wallofpsplus.com, so the site has one
// address and browsers keep one copy of people's saved data.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
