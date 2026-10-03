import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FrequencyPicker } from "./frequency-picker";

describe("FrequencyPicker", () => {
  it("renders with initial monthly value and updates count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FrequencyPicker value="month" onChange={onChange} />);

    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(1);

    await user.clear(input);
    await user.type(input, "2");

    expect(onChange).toHaveBeenCalledWith("2 months");
  });

  it("renders with custom weekly frequency", () => {
    const onChange = vi.fn();
    render(<FrequencyPicker value="2 weeks" onChange={onChange} />);

    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(2);
  });
});
