import { describe, it, expect, mock } from "bun:test";
import { html, render } from "../hyper";

describe("Form onSubmit event", () => {
  it("deve capturar evento onSubmit corretamente", () => {
    // Arrange
    const container = document.createElement("div");
    document.body.appendChild(container);

    const submitHandler = mock((e: Event) => {
      console.log("submitHandler chamado!");
      e.preventDefault();
    });

    // Act
    render(
      html`
        <form onSubmit=${submitHandler}>
          <button type="submit">Submit</button>
        </form>
      `,
      container
    );

    const form = container.querySelector("form")!;

    // Dispara o submit
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Assert
    expect(submitHandler).toHaveBeenCalledTimes(1);

    // Cleanup
    document.body.removeChild(container);
  });

  it("deve prevenir submit padrão", () => {
    // Arrange
    const container = document.createElement("div");
    document.body.appendChild(container);

    let defaultPrevented = false;
    const submitHandler = mock((e: Event) => {
      e.preventDefault();
      defaultPrevented = e.defaultPrevented;
    });

    // Act
    render(
      html`
        <form onSubmit=${submitHandler}>
          <button type="submit">Submit</button>
        </form>
      `,
      container
    );

    const form = container.querySelector("form")!;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Assert
    expect(submitHandler).toHaveBeenCalledTimes(1);
    expect(defaultPrevented).toBe(true);

    // Cleanup
    document.body.removeChild(container);
  });
});
