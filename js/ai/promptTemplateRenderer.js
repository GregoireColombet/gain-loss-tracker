const templateCache = new Map();

export async function loadPromptTemplate(promptDefinition) {
  if (!promptDefinition?.file) {
    throw new Error('Prompt template file is missing.');
  }

  if (templateCache.has(promptDefinition.file)) {
    return templateCache.get(promptDefinition.file);
  }

  const response = await fetch(promptDefinition.file);
  if (!response.ok) {
    throw new Error(`Unable to load prompt template: ${promptDefinition.file}`);
  }

  const template = await response.text();
  templateCache.set(promptDefinition.file, template);
  return template;
}

export function renderPromptTemplate(template, parameters = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = parameters[key];
    return value === undefined || value === null || String(value).trim() === ''
      ? 'Not provided'
      : String(value).trim();
  });
}
