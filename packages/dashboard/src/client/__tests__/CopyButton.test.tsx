import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";
import { afterEach, expect, mock, test } from "bun:test";
import { CopyButton } from "../components/CopyButton";

setupUITests();
const clipboardDescriptors = Object.fromEntries(
  Object.entries(Object.getOwnPropertyDescriptors(navigator)).filter(([key]) => key === "clipboard"),
);
afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  Object.defineProperties(navigator, clipboardDescriptors);
});

test("copies the full path and announces completion", async () => {
  const writeText = mock(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const path = "/home/person/configuration with spaces/a-very-long-file-name.conf";
  render(<CopyButton text={path} label="Copy path" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
  expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(path);
});

test("clipboard rejection gives a manual fallback and allows retry", async () => {
  const writeText = mock(async () => {}).mockRejectedValueOnce(new Error("Permission denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<CopyButton text="/path" label="Copy path" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
  expect(await screen.findByText("Clipboard unavailable. Select and copy the text instead.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
  expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
});

test("a browser without clipboard support still explains the fallback", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  render(<CopyButton text="/path" label="Copy path" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
  expect(await screen.findByText("Clipboard unavailable. Select and copy the text instead.")).toBeInTheDocument();
});
