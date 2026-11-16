import { expect, test, type Page } from "@playwright/test";

/**
 * Task 10.3 (Requirements 5.3 and 11.2): the Zero-Quota Path, end to end, in a real browser. `?demo=1&zero=1` gives
 * the fake API with every quota at zero and the world kill switch on, so a visitor can make nothing and still
 * finish the whole experience: Home, the Gallery, a preset ghost, Wander through three memories to the Ending, and
 * a case against two Bots to its ending. The fake answers every call, so the page must make no request to `/api/`.
 *
 * Not run here yet: it needs `@playwright/test` and a browser (docs/spikes/shell.md). The half of the task that runs
 * against `wrangler dev` waits for the real routes (shell task 3.3).
 */
const START = "/?demo=1&zero=1";

/** No Screen may need sideways scroll, which is what the 320 px project is for (Requirement 8.6). */
const noSideScroll = async (page: Page, where: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
};

/** The heading of the Screen has focus after a route change (Requirement 8.1). */
const headingFocused = async (page: Page, name: string) => {
  await expect(page.getByRole("heading", { level: 1, name })).toBeFocused();
};

test.beforeEach(async ({ page }) => {
  const api: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  (page as Page & { apiCalls?: string[] }).apiCalls = api;
});

test.afterEach(async ({ page }) => {
  // The fake answers everything: a request to the real API would be a request to a paid route's neighbour.
  expect((page as Page & { apiCalls?: string[] }).apiCalls).toEqual([]);
});

/** Home with the kill switch on, the Gallery, a place, and the Haunt screen ready for the choice. */
async function toHaunt(page: Page) {
  await page.goto(START);
  await expect(page.getByRole("heading", { level: 1, name: "Hauntology" })).toBeVisible();
  // Making a place is off, with its reason, and the Gallery is open.
  await expect(page.getByRole("button", { name: "Draw a place" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Upload a photo" })).toHaveAttribute("aria-disabled", "true");
  await noSideScroll(page, "Home");
  await page.getByRole("link", { name: "Visit a gallery place" }).click();
  await headingFocused(page, "Visit a place");
  await noSideScroll(page, "Gallery");
  await page.getByRole("button", { name: "Visit The attic room" }).click();
  await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
  await headingFocused(page, "Your place");
  await noSideScroll(page, "Haunt");
}

test("Wander: a preset ghost, three memories, the Ending", async ({ page }) => {
  await toHaunt(page);
  await page.getByRole("button", { name: "Use a preset ghost" }).click();
  await page.getByRole("button", { name: "Maren" }).click();
  await expect(page.getByText("Your ghost: Maren.")).toBeVisible();
  await page.getByRole("button", { name: "Wander" }).click();
  await headingFocused(page, "Wander");
  await page.getByRole("button", { name: "Go in" }).click();
  await expect(page.getByText("Stand-in view. The 3D Viewer is not built yet.")).toBeVisible();
  await noSideScroll(page, "Wander");

  for (const n of [1, 2, 3]) {
    const close = page.getByRole("button", { name: "Close chat" });
    if (await close.isVisible()) await close.click();
    await page.getByRole("button", { name: new RegExp(`(Walk to|Back to) memory ${n}`) }).click();
    await page.getByRole("button", { name: "Talk" }).click();
    await page.getByRole("button", { name: "Look" }).click();
    if (n < 3) await expect(page.locator(".transcript .ghost").last()).toBeVisible();
  }

  await expect(page.getByRole("heading", { name: "You remembered" })).toBeVisible();
  await headingFocused(page, "You remembered");
  await noSideScroll(page, "Ending");
  await expect(page.getByRole("button", { name: "Save memory card" })).toBeVisible();
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hauntology" })).toBeVisible();
});

test("Play a case: two Bots, to the ending", async ({ page }) => {
  await toHaunt(page);
  await page.getByRole("button", { name: "Play a case" }).click();
  await expect(page.getByRole("heading", { name: "Set up your case" })).toBeFocused();
  await expect(page.getByRole("radio", { name: /Classic/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: "2" })).toBeChecked();
  await noSideScroll(page, "Case setup");
  await page.getByRole("button", { name: "Start" }).click();
  await headingFocused(page, "Play a case");
  await expect(page.getByRole("button", { name: "Exit" })).toBeVisible();
  await noSideScroll(page, "Case");
  await page.getByRole("button", { name: "End the case" }).click();
  for (const name of ["Play again", "Home", "Gallery"]) await expect(page.getByRole("button", { name })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hauntology" })).toBeVisible();
});

test("a place that is not there is nothing here, and the way out works", async ({ page }) => {
  await page.goto("/play/not%20a%20place?demo=1&zero=1");
  await expect(page.getByRole("heading", { level: 1, name: "There is nothing here" })).toBeVisible();
  await noSideScroll(page, "NotFound");
  await page.getByRole("link", { name: "Gallery" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Visit a place" })).toBeVisible();
});
