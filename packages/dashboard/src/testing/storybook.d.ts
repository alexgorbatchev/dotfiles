declare module "@storybook/preact" {
  import type { JSX } from "preact";

  type StoryRender = () => JSX.Element;

  export interface Meta<TComponent = unknown> {
    title: string;
    component?: TComponent;
    render?: StoryRender;
    parameters?: Record<string, unknown>;
  }

  export interface StoryObj<TMeta = unknown> {
    render?: StoryRender;
    parameters?: Record<string, unknown>;
    args?: Record<string, unknown>;
  }
}
