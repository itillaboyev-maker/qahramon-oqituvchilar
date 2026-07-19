-- Seed: 14 administrative regions of Uzbekistan (Latin names; Cyrillic/RU/EN can be
-- filled in later without a schema change — see the i18n adjustment in the architecture).
INSERT INTO regions (code, name_uz_latn) VALUES
  ('TAS', 'Toshkent shahri'),
  ('TA',  'Toshkent viloyati'),
  ('AND', 'Andijon viloyati'),
  ('BUX', 'Buxoro viloyati'),
  ('FAR', 'Farg''ona viloyati'),
  ('JIZ', 'Jizzax viloyati'),
  ('XOR', 'Xorazm viloyati'),
  ('NAM', 'Namangan viloyati'),
  ('NAV', 'Navoiy viloyati'),
  ('QAS', 'Qashqadaryo viloyati'),
  ('QOR', 'Qoraqalpog''iston Respublikasi'),
  ('SAM', 'Samarqand viloyati'),
  ('SIR', 'Sirdaryo viloyati'),
  ('SUR', 'Surxondaryo viloyati')
ON CONFLICT (code) DO NOTHING;
