import { test, expect } from "@playwright/test";

const password = "Example-password-123!";

async function verificationLink(email: string) {
  let url = "";
  await expect
    .poll(async () => {
      const messages = (await (await fetch("http://127.0.0.1:8025")).json()) as {
        to: string;
        url: string;
      }[];
      url = messages.findLast((m) => m.to === email)?.url ?? "";
      return url;
    })
    .toBeTruthy();
  return url;
}

test("a guest signs up, verifies, signs in linked, and signs out to a fresh guest", async ({
  page,
}) => {
  const email = `guest-${Date.now()}@example.com`;
  await page.goto("/guest");
  const guestLine = page.getByText(/^Guest [a-z0-9]{20,}$/);
  await expect(guestLine).toBeVisible();
  const guestId = (await guestLine.textContent())!.slice("Guest ".length);

  await page.getByLabel("Guest sign-up email", { exact: true }).fill(email);
  await page.getByLabel("Guest sign-up password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText("Verification required")).toBeVisible();
  // Verification signs no one in: the visitor is still the same guest afterwards.
  await page.goto(await verificationLink(email));
  await page.goto("/guest");
  await expect(page.getByText(`Guest ${guestId}`, { exact: true })).toBeVisible();

  await page.getByLabel("Guest sign-in email", { exact: true }).fill(email);
  await page.getByLabel("Guest sign-in password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(`Linked ${guestId}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Account \S+$/)).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Guest again", { exact: true })).toBeVisible();
  await expect(guestLine).toBeVisible();
  await expect(page.getByText(`Guest ${guestId}`, { exact: true })).toHaveCount(0);
});
