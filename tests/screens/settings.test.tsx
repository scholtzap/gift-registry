import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsScreen, type CapabilitySetting } from '../../src/components/screens/settings';

const voice: CapabilitySetting = {
  capability: 'voice_transcribe',
  label: 'Voice transcription',
  description: 'Turn voice notes into gift details. When off, type the gift instead.',
  enabled: true,
};

const art: CapabilitySetting = {
  capability: 'card_art',
  label: 'Generated card art',
  description: 'Generate a card background. When off, use the plain card.',
  enabled: false,
};

function render(settings: CapabilitySetting[], notice?: string, basePath = '/account') {
  return renderToStaticMarkup(createElement(SettingsScreen, { settings, basePath, notice }));
}

function forms(markup: string) {
  return [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map((match) => ({
    attributes: match[1]!,
    content: match[2]!,
  }));
}

function inputValue(form: string, name: string) {
  const input = [...form.matchAll(/<input\b[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => tag.includes(`name="${name}"`));
  expect(input).toBeDefined();
  expect(input).toContain('type="hidden"');
  return input!.match(/\bvalue="([^"]*)"/)?.[1];
}

function text(markup: string) {
  return markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('SettingsScreen', () => {
  it('shows an enabled capability as On and submits false to disable it', () => {
    const markup = render([voice]);
    const [form] = forms(markup);

    expect(form).toBeDefined();
    expect(form!.attributes).toContain('method="post"');
    expect(form!.attributes).toContain('action="/account/settings"');
    expect(inputValue(form!.content, 'capability')).toBe('voice_transcribe');
    expect(inputValue(form!.content, 'enabled')).toBe('false');
    expect(inputValue(form!.content, 'intent')).toBe('toggle');
    expect(form!.content).toMatch(/<button\b[^>]*type="submit"[^>]*>Disable Voice transcription<\/button>/);
    expect(text(markup)).toMatch(/Voice transcription.*\bOn\b/);
    expect(markup).toContain(voice.description);
  });

  it('shows a disabled capability as Off and submits true to enable it', () => {
    const markup = render([art]);
    const [form] = forms(markup);

    expect(inputValue(form!.content, 'capability')).toBe('card_art');
    expect(inputValue(form!.content, 'enabled')).toBe('true');
    expect(inputValue(form!.content, 'intent')).toBe('toggle');
    expect(form!.content).toMatch(/<button\b[^>]*type="submit"[^>]*>Enable Generated card art<\/button>/);
    expect(text(markup)).toMatch(/Generated card art.*\bOff\b/);
    expect(markup).toContain(art.description);
  });

  it('keeps each inverse payload in its own form on the supplied private base path', () => {
    const markup = render([voice, art], undefined, '/me');
    const renderedForms = forms(markup);

    expect(renderedForms).toHaveLength(2);
    for (const form of renderedForms) {
      expect(form.attributes).toContain('action="/me/settings"');
      expect(form.attributes).toContain('method="post"');
      expect(inputValue(form.content, 'intent')).toBe('toggle');
      expect([...form.content.matchAll(/<input\b/g)]).toHaveLength(3);
      expect([...form.content.matchAll(/<button\b/g)]).toHaveLength(1);
    }
    expect(inputValue(renderedForms[0]!.content, 'enabled')).toBe('false');
    expect(inputValue(renderedForms[1]!.content, 'enabled')).toBe('true');
    expect(markup).not.toMatch(/name="(?:userId|actor|circleId|plan)"/);
    expect(markup).not.toContain('/c/');
  });

  it('associates each named form with its visible state and fallback description', () => {
    const renderedForms = forms(render([voice, art]));
    const ids: string[] = [];

    renderedForms.forEach((form, index) => {
      const labelId = form.attributes.match(/aria-labelledby="([^"]+)"/)?.[1];
      const describedBy = form.attributes.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ');
      expect(labelId).toBeTruthy();
      expect(describedBy).toHaveLength(2);
      const [stateId, descriptionId] = describedBy!;
      const setting = [voice, art][index]!;

      expect(form.content).toContain(`<h3 id="${labelId}">${setting.label}</h3>`);
      expect(form.content).toMatch(new RegExp(`<span id="${stateId}">[\\s\\S]*?${setting.enabled ? 'On' : 'Off'}<\\/span>`));
      expect(form.content).toContain(`<p id="${descriptionId}" class="pn-muted">${setting.description}</p>`);
      ids.push(labelId!, stateId!, descriptionId!);
    });
    expect(new Set(ids).size).toBe(6);
  });

  it('escapes parent-supplied labels and descriptions instead of treating them as markup', () => {
    const markup = render([{
      ...voice,
      label: '<b>A choice</b>',
      description: '<img src=x onerror=alert(1)>',
    }]);

    expect(markup).toContain('&lt;b&gt;A choice&lt;/b&gt;');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<b>A choice</b>');
    expect(markup).not.toContain('<img src=x');
  });

  it('renders only supplied settings, with their own labels and descriptions', () => {
    const setting: CapabilitySetting = {
      capability: 'parent_supplied_capability',
      label: 'A private choice',
      description: 'Parent-provided description and manual fallback.',
      enabled: false,
    };
    const markup = render([setting]);

    expect(forms(markup)).toHaveLength(1);
    expect(markup).toContain(setting.label);
    expect(markup).toContain(setting.description);
    expect(inputValue(forms(markup)[0]!.content, 'capability')).toBe(setting.capability);
    expect(markup).not.toMatch(/voice_transcribe|card_art|deal_search|premium|billing|payment/i);
  });

  it('shows an empty state rather than inventing capability or plan states', () => {
    const markup = render([]);

    expect(forms(markup)).toHaveLength(0);
    expect(text(markup)).toContain('No capability settings to show.');
    expect(markup).not.toMatch(/voice_transcribe|card_art|deal_search|premium|billing|payment/i);
    expect(text(markup)).not.toMatch(/\b(?:On|Off)\b/);
  });

  it('names the page, explains personal consent and describes manual fallbacks plainly', () => {
    const markup = render([voice, art]);
    const content = text(markup);

    expect(markup).toMatch(/<h1\b[^>]*>Settings<\/h1>/);
    expect(markup).toMatch(/<h2\b[^>]*>AI capabilities<\/h2>/);
    expect(content).toContain('These settings only change what Piñata does for you, and nobody else can see them.');
    expect(content).toContain('Turn AI on for the actions you want help with');
    expect(content).toContain('will not use AI for it');
    expect(content).toContain('type gift details yourself');
    expect(content).toContain('plain card');
    expect(markup).not.toContain('role="switch"');
  });

  it('renders an optional notice as escaped status text without overriding gate states', () => {
    const notice = 'Could not check capabilities. <script>not markup</script>';
    const markup = render([voice], notice);

    expect(markup).toMatch(/role="status"/);
    expect(markup).toContain('&lt;script&gt;not markup&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    expect(text(markup)).toMatch(/Voice transcription.*\bOn\b/);
    expect(inputValue(forms(markup)[0]!.content, 'enabled')).toBe('false');
    expect(markup).not.toMatch(/model (?:is )?off|you (?:have )?turned.*off/i);
  });

  it('does not render an empty notice or interpret unavailability as Off', () => {
    expect(render([voice])).not.toContain('role="status"');
    const markup = render([], 'Settings are unavailable. Try again.');

    expect(forms(markup)).toHaveLength(0);
    expect(text(markup)).toContain('Settings are unavailable. Try again.');
    expect(text(markup)).not.toMatch(/\bOff\b|model (?:is )?off/);
  });
});
