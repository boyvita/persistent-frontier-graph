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
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const radial = page.getByRole("region", { name: "Synchronized radial tree" });
  await expect(cone).toBeInViewport();
  const coneBounds = await cone.boundingBox();
  const radialBounds = await radial.boundingBox();
  if (!coneBounds || !radialBounds) throw new Error("Graph projections are not measurable.");
  expect(Math.abs(coneBounds.width - radialBounds.width)).toBeLessThanOrEqual(2);
  await cone.getByRole("button", { name: "Zoom in cone view" }).click();
  const zoomedConeBounds = await cone.boundingBox();
  const zoomedRadialBounds = await radial.boundingBox();
  if (!zoomedConeBounds || !zoomedRadialBounds) throw new Error("Zoomed projections are not measurable.");
  expect(Math.abs(zoomedConeBounds.width - zoomedRadialBounds.width)).toBeLessThanOrEqual(2);
  await expect(page.getByLabel("Maximum branches")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Maximum depth")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Number of nodes")).toHaveAttribute("type", "range");
  await expect(page.getByLabel("Number of nodes")).toHaveAttribute("max", "1000");
  await expect(page.getByLabel("Balance tree")).toBeChecked();
  await expect(page.getByText("Keep the frontier", { exact: false })).toHaveCount(0);
});

test("zooms the projection wheel without scrolling the page", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const canvas = cone.locator(".pfg-viewport__canvas");
  const zoom = cone.getByLabel("cone zoom");
  await canvas.scrollIntoViewIfNeeded();
  const initialZoom = await zoom.textContent();
  const bounds = await canvas.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Cone canvas is not measurable.");
  const visibleLeft = Math.max(bounds.x, 0);
  const visibleRight = Math.min(bounds.x + bounds.width, viewport.width);
  const visibleTop = Math.max(bounds.y, 0);
  const visibleBottom = Math.min(bounds.y + bounds.height, viewport.height);
  if (visibleLeft >= visibleRight || visibleTop >= visibleBottom) throw new Error("Cone canvas is outside the viewport.");
  await page.mouse.move((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2);
  const initialScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -500);
  await expect(zoom).not.toHaveText(initialZoom ?? "");
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);
});

test("keeps the directly grabbed card anchored through one wheel session", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const canvas = cone.locator(".pfg-viewport__canvas");
  await canvas.scrollIntoViewIfNeeded();
  const card = cone.locator('[data-depth="7"][data-in-viewport="true"]').first();
  const before = await card.boundingBox();
  if (!before) throw new Error("The wheel anchor card is not measurable.");
  const anchorX = before.x + before.width / 2;
  const anchorY = before.y + before.height / 2;
  const beforeZoom = await cone.getByLabel("cone zoom").textContent();
  await card.evaluate((node, anchor) => {
    node.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: anchor.x,
      clientY: anchor.y,
      deltaY: -220,
    }));
    node.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: anchor.x,
      clientY: anchor.y + 40,
      deltaY: -220,
    }));
  }, { x: anchorX, y: anchorY });
  await expect(cone.getByLabel("cone zoom")).not.toHaveText(beforeZoom ?? "");
  const after = await card.boundingBox();
  if (!after) throw new Error("The wheel anchor card disappeared.");
  expect(Math.abs(after.y + after.height / 2 - anchorY)).toBeLessThanOrEqual(5);
});

test("generates a bounded tree and keeps both views synchronized", async ({ page }) => {
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const radial = page.getByRole("region", { name: "Synchronized radial tree" });
  const graph = page.locator(".pfg-graph");
  await expect(graph).toHaveAttribute("data-frontier-mode", "auto");
  await expect(page.getByRole("slider", { name: "Visible frontier depth" })).toHaveCount(0);

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

  await expect(cone.locator("[data-node-id]")).toHaveCount(160);
  await expect(radial.locator("[data-node-id]")).toHaveCount(160);
  expect(await cone.locator("[data-node-id]").evaluateAll((nodes) => (
    nodes.every((node) => Number.parseFloat(getComputedStyle(node).opacity) > 0)
  ))).toBe(true);
  await expect(radial.locator("[data-pfg-projection-sector]")).toBeVisible();
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);

  const coneCanvas = cone.locator(".pfg-viewport__canvas");
  await coneCanvas.scrollIntoViewIfNeeded();
  const canvasBounds = await coneCanvas.boundingBox();
  if (!canvasBounds) throw new Error("Cone canvas is not measurable.");
  const initialFrontier = Number(await graph.getAttribute("data-frontier"));
  await page.mouse.move(canvasBounds.x + 60, canvasBounds.y + canvasBounds.height / 2);
  await page.mouse.wheel(0, -3_000);
  await expect.poll(async () => Number(await graph.getAttribute("data-frontier"))).not.toBe(initialFrontier);
  await expect.poll(async () => {
    const coneIds = await cone.locator('[data-node-id][data-in-viewport="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    const radialIds = await radial.locator('[data-node-id][data-in-projection-window="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).sort());
    return JSON.stringify(radialIds) === JSON.stringify(coneIds);
  }).toBe(true);
  const directGrabId = await cone.locator('[data-node-id][data-in-viewport="true"]').evaluateAll((nodes) => {
    const canvas = nodes[0]?.closest(".pfg-viewport__canvas")?.getBoundingClientRect();
    if (!canvas) return null;
    const horizontalMargin = Math.min(100, canvas.width * 0.2);
    const verticalMargin = Math.min(50, canvas.height * 0.15);
    const target = nodes.find((node) => {
      const box = node.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      return centerX > canvas.left + horizontalMargin && centerX < canvas.right - horizontalMargin
        && centerY > canvas.top + verticalMargin && centerY < canvas.bottom - verticalMargin;
    });
    return (target as HTMLElement | undefined)?.dataset.nodeId ?? null;
  });
  if (!directGrabId) throw new Error("No directly grabbable cone card is fully inside the canvas.");
  const directGrab = cone.locator(`[data-node-id="${directGrabId}"]`);
  const grabBounds = await directGrab.boundingBox();
  if (!grabBounds) throw new Error("A visible cone card is not measurable.");
  const selectedBeforeDrag = await page.getByLabel("Node navigator").inputValue();
  const offsetBeforeDrag = Number(await graph.getAttribute("data-radial-offset"));
  await page.mouse.move(grabBounds.x + grabBounds.width / 2, grabBounds.y + grabBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grabBounds.x + grabBounds.width / 2 - 80,
    grabBounds.y + grabBounds.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(async () => Number(await graph.getAttribute("data-radial-offset"))).toBeGreaterThan(offsetBeforeDrag);
  await expect(page.getByLabel("Node navigator")).toHaveValue(selectedBeforeDrag);
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

  await expect(cone.locator("[data-node-id]")).toHaveCount(48);
  await expect(radial.locator("[data-node-id]")).toHaveCount(48);
  await expect(graph).toHaveAttribute("data-frontier-mode", "auto");

  await page.getByLabel("Number of nodes").fill("1000");
  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("status", { name: "Graph status" })).toContainText("Generated 1000 nodes");
  await expect(cone.locator("[data-node-id]")).toHaveCount(1000);
  await expect(radial.locator("[data-node-id]")).toHaveCount(1000);
});

test("regeneration resets the automatic projection camera atomically", async ({ page }) => {
  const graph = page.locator(".pfg-graph");
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const canvas = cone.locator(".pfg-viewport__canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Cone canvas is not measurable.");
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -900);
  await expect.poll(async () => Number(await graph.getAttribute("data-radial-offset"))).toBeGreaterThan(0);
  await page.getByLabel("Maximum branches").fill("4");
  await page.getByLabel("Maximum depth").fill("4");
  await page.getByLabel("Number of nodes").fill("40");
  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(graph).toHaveAttribute("data-radial-offset", "0.000");
  await expect(graph).toHaveAttribute("data-frontier-mode", "auto");
  await expect(cone.locator("[data-node-id]")).toHaveCount(40);
});

test("clamps direct projection dragging at zoom-independent terminal bounds", async ({ page }) => {
  const graph = page.locator(".pfg-graph");
  const cone = page.getByRole("region", { name: "Persistent frontier cone projection" });
  const canvas = cone.locator(".pfg-viewport__canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Cone canvas is not measurable.");

  const startX = bounds.x + bounds.width * 0.75;
  const startY = bounds.y + bounds.height / 2;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 8, startY, { steps: 4 });
    await page.mouse.up();
  }

  const maximum = Number(await graph.getAttribute("data-maximum-radial-offset"));
  await expect.poll(async () => Number(await graph.getAttribute("data-radial-offset"))).toBeCloseTo(maximum, 2);
  const fitZoom = await cone.getByLabel("cone zoom").textContent();
  await cone.getByRole("button", { name: "Zoom out cone view" }).click();
  await expect(cone.getByLabel("cone zoom")).toHaveText(fitZoom ?? "");
  await expect.poll(async () => Number(await graph.getAttribute("data-radial-offset"))).toBeCloseTo(maximum, 2);

  const currentBounds = await canvas.boundingBox();
  if (!currentBounds) throw new Error("Cone canvas is not measurable after zoom.");
  const terminalX = currentBounds.x + currentBounds.width * 0.25;
  const terminalY = currentBounds.y + currentBounds.height / 2;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    await page.mouse.move(terminalX, terminalY);
    await page.mouse.down();
    await page.mouse.move(currentBounds.x + currentBounds.width - 8, terminalY, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => Number(await graph.getAttribute("data-radial-offset"))).toBe(0);
});

test("switches between uniform and random generation and preserves the last valid tree", async ({ page }) => {
  const distribution = page.getByLabel("Balance tree");
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
