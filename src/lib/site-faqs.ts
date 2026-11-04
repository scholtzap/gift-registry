/**
 * Public FAQ facts shared by on-page marketing copy and `/llms.txt`.
 * Keep answers accurate; never invent rates or unpublished product claims.
 */
export const SITE_FAQS = [
  {
    question: 'Does Piñata hold our money?',
    answer:
      'No. Friends pay each other directly. Piñata only records who pledged what and who has marked it paid.',
  },
  {
    question: 'Which currencies does it use?',
    answer:
      "US dollars by default. You can price each gift in rand, euro or pounds instead, and a pool always uses its gift's currency.",
  },
  {
    question: 'Do I need to install an app?',
    answer:
      "No. It opens in the browser from the link in your WhatsApp group. Friends need to be on the circle's invite list.",
  },
  {
    question: 'Does the AI decide anything?',
    answer:
      'No. It turns a voice note, photo or link into a draft, and a person confirms it. You can switch each AI feature off in Settings.',
  },
] as const;
