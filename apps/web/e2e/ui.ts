import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers for the kit's controls (ADR-0011). A Select is the native element,
 * so Playwright's `selectOption` drives it; a DateInput is a native date input
 * under `data-testid="date-<name>"` that takes an ISO value. Both keep the
 * signatures the specs were written against, so a change of control never
 * rewrites a test.
 */
export async function pickOption(
  page: Page,
  target: { label?: string | RegExp; testId?: string; locator?: Locator },
  option: { value?: string; label?: string | RegExp; index?: number },
): Promise<void> {
  const select = target.locator
    ? target.locator.locator("select").first()
    : target.testId
      ? page.getByTestId(target.testId).locator("select, [data-testid]").first()
      : page.getByRole("main").getByRole("combobox", {
          name: typeof target.label === "string" ? new RegExp(target.label, "i") : target.label,
        });
  await expect(select).toBeVisible();
  if (option.value !== undefined) {
    await select.selectOption({ value: option.value });
    return;
  }
  if (option.index !== undefined) {
    await select.selectOption({ index: option.index });
    return;
  }
  const label = option.label;
  if (typeof label === "string") {
    await select.selectOption({ label });
    return;
  }
  // a regular expression: find the first matching option's value and select it
  const options = select.locator("option");
  const n = await options.count();
  for (let i = 0; i < n; i++) {
    const text = (await options.nth(i).textContent()) ?? "";
    if (label && label.test(text)) {
      await select.selectOption({ index: i });
      return;
    }
  }
  throw new Error(`no option matching ${String(label)}`);
}

/** Set an ISO date (YYYY-MM-DD) on a DateInput. */
export async function fillDate(scope: Page | Locator, name: string, iso: string): Promise<void> {
  const input = scope.getByTestId(`date-${name}`);
  await expect(input).toBeVisible();
  await input.fill(iso.slice(0, 10));
  await expect(input).toHaveValue(iso.slice(0, 10));
}
