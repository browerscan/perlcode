import { describe, expect, test } from "bun:test";
import { extractFirstPerlCodeBlockFromHtml } from "./html";

describe("extractFirstPerlCodeBlockFromHtml", () => {
  test("returns null when no perl block exists", () => {
    expect(extractFirstPerlCodeBlockFromHtml("<p>hi</p>")).toBeNull();
  });

  test("extracts and decodes a language-perl code block", () => {
    const html =
      '<p>x</p><pre><code class="language-perl">print &quot;hi\\n&quot;;</code></pre>';
    expect(extractFirstPerlCodeBlockFromHtml(html)).toBe('print "hi\\n";\n');
  });
});
