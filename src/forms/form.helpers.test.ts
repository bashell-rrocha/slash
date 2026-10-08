// packages/slash/src/forms/form.helpers.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';
import { createState } from '../state';
import type { Reactive } from '../types';
import {
  textFieldControl,
  checkboxControl,
  radioControl,
  SelectControl,
  delegate,
  formToObject,
  onSubmit,
  getText,
  getChecked,
  getSelectValue,
  onReset,
  onButtonClick,
} from './form.helpers';
import type { TextFieldEvent, CheckboxEvent, RadioEvent, SelectEvent } from './form.types';

describe('form.helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('textFieldControl()', () => {
    test('should bind signal to input value', () => {
      // Arrange
      const value = createState({ value: 'hello' });
      const input = document.createElement('input');
      document.body.appendChild(input);

      // Act
      const props = textFieldControl(value);
      input.value = (props.value as Reactive<string>).get();

      // Assert
      expect(input.value).toBe('hello');
    });

    test('should update signal on input event (mode="input")', () => {
      // Arrange
      const value = createState({ value: '' });
      const input = document.createElement('input');
      document.body.appendChild(input);
      const props = textFieldControl(value, 'input');

      // Act
      input.value = 'test';
      const event = new InputEvent('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: input, writable: false });
      (props.onInput as Function)(event);

      // Assert
      expect(value.get().value).toBe('test');
    });

    test('should update signal on change event (mode="change")', () => {
      // Arrange
      const value = createState({ value: '' });
      const input = document.createElement('input');
      document.body.appendChild(input);
      const props = textFieldControl(value, 'change');

      // Act
      input.value = 'changed';
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: input, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(value.get().value).toBe('changed');
    });

    test('should handle both input and change events (mode="both")', () => {
      // Arrange
      const value = createState({ value: '' });
      const input = document.createElement('input');
      document.body.appendChild(input);
      const props = textFieldControl(value, 'both');

      // Act - input event
      input.value = 'input1';
      const inputEvent = new InputEvent('input', { bubbles: true });
      Object.defineProperty(inputEvent, 'target', { value: input, writable: false });
      (props.onInput as Function)(inputEvent);

      // Assert
      expect(value.get().value).toBe('input1');

      // Act - change event
      input.value = 'changed1';
      const changeEvent = new Event('change', { bubbles: true });
      Object.defineProperty(changeEvent, 'target', { value: input, writable: false });
      (props.onChange as Function)(changeEvent);

      // Assert
      expect(value.get().value).toBe('changed1');
    });

    test('should work with textarea', () => {
      // Arrange
      const value = createState({ value: '' });
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      const props = textFieldControl(value);

      // Act
      textarea.value = 'multiline\ntext';
      const event = new InputEvent('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: textarea, writable: false });
      (props.onInput as Function)(event);

      // Assert
      expect(value.get().value).toBe('multiline\ntext');
    });
  });

  describe('checkboxControl()', () => {
    test('should bind signal to checkbox checked state', () => {
      // Arrange
      const checked = createState({ value: true });
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.appendChild(checkbox);

      // Act
      const props = checkboxControl(checked);
      checkbox.checked = (props.checked as Reactive<boolean>).get();

      // Assert
      expect(checkbox.checked).toBe(true);
    });

    test('should update signal when checkbox is toggled', () => {
      // Arrange
      const checked = createState({ value: false });
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.appendChild(checkbox);
      const props = checkboxControl(checked);

      // Act
      checkbox.checked = true;
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: checkbox, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(checked.get().value).toBe(true);
    });

    test('should handle unchecking', () => {
      // Arrange
      const checked = createState({ value: true });
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.appendChild(checkbox);
      const props = checkboxControl(checked);

      // Act
      checkbox.checked = false;
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: checkbox, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(checked.get().value).toBe(false);
    });
  });

  describe('radioControl()', () => {
    test('should bind signal to radio group value', () => {
      // Arrange
      const selected = createState({ value: 'option1' });

      // Act
      const props1 = radioControl(selected, 'option1');
      const props2 = radioControl(selected, 'option2');

      // Assert
      expect((props1.checked as any).get()).toBe(true);
      expect((props2.checked as any).get()).toBe(false);
    });

    test('should update signal when radio is selected', () => {
      // Arrange
      const selected = createState({ value: 'option1' });
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.value = 'option2';
      document.body.appendChild(radio);
      const props = radioControl(selected, 'option2');

      // Act
      radio.checked = true;
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: radio, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(selected.get().value).toBe('option2');
    });

    test('should not update signal if radio is unchecked', () => {
      // Arrange
      const selected = createState({ value: 'option1' });
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.value = 'option2';
      document.body.appendChild(radio);
      const props = radioControl(selected, 'option2');

      // Act
      radio.checked = false;
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: radio, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(selected.get().value).toBe('option1'); // não muda
    });

    test('should include value property', () => {
      // Arrange
      const selected = createState({ value: '' });

      // Act
      const props = radioControl(selected, 'myValue');

      // Assert
      expect(props.value).toBe('myValue');
    });

    test('should have computed checked signal', () => {
      // Arrange
      const selected = createState({ value: 'option1' });
      const props = radioControl(selected, 'option2');

      // Assert - verifica que checked é readonly (computed)
      expect((props.checked as any).get()).toBe(false);
      expect(typeof (props.checked as any).set).toBe('undefined');
    });

    test('should reactive checked signal subscribe to state changes', () => {
      // Arrange
      const selected = createState({ value: 'option1' });
      const props = radioControl(selected, 'option2');
      let checkedValue: boolean | undefined;

      // Act - Subscribe to checked changes
      const unsubscribe = (props.checked as any).subscribe((checked: boolean) => {
        checkedValue = checked;
      });

      selected.set({ value: 'option2' });

      // Assert
      expect(checkedValue).toBe(true);

      // Cleanup
      unsubscribe();
    });
  });

  describe('SelectControl()', () => {
    test('should bind signal to select value', () => {
      // Arrange
      const value = createState({ value: 'option1' });
      const select = document.createElement('select');
      select.innerHTML = '<option value="option1">One</option><option value="option2">Two</option>';
      document.body.appendChild(select);

      // Act
      const props = SelectControl(value);
      select.value = (props.value as Reactive<string>).get();

      // Assert
      expect(select.value).toBe('option1');
    });

    test('should update signal on change event', () => {
      // Arrange
      const value = createState({ value: 'option1' });
      const select = document.createElement('select');
      select.innerHTML = '<option value="option1">One</option><option value="option2">Two</option>';
      document.body.appendChild(select);
      const props = SelectControl(value);

      // Act
      select.value = 'option2';
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: select, writable: false });
      (props.onChange as Function)(event);

      // Assert
      expect(value.get().value).toBe('option2');
    });

    test('should update signal on input event', () => {
      // Arrange
      const value = createState({ value: 'option1' });
      const select = document.createElement('select');
      select.innerHTML = '<option value="option1">One</option><option value="option2">Two</option>';
      document.body.appendChild(select);
      const props = SelectControl(value);

      // Act
      select.value = 'option2';
      const event = new InputEvent('input', { bubbles: true });
      Object.defineProperty(event, 'target', { value: select, writable: false });
      (props.onInput as Function)(event);

      // Assert
      expect(value.get().value).toBe('option2');
    });
  });

  describe('getText()', () => {
    test('should extract value from input event', () => {
      // Arrange
      const input = document.createElement('input');
      input.value = 'test value';
      const event = { target: input } as TextFieldEvent;

      // Act
      const result = getText(event);

      // Assert
      expect(result).toBe('test value');
    });

    test('should work with textarea', () => {
      // Arrange
      const textarea = document.createElement('textarea');
      textarea.value = 'textarea content';
      const event = { target: textarea } as TextFieldEvent;

      // Act
      const result = getText(event);

      // Assert
      expect(result).toBe('textarea content');
    });
  });

  describe('getChecked()', () => {
    test('should extract checked state from checkbox event', () => {
      // Arrange
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      const event = { target: checkbox } as CheckboxEvent;

      // Act
      const result = getChecked(event);

      // Assert
      expect(result).toBe(true);
    });

    test('should work with radio button', () => {
      // Arrange
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.checked = false;
      const event = { target: radio } as RadioEvent;

      // Act
      const result = getChecked(event);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getSelectValue()', () => {
    test('should extract value from select event', () => {
      // Arrange
      const select = document.createElement('select');
      select.innerHTML = '<option value="a">A</option><option value="b" selected>B</option>';
      const event = { target: select } as SelectEvent;

      // Act
      const result = getSelectValue(event);

      // Assert
      expect(result).toBe('b');
    });
  });

  describe('delegate()', () => {
    test('should return cleanup function', () => {
      // Arrange
      const container = document.createElement('div');
      document.body.appendChild(container);

      // Act
      const off = delegate(container, 'click', '.btn', () => {});

      // Assert
      expect(typeof off).toBe('function');

      // Cleanup
      off();
    });

    test('should attach listener to root element', () => {
      // Arrange
      const container = document.createElement('div');
      container.innerHTML = '<button class="btn">Click</button>';
      document.body.appendChild(container);
      let listenerAdded = false;

      // Act
      const originalAddEventListener = container.addEventListener;
      container.addEventListener = function(...args: Parameters<typeof originalAddEventListener>) {
        listenerAdded = true;
        return originalAddEventListener.apply(this, args);
      };

      const off = delegate(container, 'click', '.btn', () => {});

      // Assert
      expect(listenerAdded).toBe(true);

      // Cleanup
      off();
    });

    test('should delegate events to matching children', () => {
      // Arrange
      const container = document.createElement('div');
      container.innerHTML = '<button class="btn">Click</button>';
      document.body.appendChild(container);
      let handlerCalled = false;

      // Act
      const off = delegate(container, 'click', '.btn', () => {
        handlerCalled = true;
      });

      const button = container.querySelector('.btn') as HTMLElement;
      const event = new MouseEvent('click', { bubbles: true });
      button.dispatchEvent(event);

      // Assert
      expect(handlerCalled).toBe(true);

      // Cleanup
      off();
    });

    test('should not call handler when event target is null', () => {
      // Arrange
      const container = document.createElement('div');
      document.body.appendChild(container);
      let handlerCalled = false;

      // Act
      const off = delegate(container, 'click', '.btn', () => {
        handlerCalled = true;
      });

      // Disparar evento sem target
      const event = new Event('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: null, writable: false });
      container.dispatchEvent(event);

      // Assert
      expect(handlerCalled).toBe(false);

      // Cleanup
      off();
    });

    test('should not call handler when target does not match selector', () => {
      // Arrange
      const container = document.createElement('div');
      container.innerHTML = '<span class="text">Not a button</span>';
      document.body.appendChild(container);
      let handlerCalled = false;

      // Act
      const off = delegate(container, 'click', '.btn', () => {
        handlerCalled = true;
      });

      const span = container.querySelector('.text') as HTMLElement;
      span.click();

      // Assert
      expect(handlerCalled).toBe(false);

      // Cleanup
      off();
    });

    test('should not call handler when target is not contained in root', () => {
      // Arrange
      const container = document.createElement('div');
      const outsideButton = document.createElement('button');
      outsideButton.className = 'btn';
      document.body.appendChild(container);
      document.body.appendChild(outsideButton);
      let handlerCalled = false;

      // Act
      const off = delegate(container, 'click', '.btn', () => {
        handlerCalled = true;
      });

      outsideButton.click();

      // Assert
      expect(handlerCalled).toBe(false);

      // Cleanup
      off();
      outsideButton.remove();
    });
  });

  describe('formToObject()', () => {
    test('should convert form to object with single values', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input name="username" value="john" />
        <input name="email" value="john@example.com" />
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        username: 'john',
        email: 'john@example.com',
      });
    });

    test('should handle duplicate field names as arrays', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input name="tags" value="javascript" />
        <input name="tags" value="typescript" />
        <input name="tags" value="bun" />
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        tags: ['javascript', 'typescript', 'bun'],
      });
    });

    test('should handle checkboxes', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input type="checkbox" name="agree" value="yes" checked />
        <input type="checkbox" name="newsletter" value="yes" />
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        agree: 'yes',
      });
    });

    test('should handle radio buttons', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input type="radio" name="color" value="red" />
        <input type="radio" name="color" value="blue" checked />
        <input type="radio" name="color" value="green" />
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        color: 'blue',
      });
    });

    test('should handle select elements', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <select name="country">
          <option value="us">USA</option>
          <option value="br" selected>Brazil</option>
        </select>
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        country: 'br',
      });
    });

    test('should handle textarea', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <textarea name="bio">This is my bio</textarea>
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        bio: 'This is my bio',
      });
    });

    test('should handle empty form', () => {
      // Arrange
      const form = document.createElement('form');
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({});
    });

    test('should handle mixed single and multiple values', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input name="name" value="John" />
        <input name="hobby" value="coding" />
        <input name="hobby" value="gaming" />
      `;
      document.body.appendChild(form);

      // Act
      const result = formToObject(form);

      // Assert
      expect(result).toEqual({
        name: 'John',
        hobby: ['coding', 'gaming'],
      });
    });
  });

  describe('onSubmit()', () => {
    test('should prevent default form submission', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = '<input name="test" value="value" />';
      document.body.appendChild(form);
      let prevented = false;
      const handler = onSubmit(() => {});

      // Act
      const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'currentTarget', { value: form, writable: false });
      Object.defineProperty(event, 'preventDefault', {
        value: () => { prevented = true; },
        writable: false
      });
      handler(event as any);

      // Assert
      expect(prevented).toBe(true);
    });

    test('should call callback with form data', () => {
      // Arrange
      const form = document.createElement('form');
      form.innerHTML = `
        <input name="username" value="alice" />
        <input name="age" value="25" />
      `;
      document.body.appendChild(form);
      let capturedData: any = null;
      const handler = onSubmit((data) => {
        capturedData = data;
      });

      // Act
      const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'currentTarget', { value: form, writable: false });
      Object.defineProperty(event, 'preventDefault', { value: () => {}, writable: false });
      handler(event as any);

      // Assert
      expect(capturedData).toEqual({
        username: 'alice',
        age: '25',
      });
    });

    test('should pass submit event to callback', () => {
      // Arrange
      const form = document.createElement('form');
      document.body.appendChild(form);
      let capturedEvent: any = null;
      const handler = onSubmit((data, e) => {
        capturedEvent = e;
      });

      // Act
      const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'currentTarget', { value: form, writable: false });
      Object.defineProperty(event, 'preventDefault', { value: () => {}, writable: false });
      handler(event as any);

      // Assert
      expect(capturedEvent).toBeTruthy();
      expect(capturedEvent.currentTarget).toBe(form);
    });
  });

  describe('onReset()', () => {
    test('should call handler with reset event', () => {
      // Arrange
      const form = document.createElement('form');
      let called = false;
      const handler = onReset(() => { called = true; });

      // Act
      const event = new Event('reset', { bubbles: true });
      Object.defineProperty(event, 'target', { value: form, writable: false });
      handler(event as any);

      // Assert
      expect(called).toBe(true);
    });
  });

  describe('onButtonClick()', () => {
    test('should call handler with click event', () => {
      // Arrange
      const button = document.createElement('button');
      let clicked = false;
      const handler = onButtonClick(() => { clicked = true; });

      // Act
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', { value: button, writable: false });
      handler(event as any);

      // Assert
      expect(clicked).toBe(true);
    });
  });
});
