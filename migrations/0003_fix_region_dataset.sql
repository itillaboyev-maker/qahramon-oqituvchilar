-- Safe canonical-region repair for the public nomination flow.
-- Goal: keep existing UUIDs intact while making the region dataset consistent.
-- This avoids deleting data or recreating rows unnecessarily.

DO $$
DECLARE
  canonical_region_id uuid;
  legacy_region_id uuid;
BEGIN
  SELECT id INTO canonical_region_id FROM regions WHERE code = 'FER' LIMIT 1;
  SELECT id INTO legacy_region_id FROM regions WHERE code = 'FAR' LIMIT 1;

  IF canonical_region_id IS NULL AND legacy_region_id IS NOT NULL THEN
    UPDATE regions
    SET code = 'FER', name_uz_latn = 'Farg''ona viloyati'
    WHERE id = legacy_region_id;
    canonical_region_id := legacy_region_id;
  ELSIF canonical_region_id IS NOT NULL AND legacy_region_id IS NOT NULL THEN
    UPDATE districts
    SET region_id = canonical_region_id
    WHERE region_id = legacy_region_id;

    DELETE FROM regions WHERE id = legacy_region_id;
  END IF;

  IF canonical_region_id IS NOT NULL THEN
    UPDATE regions
    SET name_uz_latn = 'Farg''ona viloyati'
    WHERE id = canonical_region_id;
  END IF;
END $$;
