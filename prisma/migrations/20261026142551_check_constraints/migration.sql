-- Data invariants that Prisma 7.10.1 cannot express in schema.prisma: `@@check` is not a
-- known attribute in this version, so the constraints §4 of ARCHITECTURE.md specifies live
-- here instead. Consequence to know before the next `prisma migrate dev`: Prisma does not
-- introspect CHECK constraints, so it may propose dropping them. It is wrong; keep them.
--
-- Every one of these is a privacy or money rule, not a tidiness rule:
--   * an identity CHECK is what makes "found by phone OR by BSUID" a real guarantee
--   * the card message CHECKs are why a card cannot smuggle a retailer or a cheaper
--     price to the owner through a gifter's free text
--   * the minor-unit CHECKs are why a float typo fails at write time instead of at payout

ALTER TABLE "users" ADD CONSTRAINT "users_has_identifier"
  CHECK ("bsuid" IS NOT NULL OR "phone_e164" IS NOT NULL);

ALTER TABLE "items" ADD CONSTRAINT "items_price_non_negative"
  CHECK ("price_minor" IS NULL OR "price_minor" >= 0);

ALTER TABLE "pools" ADD CONSTRAINT "pools_target_positive"
  CHECK ("target_minor" > 0);

ALTER TABLE "contributions" ADD CONSTRAINT "contributions_amount_positive"
  CHECK ("amount_minor" > 0);

ALTER TABLE "items" ADD CONSTRAINT "items_currency_is_alpha3"
  CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "pools" ADD CONSTRAINT "pools_currency_is_alpha3"
  CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "contributions" ADD CONSTRAINT "contributions_currency_is_alpha3"
  CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "card_entries" ADD CONSTRAINT "card_entries_message_length"
  CHECK ("message" IS NOT NULL AND char_length("message") BETWEEN 1 AND 200);

-- `!~*` is case-insensitive "does not match": the card is the one artefact the owner
-- eventually holds in their hands, so no link and no bare domain in a gifter's message.
ALTER TABLE "card_entries" ADD CONSTRAINT "card_entries_message_has_no_url"
  CHECK ("message" !~* 'https?://|www\.|[a-z0-9-]+\.(co\.za|com|co\.uk|net|org)/');

ALTER TABLE "card_entries" ADD CONSTRAINT "card_entries_display_name_length"
  CHECK (char_length("display_name_shown") BETWEEN 1 AND 40);
