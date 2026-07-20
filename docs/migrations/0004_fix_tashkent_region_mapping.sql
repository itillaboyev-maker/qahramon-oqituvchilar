-- Fix Tashkent Region district mapping
-- Move Tashkent Region districts from TAS (Tashkent City)
-- to TA (Tashkent Region)

DO $$
DECLARE
    tashkent_city_id uuid;
    tashkent_region_id uuid;
BEGIN
    SELECT id
      INTO tashkent_city_id
    FROM regions
    WHERE code = 'TAS';

    SELECT id
      INTO tashkent_region_id
    FROM regions
    WHERE code = 'TA';

    IF tashkent_city_id IS NULL THEN
        RAISE EXCEPTION 'Region code TAS not found';
    END IF;

    IF tashkent_region_id IS NULL THEN
        RAISE EXCEPTION 'Region code TA not found';
    END IF;

    UPDATE districts
    SET region_id = tashkent_region_id
    WHERE region_id = tashkent_city_id
      AND code IN (
        'TAS_NUR_C',
        'TAS_OLM_C',
        'TAS_ANG_C',
        'TAS_BEK_C',
        'TAS_CHR_C',
        'TAS_OHA_C',
        'TAS_YNL_C',
        'TAS_OQQ_D',
        'TAS_OHA_D',
        'TAS_BEK_R',
        'TAS_BOS_D',
        'TAS_BOK_D',
        'TAS_ZAN_D',
        'TAS_QIB_D',
        'TAS_QUY_D',
        'TAS_PAR_D',
        'TAS_PIS_D',
        'TAS_ORT_D',
        'TAS_CHN_D',
        'TAS_YUQ_D',
        'TAS_YNL_D',
        'TAS_TOS_D'
      );
END $$;