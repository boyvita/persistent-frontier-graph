import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle(/Persistent Frontier Graph/);
});

test("opens with the controls and live visualization", async ({ page }) => {
  const generator = page.locator("#generator");
  const bounds = await generator.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("The generator or viewport is not measurable.");
  expect(bounds.y).toBeLessThan(viewport.height);
  await expect(page.getByLabel("Maximum branches")).toBeInViewport();
  await expect(page.getByRole("region", { name: "Persistent frontier cone projection" })).toBeInViewport();
  await expect(page.getByText("Keep the frontier", { exact: false })).toHaveCount(0);
});

test("generates a bounded tree and keeps both views synchronized", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const radial = page.getByRole("region", { name: "Synchronized radial tree" });
  const frontier = page.getByRole("slider", { name: "Visible frontier depth" });

  await page.evaluate(() => {
    const graph = document.querySelector(".pfg-graph");
    if (!graph) throw new Error("The graph is not mounted.");
    const mismatches: string[] = [];
    const readIds = (view: "cone" | "radial") => {
      const selector = view === "cone"
        ? '[data-pfg-view="cone"] [data-node-id][data-in-viewport="true"]'
        : '[data-pfg-view="radial"] [data-node-id][data-in-projection-window="true"]';
      return [...graph.querySelectorAll(selector)]
        .map((node) => node.getAttribute("data-node-id"))
        .sort()
        .join(",");
    };
    const compare = () => {
      const coneIds = readIds("cone");
      const radialIds = readIds("radial");
      if (coneIds !== radialIds) mismatches.push(`${coneIds} != ${radialIds}`);
    };
    const observer = new MutationObserver(compare);
    observer.observe(graph, {
      attributeFilter: ["data-in-viewport", "data-in-projection-window"],
      attributes: true,
      subtree: true,
    });
    (window as typeof window & {
      __pfgSyncProbe?: { mismatches: string[]; observer: MutationObserver };
    }).__pfgSyncProbe = { mismatches, observer };
    compare();
  });

  await frontier.fill("1");
  await expect(cone.locator("[data-node-id]")).toHaveCount(160);
  await expect(radial.locator("[data-node-id]")).toHaveCount(160);
  await expect.poll(async () => cone.locator("[data-node-id]").evaluateAll((nodes) => (
    nodes.filter((node) => Number.parseFloat(getComputedStyle(node).opacity) > 0).length
  ))).toBeGreaterThan(1);
  await expect(radial.locator("[data-pfg-projection-sector]")).toBeVisible();
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);

  const coneCanvas = cone.locator(".pfg-viewport__canvas");
  const canvasBounds = await coneCanvas.boundingBox();
  if (!canvasBounds) throw new Error("Cone canvas is not measurable.");
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height / 2);
  await page.mouse.wheel(0, -650);
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2 + 90,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);

  const currentViewport = page.viewportSize();
  if (!currentViewport) throw new Error("The browser viewport is unavailable.");
  await page.setViewportSize({
    height: currentViewport.height + 24,
    width: Math.max(340, currentViewport.width - 32),
  });
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);

  const synchronizationMismatches = await page.evaluate(() => {
    const probe = (window as typeof window & {
      __pfgSyncProbe?: { mismatches: string[]; observer: MutationObserver };
    }).__pfgSyncProbe;
    probe?.observer.disconnect();
    return probe?.mismatches ?? ["Synchronization probe was lost."];
  });
  expect(synchronizationMismatches).toEqual([]);

  await page.getByLabel("Maximum branches").fill("4");
  await page.getByLabel("Maximum depth").fill("5");
  await page.getByLabel("Number of nodes").fill("48");
  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("status", { name: "Graph status" })).toContainText("Generated 48 nodes");

  const maximum = Number(await frontier.getAttribute("max"));
  await frontier.fill(String(maximum));
  await expect(cone.locator("[data-node-id]")).toHaveCount(48);
  await expect(radial.locator("[data-node-id]")).toHaveCount(48);
});

test("regeneration cancels an active frontier replay atomically", async ({ page }) => {
  await page.getByRole("button", { name: "Replay pull" }).click();
  await page.getByLabel("Maximum branches").fill("4");
  await page.getByLabel("Maximum depth").fill("4");
  await page.getByLabel("Number of nodes").fill("40");
  await page.getByRole("button", { name: /Regenerate/ }).click();
  const frontier = page.getByRole("slider", { name: "Visible frontier depth" });
  await expect(frontier).toHaveValue("2.5");
  await expect(page.getByRole("button", { name: "Replay pull" })).toBeEnabled();
  await page.waitForTimeout(700);
  await expect(frontier).toHaveValue("2.5");
});

test("switches between uniform and random generation and preserves the last valid tree", async ({ page }) => {
  const distribution = page.getByLabel("Even distribution");
  await distribution.uncheck();
  await expect(distribution).not.toBeChecked();
  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("status", { name: "Graph status" })).toContainText("Generated 160 nodes");

  const before = await page.getByRole("region", { name: "Persistent frontier cone projection" })
    .locator("[data-node-id]").count();
  await page.getByLabel("Maximum branches").fill("1");
  await page.getByLabel("Maximum depth").fill("2");
  await page.getByLabel("Number of nodes").fill("100");
  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("alert")).toContainText("at most 3 nodes");
  expect(await page.getByRole("region", { name: "Persistent frontier cone projection" })
    .locator("[data-node-id]").count()).toBe(before);
});

test("supports keyboard camera and node controls", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const output = cone.getByLabel("cone zoom");
  const initial = await output.textContent();
  await cone.getByRole("button", { name: "Zoom in cone view" }).focus();
  await page.keyboard.press("Enter");
  await expect(output).not.toHaveText(initial ?? "");

  const navigator = page.getByLabel("Node navigator");
  await navigator.focus();
  await navigator.selectOption("node-0001");
  await expect(navigator).toHaveValue("node-0001");
  await expect(page.getByText("node-0001", { exact: true })).toBeVisible();

  const codeSample = page.getByLabel("Persistent Frontier Graph React example");
  await codeSample.focus();
  await expect(codeSample).toBeFocused();
});

test("selects a demo node exactly once through custom rendered content", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const target = cone.locator('[data-node-id="node-0001"] .demo-node strong');
  await target.dispatchEvent("click", { bubbles: true });
  await expect(page.getByLabel("Node navigator")).toHaveValue("node-0001");
});

test("meets the automated WCAG baseline", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
