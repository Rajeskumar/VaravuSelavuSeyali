-- One-time manual seed for trackspense.card_catalog / card_earning_rules
-- Generated from alembic/versions/609704f8daf2_seed_card_catalog.py -- same deterministic
-- uuid5 ids as the migration, so this is safe to run even if the migration later applies
-- correctly (ON CONFLICT (id) DO NOTHING makes both idempotent and order-independent).
BEGIN;

INSERT INTO trackspense.card_catalog
  (id, issuer, card_name, reward_type, points_currency_name, point_value_estimate_usd, annual_fee, source_url, last_verified_at, is_active)
VALUES
  ('94ded1ca-6976-5b09-9122-ac545bc8e610', 'Chase', 'Chase Sapphire Preferred', 'points', 'Ultimate Rewards', 0.0125, 95.0, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-17T00:00:00+00:00', TRUE),
  ('8f4df56b-5d38-5ad9-96ec-a391cf455700', 'U.S. Bank', 'U.S. Bank Altitude Go', 'points', NULL, 0.01, 0.0, 'https://www.usbank.com/credit-cards/altitude-go-visa-signature-credit-card.html', '2026-08-17T00:00:00+00:00', TRUE),
  ('dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Wells Fargo', 'Wells Fargo Autograph Visa', 'points', NULL, 0.01, 0.0, 'https://www.wellsfargo.com/credit-cards/autograph-visa/terms/', '2026-08-17T00:00:00+00:00', TRUE),
  ('d118fdfc-db6e-57a3-bee3-66596cee6f61', 'Wells Fargo', 'Wells Fargo Autograph Journey Visa', 'points', NULL, 0.01, 95.0, 'https://www.wellsfargo.com/credit-cards/autograph-journey-visa/terms/', '2026-08-17T00:00:00+00:00', TRUE),
  ('e8a4a0fe-d7c8-5954-9c75-05ca9b0afa2c', 'BCU', 'BCU Cash Rewards Visa Signature', 'cashback', NULL, NULL, 0.0, 'https://www.bcu.org/credit-cards/cash-rewards', '2026-08-17T00:00:00+00:00', TRUE),
  ('9f583a89-4500-58f7-871e-7d482ad9723a', 'Chase', 'Chase Freedom Unlimited', 'cashback', NULL, NULL, 0.0, 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-17T00:00:00+00:00', TRUE),
  ('b496587f-43f2-51bf-9b3b-a73ec47d5c51', 'Capital One', 'Capital One Quicksilver', 'cashback', NULL, NULL, 0.0, 'https://www.capitalone.com/credit-cards/quicksilver/', '2026-08-17T00:00:00+00:00', TRUE),
  ('a6c1713a-ed02-5c31-a7ec-c9219742dfa6', 'Apple', 'Apple Card', 'cashback', NULL, NULL, 0.0, 'https://www.apple.com/apple-card/', '2026-08-17T00:00:00+00:00', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO trackspense.card_earning_rules
  (id, card_id, category_id, multiplier, cap_amount, cap_period, exclusions_note)
VALUES
  ('428aa389-fa0e-5eb6-87d9-ffa2af6215ac', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'All Purchases', 1.0, NULL, NULL, NULL),
  ('7dfb50c5-d55d-54e8-a850-bf7ea6eaf558', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Dining out', 3.0, NULL, NULL, NULL),
  ('8c8353cb-527e-5cb0-946e-c150b585a55a', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Gas/fuel', 3.0, NULL, NULL, 'at select top brands only, per issuer terms; EV charging also included'),
  ('27ba90df-2667-54bb-945e-a8dec506ee56', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Groceries', 3.0, NULL, NULL, 'online grocery only (not in-store); excludes Target, Walmart, wholesale clubs. Also covers select streaming services.'),
  ('a0d9badf-62e3-5fd2-84c6-932e26d11273', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Plane', 2.0, NULL, NULL, '5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn''t tracked'),
  ('417f277c-3f1c-57e8-b31a-15490b3b9a81', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Hotel', 2.0, NULL, NULL, '5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn''t tracked'),
  ('bcf52176-9adf-5cb8-bf89-789a9926212c', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Car', 2.0, NULL, NULL, '5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn''t tracked'),
  ('c22d4f3c-5d28-5a0e-ba45-c90b05a06f6e', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Bus/Train', 2.0, NULL, NULL, '5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn''t tracked'),
  ('611f9a00-7078-5f0d-bc23-8af079e4f0b8', '94ded1ca-6976-5b09-9122-ac545bc8e610', 'Taxi', 2.0, NULL, NULL, '5x instead if booked through the Chase Travel portal — not reflected here since booking channel isn''t tracked'),
  ('84a76ab7-b11a-5157-9610-4dfaed9c8759', '8f4df56b-5d38-5ad9-96ec-a391cf455700', 'All Purchases', 1.0, NULL, NULL, NULL),
  ('b397aab9-bd3e-5333-8c38-1fcf1243f68d', '8f4df56b-5d38-5ad9-96ec-a391cf455700', 'Dining out', 4.0, 2000, 'quarterly', 'after the $2,000/quarter cap, reverts to 1x on additional dining purchases'),
  ('99066b37-573f-5528-83a9-42e727a6e987', '8f4df56b-5d38-5ad9-96ec-a391cf455700', 'Groceries', 2.0, NULL, NULL, 'excludes discount stores/supercenters and wholesale clubs'),
  ('a8debf40-1b90-5f19-804a-efd77733dff1', '8f4df56b-5d38-5ad9-96ec-a391cf455700', 'Gas/fuel', 2.0, NULL, NULL, 'excludes discount stores/supercenters and wholesale clubs; EV charging included'),
  ('12d7dfdf-d74e-5438-a009-207a1c822475', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'All Purchases', 1.0, NULL, NULL, NULL),
  ('14cf6261-2c73-5768-9dd0-cd0fe645367a', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Dining out', 3.0, NULL, NULL, 'excludes bakeries, grocery stores, and third-party delivery services'),
  ('6e8e69d7-4105-5746-bf2b-3f85800da421', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Gas/fuel', 3.0, NULL, NULL, 'excludes auto repair, superstores, car washes, warehouse clubs, and groceries'),
  ('6eda8244-0217-5229-a496-00e6dc024aa4', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Movies', 3.0, NULL, NULL, 'part of this card''s broader entertainment bonus (also covers books, streaming, digital goods — not separately tracked since "Other" is ambiguous across multiple main categories in this app''s taxonomy)'),
  ('551eef96-2e88-53d3-8927-dbea40cc4d42', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Music', 3.0, NULL, NULL, 'part of this card''s broader entertainment bonus (also covers books, streaming, digital goods, movies)'),
  ('1a60f387-12af-55d3-aa8d-d669b3e224ec', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'TV/Phone/Internet', 3.0, NULL, NULL, 'landline/cell phone bills only — does not cover cable TV or home internet; excludes insurance, accessories, bundled/third-party-billed services'),
  ('38800554-b040-59da-8be5-43d7082082dc', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Taxi', 3.0, NULL, NULL, 'part of this card''s local-transport bonus (also covers ferries, limousines, toll bridges — not separately tracked)'),
  ('7dd15a3e-f83a-5c97-a6ba-8b09f5998982', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Bus/Train', 3.0, NULL, NULL, 'passenger railway, part of this card''s local-transport bonus'),
  ('4dd0ad7a-87a4-51a5-a80a-071bb83742ae', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Parking', 3.0, NULL, NULL, 'parking lots and garages, part of this card''s local-transport bonus'),
  ('66d6300f-63f2-56de-a674-485135612757', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Plane', 3.0, NULL, NULL, 'airlines, part of this card''s travel bonus (also covers cruise lines, travel agencies, campgrounds, timeshares — not separately tracked)'),
  ('b2af8ee4-4a5c-5117-a060-cfd2342143de', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Hotel', 3.0, NULL, NULL, 'hotels/motels, part of this card''s travel bonus'),
  ('63f2263b-82e9-5247-838c-00562deafed7', 'dbc912fd-21a5-5589-95c9-34ed35d1ee04', 'Car', 3.0, NULL, NULL, 'vehicle/auto rentals, part of this card''s travel bonus'),
  ('4737874e-97d4-5e0f-8d67-551c86fdd8cd', 'd118fdfc-db6e-57a3-bee3-66596cee6f61', 'All Purchases', 1.0, NULL, NULL, NULL),
  ('e5c39aa6-e743-5e7b-ab35-fc983978f00c', 'd118fdfc-db6e-57a3-bee3-66596cee6f61', 'Hotel', 5.0, NULL, NULL, 'dedicated hotel bonus, separate from this card''s general travel bonus'),
  ('dff50191-e946-51f6-9812-7ece05dcf5da', 'd118fdfc-db6e-57a3-bee3-66596cee6f61', 'Plane', 4.0, NULL, NULL, 'dedicated airline/air-carrier bonus, separate from this card''s general travel bonus'),
  ('02f10b8a-93a1-5ce7-b21d-274849c4c315', 'd118fdfc-db6e-57a3-bee3-66596cee6f61', 'Dining out', 3.0, NULL, NULL, 'excludes bakeries, grocery stores, and third-party delivery services'),
  ('5935ddd9-b1e7-560f-9f32-edf31207fcf8', 'd118fdfc-db6e-57a3-bee3-66596cee6f61', 'Car', 3.0, NULL, NULL, 'vehicle rentals, part of this card''s general travel bonus (also covers campgrounds, timeshares, cruise lines, travel agencies — not separately tracked)'),
  ('6ede878c-556c-546f-8102-7b48f38ec887', 'e8a4a0fe-d7c8-5954-9c75-05ca9b0afa2c', 'All Purchases', 2.0, NULL, NULL, 'flat rate, no categories, per issuer''s own "no categories or guesswork" language; requires a $5,000+ credit line — the lower-line Cash Rewards Visa Platinum tier (1.5%) is a different product, not tracked here'),
  ('759c06b6-1d04-5d42-9925-c4190dd16abf', '9f583a89-4500-58f7-871e-7d482ad9723a', 'All Purchases', 1.5, NULL, NULL, NULL),
  ('8bb8cd1d-f711-5c53-b5aa-cea9a1255eed', '9f583a89-4500-58f7-871e-7d482ad9723a', 'Dining out', 3.0, NULL, NULL, 'includes takeout and eligible delivery services'),
  ('9ac40622-3725-57ec-afe8-f472d689832c', 'b496587f-43f2-51bf-9b3b-a73ec47d5c51', 'All Purchases', 1.5, NULL, NULL, NULL),
  ('25185e98-caa2-58f2-b702-3064a75a44c6', 'a6c1713a-ed02-5c31-a7ec-c9219742dfa6', 'All Purchases', 2.0, NULL, NULL, 'Apple Pay rate used as baseline; physical (titanium) card swipes actually earn only 1% — no payment-method dimension in this schema yet'),
  ('5dafcb85-5459-5ec4-9068-676de01f1876', 'a6c1713a-ed02-5c31-a7ec-c9219742dfa6', 'Electronics', 3.0, NULL, NULL, 'proxy for "purchases at Apple" — also applies to non-Apple electronics merchants (overstates), and excludes Apple services like App Store/iCloud (understates)')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify:
-- SELECT count(*) FROM trackspense.card_catalog;
-- SELECT count(*) FROM trackspense.card_earning_rules;