I’ll extend the existing SIEMENSCH chat UI with a light/dark mode toggle, multiline chat input behavior, and an always-visible Obsidian-style vault graph in the top third of the chat area.

## Planned changes

1. Add light/dark mode
   - Add a small circular button in the top-right of the main header.
   - Use a sun/moon icon from the existing `lucide-react` icon set.
   - Toggle a `dark` class on the page root so the existing `.dark` theme tokens in `src/styles.css` can apply.
   - Adjust any dark-mode tokens as needed so the UI remains soft, readable, and not overly high-contrast.

2. Support Shift+Enter as a line break
   - Replace the current single-line `<input>` composer with a `<textarea>`.
   - Keep `Enter` as submit.
   - Make `Shift+Enter` insert a newline instead of submitting.
   - Preserve the current calm document-editor styling of the input box.
   - Render user messages with preserved line breaks so multiline prompts display correctly.

3. Add an Obsidian-style interactive node graph
   - Create an example “vault” data structure directly in the page:
     - One center/root node.
     - Two folder nodes branching from it.
     - Each folder has 3–4 `.md` file nodes as leaf/end nodes.
   - Visualize this graph all the time in the top one-third of the chat window, above the welcome/messages area.
   - Use an SVG-based graph to avoid adding heavy dependencies.
   - Make it interactive with hover/selection states:
     - Nodes highlight on hover/click.
     - Clicking a folder or file can show a small label/details state.
     - The graph remains lightweight and stable across viewport sizes.

4. Rebalance chat layout around the graph
   - Reserve roughly the top third of the main chat window for the graph.
   - Move the welcome text/messages below the graph.
   - Keep the bottom composer fixed in its current position.
   - Ensure the graph and chat area fit cleanly at the current preview size without clipping.

## Technical notes

- Primary edits will be in `src/routes/index.tsx`.
- Minor supporting theme refinements may be made in `src/styles.css`.
- I’ll avoid changing the clause panel, role selector, feedback dialog, upload dialog, or existing answer logic except where needed for multiline display.
- After implementation, I’ll run a build check to catch JSX or TypeScript syntax issues.