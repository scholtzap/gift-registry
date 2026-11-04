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
      'No. Piñata opens in your browser. Create a circle, then share its link with your group.',
  },
  {
    question: 'How do friends join?',
    answer:
      'They open the circle link you shared, enter the name they want on the gift card, and the number that was invited. If they are not on the list yet, they can ask and you let them in.',
  },
] as const;
