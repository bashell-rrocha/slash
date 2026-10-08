import { describe, it, expect, mock } from "bun:test";
import { html, render } from "../hyper";

describe("Form onSubmit with component", () => {
  it("deve passar onSubmit como prop para componente", () => {
    // Arrange
    const container = document.createElement("div");
    document.body.appendChild(container);

    const submitHandler = mock((e: Event) => {
      console.log("submitHandler do componente pai chamado!");
      e.preventDefault();
    });

    function FormComponent({ onSubmit }: { onSubmit: (e: Event) => void }) {
      return html`
        <form onSubmit=${onSubmit}>
          <button type="submit">Submit</button>
        </form>
      `;
    }

    // Act
    render(
      html`<${FormComponent} onSubmit=${submitHandler} />`,
      container
    );

    const form = container.querySelector("form")!;
    expect(form).toBeDefined();

    // Dispara o submit
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Assert
    expect(submitHandler).toHaveBeenCalledTimes(1);

    // Cleanup
    document.body.removeChild(container);
  });

  it("deve chamar handler interno do componente", () => {
    // Arrange
    const container = document.createElement("div");
    document.body.appendChild(container);

    const outerHandler = mock((data: any) => {
      console.log("outerHandler chamado com:", data);
    });

    function FormComponent({ onSubmit }: { onSubmit: (data: any) => void }) {
      function handleSubmit(e: Event) {
        console.log("handleSubmit interno chamado!");
        e.preventDefault();
        onSubmit({ test: "data" });
      }

      return html`
        <form onSubmit=${handleSubmit}>
          <button type="submit">Submit</button>
        </form>
      `;
    }

    // Act
    render(
      html`<${FormComponent} onSubmit=${outerHandler} />`,
      container
    );

    const form = container.querySelector("form")!;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    // Assert
    expect(outerHandler).toHaveBeenCalledTimes(1);
    expect(outerHandler).toHaveBeenCalledWith({ test: "data" });

    // Cleanup
    document.body.removeChild(container);
  });
});
