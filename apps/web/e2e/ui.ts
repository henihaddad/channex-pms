import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers for the kit's HeroUI controls. A Select is a button that opens a
 * listbox (options carry `data-key`); a DateInput is three typed segments
 * under `data-testid="date-<name>"`. Both retry once or twice so a click that
 * lands before hydration does not lose the interaction.
 */
export async function pickOption(
  page: Page,
  target: { label?: string | RegExp; testId?: string; locator?: Locator },
  option: { value?: string; label?: string | RegExp; index?: number },
): Promise<void> {
  const trigger = target.locator
    ? target.locator.getByRole("button").first()
    : target.testId
      ? page.getByTestId(target.testId).getByRole("button").first()
      : page.getByRole("button", {
          name: typeof target.label === "string" ? new RegExp(target.label, "i") : target.label,
        });
  const listbox = page.getByRole("listbox").last();
  for (let attempt = 0; attempt < 5; attempt++) {
    await trigger.click();
    if (await listbox.isVisible().catch(() => false)) break;
    await page.waitForTimeout(300);
    if (await listbox.isVisible().catch(() => false)) break;
  }
  await expect(listbox).toBeVisible();
  const item =
    option.value !== undefined
      ? listbox.locator(`[role="option"][data-key="${option.value}"]`)
      : option.index !== undefined
        ? listbox.getByRole("option").nth(option.index)
        : listbox.getByRole("option", { name: option.label });
  await item.click();
}

/** Type an ISO date (YYYY-MM-DD) into a DateInput's segments, whatever their locale order. */
export async function fillDate(scope: Page | Locator, name: string, iso: string): Promise<void> {
  const [y, m, d] = iso.split("-");
  const group = scope.getByTestId(`date-${name}`);
  const segments = group.getByRole("spinbutton");
  await expect(segments.first()).toBeVisible();
  const n = await segments.count();
  for (let i = 0; i < n; i++) {
    const seg = segments.nth(i);
    const type = await seg.getAttribute("data-type");
    const value = type === "month" ? m : type === "day" ? d : type === "year" ? y : null;
    if (!value) continue;
    for (let attempt = 0; attempt < 5; attempt++) {
      await seg.click();
      await seg.pressSequentially(value!);
      const text = (await seg.textContent()) ?? "";
      if (parseInt(text, 10) === parseInt(value!, 10)) break;
      await seg.page().waitForTimeout(250);
    }
    await expect
      .poll(async () => parseInt((await seg.textContent()) ?? "", 10))
      .toBe(parseInt(value!, 10));
  }
}
