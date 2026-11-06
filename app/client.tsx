import { createInertiaApp, type ResolvedComponent } from "@inertiajs/react";
import { createRoot } from "react-dom/client";

const pages = import.meta.glob<{ default: ResolvedComponent }>("./pages/*.tsx");

void createInertiaApp({
  resolve: async (name) => (await pages[`./pages/${name}.tsx`]!()).default,
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
