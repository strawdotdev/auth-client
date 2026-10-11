import { test, expect, type Browser, type Page } from "@playwright/test";

// Two origins under one domain share the example's session cookie, as an organization's apps do.
const one = "http://one.auth.test:8099";
const two = "http://two.auth.test:8099";
const password = "Example-password-123!";

/** A verified account, made in a browser of its own so the tested one starts signed out. */
async function createAccount(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(one);
  await page.getByLabel("Sign-up email", { exact: true }).fill(email);
  await page.getByLabel("Sign-up password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  let url = "";
  await expect
    .poll(async () => {
      const messages = (await (await fetch("http://127.0.0.1:8025")).json()) as {
        to: string;
        url: string;
      }[];
      url = messages.findLast((message) => message.to === email)?.url ?? "";
      return url;
    })
    .toBeTruthy();
  await page.goto(url);
  await context.close();
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The account a tab acts as: the signed-in email the example shows first. */
const thisTab = (page: Page, email: string) =>
  page.getByText(`${email} (this tab)`, { exact: true });

async function createOrganization(page: Page, name: string) {
  await page.getByLabel("Organization name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

test("one session across origins, each tab acting as its own account", async ({
  browser,
  page,
}) => {
  const suffix = Date.now();
  const alice = `alice-${suffix}@example.com`;
  const bob = `bob-${suffix}@example.com`;
  await createAccount(browser, alice);
  await createAccount(browser, bob);

  // Signing in on one origin signs the other in.
  await page.goto(one);
  await signIn(page, alice);
  await expect(thisTab(page, alice)).toBeVisible();
  await createOrganization(page, `Alice ${suffix}`);
  const second = await page.context().newPage();
  await second.goto(two);
  await expect(thisTab(second, alice)).toBeVisible();

  // Adding an account in the second tab makes that tab the new account; the first stays.
  await second.getByRole("button", { name: "Add account", exact: true }).click();
  await signIn(second, bob);
  await expect(thisTab(second, bob)).toBeVisible();
  await createOrganization(second, `Bob ${suffix}`);
  await page.bringToFront();
  await page.reload();
  await expect(thisTab(page, alice)).toBeVisible();
  // Each tab reads its own account's data (Better Auth and Convex alike).
  await expect(page.getByRole("button", { name: `Bob ${suffix}`, exact: true })).toHaveCount(0);
  await expect(second.getByRole("button", { name: `Alice ${suffix}`, exact: true })).toHaveCount(0);
  // Every tab lists the device's accounts with their organizations and role.
  for (const tab of [page, second]) {
    await expect(tab.getByLabel(`Account ${alice}`)).toContainText(`Alice ${suffix}: owner`);
    await expect(tab.getByLabel(`Account ${bob}`)).toContainText(`Bob ${suffix}: owner`);
  }
  // A new tab takes the device's latest account.
  const third = await page.context().newPage();
  await third.goto(one);
  await expect(thisTab(third, bob)).toBeVisible();
});

test("switching and signing out move only the tabs they concern", async ({ browser, page }) => {
  const suffix = Date.now();
  const alice = `alice-switch-${suffix}@example.com`;
  const bob = `bob-switch-${suffix}@example.com`;
  await createAccount(browser, alice);
  await createAccount(browser, bob);
  await page.goto(one);
  await signIn(page, alice);
  await expect(thisTab(page, alice)).toBeVisible();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await signIn(page, bob);
  await expect(thisTab(page, bob)).toBeVisible();
  const second = await page.context().newPage();
  await second.goto(two);
  await expect(thisTab(second, bob)).toBeVisible();

  // Switching is the tab's alone.
  await page.getByRole("button", { name: `Switch to ${alice}`, exact: true }).click();
  await expect(thisTab(page, alice)).toBeVisible();
  await second.reload();
  await expect(thisTab(second, bob)).toBeVisible();

  // Signing bob out from the first tab moves the second, which acted as bob, on to alice in one
  // read: it never shows the sign-in form on the way.
  await page.getByRole("button", { name: `Sign out ${bob}`, exact: true }).click();
  await expect(page.getByLabel(`Account ${bob}`)).toHaveCount(0);
  await expect(thisTab(page, alice)).toBeVisible();
  let sawSignIn = false;
  await second.reload();
  await expect
    .poll(async () => {
      if (await second.getByRole("button", { name: "Sign in", exact: true }).isVisible())
        sawSignIn = true;
      return thisTab(second, alice).isVisible();
    })
    .toBe(true);
  expect(sawSignIn).toBe(false);

  // Signing out of every account leaves every tab signed out.
  await second.getByRole("button", { name: "Sign out of all accounts", exact: true }).click();
  await expect(second.getByLabel("Email", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
