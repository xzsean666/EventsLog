import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountDevTools } from '../src/devtools';
import { EventsLogBrowserClient } from '../src/client';
import { Event } from '../src/protocol/types';

// Mock lightweight DOM node for Node/Vitest environment
class MockHTMLElement {
  id = '';
  style: Record<string, string> & { cssText?: string } = {};
  innerHTML = '';
  children: MockHTMLElement[] = [];
  parentElement: MockHTMLElement | null = null;
  listeners: Map<string, Array<() => void>> = new Map();

  addEventListener(event: string, cb: () => void) {
    const list = this.listeners.get(event) || [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  dispatchEvent(event: string) {
    const list = this.listeners.get(event) || [];
    list.forEach((cb) => cb());
  }

  appendChild(child: MockHTMLElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  querySelector(selector: string): MockHTMLElement | null {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      return this.findChild((c) => c.id === targetId);
    }
    return null;
  }

  querySelectorAll(_selector: string): MockHTMLElement[] {
    return [];
  }

  private findChild(predicate: (node: MockHTMLElement) => boolean): MockHTMLElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }
}

describe('Browser Embedded DevTools', () => {
  let originalDocument: any;
  let originalWindow: any;
  let mockBody: MockHTMLElement;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;

    mockBody = new MockHTMLElement();
    mockBody.id = 'body';

    (globalThis as any).document = {
      body: mockBody,
      createElement: () => new MockHTMLElement(),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it('safely returns no-op controller in non-browser environments', () => {
    (globalThis as any).document = undefined;
    (globalThis as any).window = undefined;

    const mockClient = {
      storage: {
        listExecutions: async () => [],
        listFunctions: async () => [],
        clear: async () => {},
      },
    } as unknown as EventsLogBrowserClient;

    const controller = mountDevTools(mockClient);
    expect(controller.isOpen()).toBe(false);
    controller.open();
    expect(controller.isOpen()).toBe(false);
    controller.toggle();
    controller.close();
    controller.destroy();
  });

  it('mounts floating trigger button and drawer to document body', () => {
    const mockClient = {
      storage: {
        listExecutions: async () => [],
        listFunctions: async () => [],
        clear: async () => {},
      },
    } as unknown as EventsLogBrowserClient;

    const controller = mountDevTools(mockClient);
    expect(controller.isOpen()).toBe(false);

    // Root should be attached to mockBody
    expect(mockBody.children.length).toBe(1);
    const root = mockBody.children[0];
    expect(root.id).toBe('eventslog-devtools-root');

    // Drawer opens and closes
    controller.open();
    expect(controller.isOpen()).toBe(true);

    controller.close();
    expect(controller.isOpen()).toBe(false);

    controller.toggle();
    expect(controller.isOpen()).toBe(true);

    // Destroy removes from body
    controller.destroy();
    expect(mockBody.children.length).toBe(0);
  });

  it('auto-mounts devtools controller when devtools: true is specified in client config', () => {
    const client = new EventsLogBrowserClient({
      serviceName: 'test-app',
      devtools: true,
      mode: 'local',
    });

    expect(client.devtoolsController).toBeDefined();
    expect(mockBody.children.length).toBe(1);

    client.destroy();
    expect(mockBody.children.length).toBe(0);
  });
});
