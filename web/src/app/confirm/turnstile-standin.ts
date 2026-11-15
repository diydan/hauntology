import type { LoadTurnstile, TurnstileApi } from "./turnstile";

/**
 * A stand-in for Turnstile, used only by `?demo=1` (a development build) so the demo can walk the
 * bot check without calling Cloudflare. It draws two buttons and gives the same answers the real widget
 * does: a token, or an error. Like `FakeApi`, it is loaded through the `import.meta.env.PROD` guard in
 * `demo.ts`, so a production build never carries it.
 */
export const DEMO_TURNSTILE_TOKEN = "demo-turnstile-token";

export const standinTurnstile: LoadTurnstile = async () => {
  let n = 0;
  const api: TurnstileApi = {
    render(container, options) {
      const id = `demo-widget-${++n}`;
      const box = document.createElement("div");
      box.dataset.standinTurnstile = id;
      const pass = document.createElement("button");
      pass.type = "button";
      pass.className = "ui-button";
      pass.textContent = "Pass the check (demo)";
      pass.addEventListener("click", () => options.callback(DEMO_TURNSTILE_TOKEN));
      const fail = document.createElement("button");
      fail.type = "button";
      fail.className = "ui-button";
      fail.textContent = "Fail the check (demo)";
      fail.addEventListener("click", () => options["error-callback"]?.());
      box.append(pass, " ", fail);
      container.append(box);
      return id;
    },
    remove(id) {
      document.querySelector(`[data-standin-turnstile="${id}"]`)?.remove();
    },
    reset() {},
  };
  return api;
};
