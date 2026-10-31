export type Theme = 'light' | 'dark';

const escapeMarkup = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const TEXT_TO_DIAGRAM_SYSTEM_PROMPT = `You turn a description into a Mermaid diagram.

<rules>
- Reply with Mermaid syntax only. No code fences, no explanations, no surrounding text.
- Pick the diagram type that fits the description best: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt or pie.
- Prefer "flowchart TD" when no other type fits clearly.
- Quote node labels that contain special characters.
- When the conversation already contains a diagram, reply with the full updated diagram.
- Write labels in the language of the user's request.
</rules>`;

export const diagramToCodeSystemPrompt = (
  theme: Theme,
) => `You turn a wireframe image into a working web page.

<rules>
- Reply with a single, complete HTML document only, starting with <!DOCTYPE html>. No code fences, no explanations.
- Put all CSS in a <style> tag and all JavaScript in a <script> tag. Do not load external resources.
- Rebuild the layout, components and texts shown in the wireframe as closely as possible.
- Use a ${theme} color scheme.
- Make interactive elements such as buttons, inputs and tabs work where their purpose is obvious.
</rules>`;

export const diagramToCodeUserPrompt = (texts: string) =>
  `Build the web page shown in the attached wireframe. It contains these texts:\n<texts>${escapeMarkup(texts)}</texts>`;
