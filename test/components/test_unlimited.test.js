import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import Unlimited from "@/components/common/Unlimited.vue";
import UnlimitedMeter from "@/components/common/UnlimitedMeter.vue";

describe("Unlimited", () => {
  it('is the symbol, named "No limit" for a mouse and for a screen reader', () => {
    const symbol = mount(Unlimited).get("span");

    expect(symbol.text()).toBe("∞");
    expect(symbol.attributes("title")).toBe("No limit");
    expect(symbol.attributes("role")).toBe("img");
    expect(symbol.attributes("aria-label")).toBe("No limit");
  });
});

describe("UnlimitedMeter", () => {
  it("is a hatched track that is not a bar, and is hidden from a screen reader", () => {
    const track = mount(UnlimitedMeter).get(".no-cap-track");

    expect(track.attributes("aria-hidden")).toBe("true");
  });
});
